import { PARAMS } from '../engine/constants';
import { FlowZone } from '../engine/elements';
import { CellGrid } from '../engine/grid';
import { Sim } from '../engine/pbf';
import type { Doc } from '../model/doc';
import { computeNets } from '../model/nets';
import { calFor, gammaForResistance, SHAFT_G_FACTOR, ZONE_FLOW_BIAS, type Cal } from './calibration';
import { dcWindows, type DcCond } from './dc';
import { buildLayout, type Layout, type Rect, type Vessel } from './layout';
import { cavityOutline, type Seg } from './outline';

export class CompileError extends Error {}

export type { Rect };

const GAMMA_SWITCH_CLOSED = 8;
const GAMMA_SWITCH_OPEN = 1e5;
/** opór otwartego zaworu (dioda, LED, bezpiecznik) [Ω] */
const R_VALVE = 12;
/** masa FlowZone dla cewki 1 H: stała czasowa RL = m·R/50 ≈ 1,6 s przy 47 Ω (widać bezwładność), okres LC ≈ 2π·√(m·C) */
const INDUCTOR_M = 1.5;
/** pojemność tłoka kondensatora pływającego [komórki²/komórkę] na 1 µF, razy k */
const CAP_CELLS_PER_UF = 0.3;
/** okres źródła AC [s] dla k=1; rośnie z √k (większe naczynia chlapią wolniej) */
export const AC_PERIOD = 10;
export const acPeriod = (k: number) => AC_PERIOD * Math.sqrt(k);
/** wysokość kieszeni powietrza nad brzegiem naczynia (zgodna z layout.ts) */
const POCKET = 6;

type CondType = 'resistor' | 'bulb' | 'switch' | 'diode' | 'led' | 'fuse' | 'inductor' | 'capacitor';
interface Cond {
  id: string;
  type: CondType;
  netA: string;
  netB: string;
}
interface Source {
  id: string;
  type: 'battery' | 'supply' | 'ac';
  plus: string;
  volts: number;
}

export interface TankInfo {
  net: string;
  /** wnętrze naczynia od dna do brzegu */
  rect: Rect;
  floorY: number;
  rimY: number;
  nomY: number;
}

export interface CondInfo {
  id: string;
  type: CondType;
  netA: string;
  netB: string;
  zone: Rect;
  /** 'slot': strefa pozioma (przepływ w osi x), 'shaft': strefa pionowa (przepływ w dół do masy) */
  kind: 'slot' | 'shaft';
  /** znak prądu: +1, jeśli dodatni przepływ osi (x dla poziomej, w dół dla pionowej) idzie z portu A do B */
  sign: 1 | -1;
}

class Ema {
  v = 0;
  primed = false;
  push(x: number, dt: number, tau: number) {
    if (!this.primed) {
      this.v = x;
      this.primed = true;
      return;
    }
    this.v += (1 - Math.exp(-dt / tau)) * (x - this.v);
  }
}

export class World {
  sim!: Sim;
  layout!: Layout;
  /** kontur jam (cienkie linie do rysowania) */
  outline: Seg[] = [];
  k = 1;
  cal: Cal = calFor(1);
  /** strefy wymuszonego przepływu: cewki i kondensatory pływające */
  flows = new Map<string, { z: FlowZone; sign: 1 | -1 }>();
  W = 0;
  H = 0;
  /** naczynia (sieci) razem z basenem masy */
  tanks = new Map<string, TankInfo>();
  gnd!: TankInfo;
  conds: CondInfo[] = [];
  sources: { id: string; type: 'battery' | 'supply' | 'ac'; plus: string; volts: number }[] = [];
  /** wygładzone: napięcie sieci względem GND [V] */
  private vEma = new Map<string, Ema>();
  private iEma = new Map<string, Ema>();
  private servoAcc = new Map<string, number>();
  time = 0;
  /** zawory sterowane napięciem/przepływem: dioda, LED, bezpiecznik */
  private dyn = new Map<string, { type: 'diode' | 'led' | 'fuse'; gammaOn: number; thr: number; a: number; over: number }>();
  /** przepalone bezpieczniki */
  blown = new Set<string>();
  /** zakresy napięć z solvera DC (do sprawdzania, czy węzeł mieści się w oknie naczynia) */
  windows = new Map<string, { nom: number; lo: number; hi: number }>();

  /** napięcie sieci względem masy [V] */
  voltage(net: string): number {
    if (net === this.gnd.net) return 0;
    return this.vEma.get(net)?.v ?? 0;
  }

  /** prąd elementu od portu A do B [A] */
  current(compId: string): number {
    return this.iEma.get(compId)?.v ?? 0;
  }

  /** moc wydzielana w elemencie [W] */
  power(compId: string): number {
    const c = this.conds.find((x) => x.id === compId);
    if (!c) return 0;
    return Math.abs((this.voltage(c.netA) - this.voltage(c.netB)) * this.current(compId));
  }

  /** liczba cząstek w naczyniu (wnętrze plus kieszeń powietrza nad brzegiem) */
  private count(t: TankInfo): number {
    const r = t.rect;
    return this.sim.countIn(r.x0, r.y0, r.x1, t.rimY + POCKET);
  }

  /** poziom wody nad dnem naczynia [komórki] */
  rawLevel(t: TankInfo): number {
    return this.count(t) / (t.rect.x1 - t.rect.x0);
  }

  /** bezwzględna wysokość lustra wody [komórki] (dno + poziom) */
  surfaceY(t: TankInfo): number {
    return t.floorY + this.rawLevel(t);
  }

  setSwitch(compId: string, closed: boolean): void {
    const c = this.conds.find((x) => x.id === compId && x.type === 'switch');
    if (!c) return;
    this.sim.grid.setGamma(c.zone.x0, c.zone.y0, c.zone.x1, c.zone.y1, closed ? GAMMA_SWITCH_CLOSED : GAMMA_SWITCH_OPEN);
  }

  step(dt: number = PARAMS.dt): void {
    this.sim.step(dt);
    this.time += dt;
    for (const f of this.flows.values()) f.z.step(dt);
    this.measure(dt);
    this.servo(dt);
    this.valves(dt);
  }

  /** stopień otwarcia zaworu 0..1 (do rysowania i diagnostyki) */
  aperture(compId: string): number {
    return this.dyn.get(compId)?.a ?? 0;
  }

  /** Dioda/LED: apertura rośnie od progu; bezpiecznik pęka po zbyt długim przekroczeniu prądu. */
  private valves(dt: number): void {
    for (const c of this.conds) {
      const d = this.dyn.get(c.id);
      if (!d) continue;
      let target: number;
      if (d.type === 'fuse') {
        if (!this.blown.has(c.id) && Math.abs(this.current(c.id)) > d.thr) d.over += dt;
        else if (!this.blown.has(c.id)) d.over = Math.max(0, d.over - dt * 0.5);
        if (d.over > 0.6) this.blown.add(c.id);
        target = this.blown.has(c.id) ? 0 : 1;
      } else {
        const dv = this.voltage(c.netA) - this.voltage(c.netB); // anoda minus katoda
        target = Math.max(0, Math.min(1, (dv - d.thr) / 0.4));
      }
      d.a += (1 - Math.exp(-dt / 0.05)) * (target - d.a);
      const z = c.zone;
      const gamma = d.a < 0.02 ? 1e5 : Math.min(1e5, d.gammaOn / d.a);
      this.sim.grid.setGamma(z.x0, z.y0, z.x1, z.y1, gamma);
    }
  }

  registerValves(list: { id: string; type: 'diode' | 'led' | 'fuse'; gammaOn: number; thr: number }[]): void {
    for (const v of list) this.dyn.set(v.id, { type: v.type, gammaOn: v.gammaOn, thr: v.thr, a: v.type === 'fuse' ? 1 : 0, over: 0 });
  }

  /**
   * Zmiana wartości elementu w locie, bez przebudowy świata (suwaki w panelu).
   * Zwraca false, jeśli element wymaga ponownej kompilacji (np. pojemność, napięcie baterii).
   */
  setValue(id: string, value: number): boolean {
    const c = this.conds.find((x) => x.id === id);
    if (c && (c.type === 'resistor' || c.type === 'bulb')) {
      const gamma = gammaForResistance(c.kind === 'shaft' ? value * SHAFT_G_FACTOR : value);
      const z = c.zone;
      this.sim.grid.setGamma(z.x0, z.y0, z.x1, z.y1, gamma);
      return true;
    }
    if (c && (c.type === 'diode' || c.type === 'led' || c.type === 'fuse')) {
      const d = this.dyn.get(id);
      if (d) d.thr = value;
      if (c.type === 'fuse') this.resetFuse(id); // zmiana wartości = wymiana bezpiecznika
      return true;
    }
    const src = this.sources.find((x) => x.id === id);
    if (src && src.type !== 'battery') {
      src.volts = value;
      return true;
    }
    return false;
  }

  /** wymiana przepalonego bezpiecznika */
  resetFuse(compId: string): void {
    this.blown.delete(compId);
    const d = this.dyn.get(compId);
    if (d) d.over = 0;
  }

  private measure(dt: number): void {
    const gl = this.surfaceY(this.gnd);
    for (const t of this.tanks.values()) {
      const v = (this.surfaceY(t) - gl) / this.cal.cellsPerVolt;
      let e = this.vEma.get(t.net);
      if (!e) this.vEma.set(t.net, (e = new Ema()));
      e.push(v, dt, 0.1);
    }
    for (const c of this.conds) {
      const fl = this.flows.get(c.id);
      if (fl) {
        let e = this.iEma.get(c.id);
        if (!e) this.iEma.set(c.id, (e = new Ema()));
        e.push((fl.sign * fl.z.I) / this.cal.particlesPerAmpere, dt, 0.1);
        continue;
      }
      const z = c.zone;
      const { sum, count } = c.kind === 'slot' ? this.sim.vxIn(z.x0, z.y0, z.x1, z.y1) : this.vyIn(z);
      if (count < 3) continue;
      const mean = sum / count;
      const crossSection = c.kind === 'slot' ? z.y1 - z.y0 : z.x1 - z.x0;
      // dla szybu dodatni przepływ to w dół, czyli −vy
      const q = c.kind === 'slot' ? mean * crossSection : -mean * crossSection;
      let e = this.iEma.get(c.id);
      if (!e) this.iEma.set(c.id, (e = new Ema()));
      e.push((c.sign * q) / ZONE_FLOW_BIAS / this.cal.particlesPerAmpere, dt, 0.25);
    }
  }

  private vyIn(z: Rect): { sum: number; count: number } {
    const s = this.sim;
    let sum = 0;
    let count = 0;
    for (let i = s.nB; i < s.n; i++) {
      if (s.px[i] >= z.x0 && s.px[i] < z.x1 && s.py[i] >= z.y0 && s.py[i] < z.y1) {
        sum += s.vy[i];
        count++;
      }
    }
    return { sum, count };
  }

  /** zasilacz DC / AC: serwo przenosi cząstki między basenem masy a naczyniem plus */
  private servo(dt: number): void {
    const gl = this.surfaceY(this.gnd);
    for (const src of this.sources) {
      if (src.type === 'battery') continue;
      const t = this.tanks.get(src.plus)!;
      const w = t.rect.x1 - t.rect.x0;
      const wave = src.type === 'ac' ? Math.sin((2 * Math.PI * this.time) / acPeriod(this.k)) : 1;
      const target = gl + src.volts * wave * this.cal.cellsPerVolt;
      const e = target - (this.vEma.get(src.plus)!.v * this.cal.cellsPerVolt + gl);
      const KP = 8;
      let acc = (this.servoAcc.get(src.id) ?? 0) + KP * e * w * dt;
      while (acc >= 1) {
        if (!this.moveParticle(this.gnd, t)) break;
        acc -= 1;
      }
      while (acc <= -1) {
        if (!this.moveParticle(t, this.gnd)) break;
        acc += 1;
      }
      this.servoAcc.set(src.id, acc);
    }
  }

  /** przenosi najwyższą cząstkę z naczynia from na powierzchnię naczynia to */
  private moveParticle(from: TankInfo, to: TankInfo): boolean {
    const s = this.sim;
    let best = -1;
    let by = -Infinity;
    const f = from.rect;
    for (let i = s.nB; i < s.n; i++) {
      if (s.px[i] >= f.x0 && s.px[i] < f.x1 && s.py[i] >= f.y0 && s.py[i] > by) {
        by = s.py[i];
        best = i;
      }
    }
    if (best < 0) return false;
    this.netMoves += to === this.gnd ? -1 : 1;
    const r = to.rect;
    const w = r.x1 - r.x0;
    const surface = this.surfaceY(to);
    s.px[best] = r.x0 + 0.5 + ((this.moves++ * 7) % w);
    s.py[best] = Math.min(surface + 1.5, to.rimY + POCKET - 1);
    s.vx[best] = 0;
    s.vy[best] = 0;
    return true;
  }
  private moves = 0;
  /** przepływ netto serwa (basen→plus = +1, plus→basen = −1), niezależna miara prądu w stanie ustalonym */
  netMoves = 0;
}

/** szerokość wnętrza naczynia (komórki) dla skali k */
function baseWidth(k: number, role: 'node' | 'supply' | 'battery'): number {
  if (role === 'battery') return 8 * k;
  if (role === 'supply') return 6 * k;
  return 6 * k;
}

export interface CompileOptions {
  /** komórek na wolt (1 = lekki, 2 = średni, 3 = gęsty) */
  k?: number;
}

/** Kompiluje dokument do świata fizycznego. Rzuca CompileError z komunikatem po polsku. */
export function compile(doc: Doc, opts: CompileOptions = {}): World {
  const k = opts.k ?? 1;
  const cal = calFor(k);
  const nl = computeNets(doc);
  if (!nl.groundNet) throw new CompileError('Dodaj masę (GND) do obwodu.');
  const gnd = nl.groundNet;
  const netOf = (id: string, idx: number) => nl.netOf.get(`${id}:${idx}`)!;

  const conds: Cond[] = [];
  const sources: Source[] = [];
  const widthExtra = new Map<string, number>();
  const used = new Set<string>();
  for (const c of doc.components.values()) {
    switch (c.type) {
      case 'resistor':
      case 'bulb':
      case 'switch':
      case 'diode':
      case 'led':
      case 'fuse':
      case 'inductor': {
        const a = netOf(c.id, 0);
        const b = netOf(c.id, 1);
        if (a === b) break; // zwarty sam ze sobą
        conds.push({ id: c.id, type: c.type, netA: a, netB: b });
        used.add(a).add(b);
        break;
      }
      case 'battery':
      case 'supply':
      case 'ac': {
        const minus = netOf(c.id, 0);
        const plus = netOf(c.id, 1);
        if (minus !== gnd) throw new CompileError('Minus źródła musi być połączony z masą (GND).');
        if (plus === gnd) throw new CompileError('Plus źródła jest zwarty z masą.');
        sources.push({ id: c.id, type: c.type, plus, volts: c.value });
        used.add(plus);
        break;
      }
      case 'capacitor': {
        const a = netOf(c.id, 0);
        const b = netOf(c.id, 1);
        if (a === b) break;
        if (a !== gnd && b !== gnd) {
          conds.push({ id: c.id, type: 'capacitor', netA: a, netB: b });
          used.add(a).add(b);
          break;
        }
        const other = a === gnd ? b : a;
        widthExtra.set(other, (widthExtra.get(other) ?? 0) + Math.max(2, c.value));
        used.add(other);
        break;
      }
      case 'voltmeter':
        used.add(netOf(c.id, 0));
        break;
      case 'ground':
        break;
    }
  }
  used.delete(gnd);

  // Kolejność kolumn: elementy między sieciami nie-GND muszą łączyć sąsiednie kolumny, więc graf ma być ścieżkami.
  const nbr = new Map<string, Set<string>>();
  for (const n of used) nbr.set(n, new Set());
  for (const c of conds) {
    if (c.netA === gnd || c.netB === gnd) continue;
    nbr.get(c.netA)!.add(c.netB);
    nbr.get(c.netB)!.add(c.netA);
  }
  const plusNets = new Set(sources.map((s) => s.plus));
  const order: string[] = [];
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const start of [...used].sort()) {
    if (seen.has(start)) continue;
    const stack = [start];
    const comp: string[] = [];
    seen.add(start);
    while (stack.length) {
      const n = stack.pop()!;
      comp.push(n);
      for (const m of nbr.get(n)!) if (!seen.has(m)) (seen.add(m), stack.push(m));
    }
    const edges = comp.reduce((a, n) => a + nbr.get(n)!.size, 0) / 2;
    if (edges !== comp.length - 1 || comp.some((n) => nbr.get(n)!.size > 2)) {
      throw new CompileError('Układ jest zbyt rozgałęziony dla widoku wody (obsługiwane są łańcuchy). Użyj widoku schematu.');
    }
    const ends = comp.filter((n) => nbr.get(n)!.size <= 1).sort();
    const path: string[] = [];
    let cur = ends[0];
    let prev = '';
    while (cur !== undefined) {
      path.push(cur);
      const next = [...nbr.get(cur)!].find((m) => m !== prev);
      prev = cur;
      cur = next as string;
    }
    comps.push(path);
  }
  comps.sort((a, b) => Number(b.some((n) => plusNets.has(n))) - Number(a.some((n) => plusNets.has(n))));
  for (const p of comps) order.push(...p);
  const col = new Map(order.map((n, i) => [n, i]));

  const gndConds = conds.filter((c) => c.netA === gnd || c.netB === gnd);
  const slotConds = conds.filter((c) => c.netA !== gnd && c.netB !== gnd);
  const slotsPerGap = new Map<number, number>();
  for (const c of slotConds) {
    const g = Math.min(col.get(c.netA)!, col.get(c.netB)!);
    slotsPerGap.set(g, (slotsPerGap.get(g) ?? 0) + 1);
    if (slotsPerGap.get(g)! > 2) throw new CompileError('Co najwyżej dwa elementy równolegle między tymi samymi węzłami (widok wody).');
  }

  // solver DC: tylko do rozmieszczenia naczyń na wysokościach (napięcia w grze liczą się z cząstek)
  const dcConds: DcCond[] = conds.map((c) => ({ id: c.id, type: c.type, a: c.netA, b: c.netB, value: doc.components.get(c.id)!.value }));
  // kondensatory do masy (poszerzają naczynie) też liczą się w stanie początkowym: rozładowane, więc węzeł startuje od masy
  for (const c of doc.components.values()) {
    if (c.type !== 'capacitor') continue;
    const a = netOf(c.id, 0);
    const b = netOf(c.id, 1);
    if (a !== b && (a === gnd || b === gnd)) dcConds.push({ id: c.id, type: 'capacitor', a, b, value: c.value });
  }
  const windows = dcWindows({
    nets: [gnd, ...order],
    gnd,
    conds: dcConds,
    sources: sources.map((s) => ({ type: s.type, plus: s.plus, volts: s.volts })),
  });

  // szerokości naczyń: baza zależna od roli plus pojemność kondensatorów do masy
  const width = new Map<string, number>();
  for (const n of order) {
    const src = sources.find((s) => s.plus === n);
    const role = src ? (src.type === 'battery' ? 'battery' : 'supply') : 'node';
    width.set(n, baseWidth(k, role) + (widthExtra.get(n) ?? 0));
  }

  const layout = buildLayout({
    k,
    order,
    win: windows,
    width,
    slots: slotConds.map((c) => ({ id: c.id, netA: c.netA, netB: c.netB })),
    shafts: gndConds.map((c) => ({ id: c.id, net: c.netA === gnd ? c.netB : c.netA })),
    basinWidth: 14 * k,
  });

  // siatka: wszystko ściana, wycięte jamy (naczynia, rury, magistrala, basen) i kieszenie powietrza
  const grid = new CellGrid(layout.W, layout.H);
  grid.fillSolid(0, 0, layout.W, layout.H, 1);
  const mask = new Uint8Array(layout.W * layout.H); // 1 = jama (kontur), 2 = powietrze
  const carve = (r: Rect, kind: 1 | 2) => {
    grid.fillSolid(r.x0, r.y0, r.x1, r.y1, 0);
    for (let j = r.y0; j < r.y1; j++) for (let i = r.x0; i < r.x1; i++) mask[j * layout.W + i] = kind;
  };
  const all: Vessel[] = [...layout.vessels, layout.basin];
  for (const v of all) carve(v.rect, 1);
  for (const pk of layout.pockets) {
    // kieszeń nad brzegiem: powietrze, bez krawędzi konturu
    for (let j = pk.y0; j < pk.y1; j++) {
      for (let i = pk.x0; i < pk.x1; i++) {
        grid.solid[j * layout.W + i] = 0;
        mask[j * layout.W + i] = 2;
      }
    }
  }
  for (const p of layout.pipes) for (const c of p.cavity) carve(c, 1);
  if (layout.bus) carve(layout.bus, 1);

  // informacje o elementach i opór stref
  const pipeOf = new Map(layout.pipes.map((p) => [p.id, p]));
  const info: CondInfo[] = [];
  const flowInit: { ci: CondInfo; value: number; left: string; right: string }[] = [];
  const dynInit: { id: string; type: 'diode' | 'led' | 'fuse'; gammaOn: number; thr: number }[] = [];
  for (const c of conds) {
    const pg = pipeOf.get(c.id)!;
    const kind: 'slot' | 'shaft' = pg.axis === 'x' ? 'slot' : 'shaft';
    const sign: 1 | -1 = kind === 'slot' ? (col.get(c.netA)! < col.get(c.netB)! ? 1 : -1) : c.netA !== gnd ? 1 : -1;
    const ci: CondInfo = { id: c.id, type: c.type, netA: c.netA, netB: c.netB, zone: pg.zone, kind, sign };
    info.push(ci);
    const comp = doc.components.get(c.id)!;
    let gamma: number;
    if (ci.type === 'switch') gamma = comp.value >= 0.5 ? GAMMA_SWITCH_CLOSED : GAMMA_SWITCH_OPEN;
    else if (ci.type === 'inductor' || ci.type === 'capacitor') {
      const net = kind === 'shaft' ? (c.netA === gnd ? c.netB : c.netA) : '';
      flowInit.push({ ci, value: comp.value, left: kind === 'slot' ? pg.left! : net, right: kind === 'slot' ? pg.right! : gnd });
      gamma = 0;
    } else if (ci.type === 'diode' || ci.type === 'led' || ci.type === 'fuse') {
      const on = gammaForResistance(kind === 'shaft' ? R_VALVE * SHAFT_G_FACTOR : R_VALVE);
      dynInit.push({ id: ci.id, type: ci.type, gammaOn: on, thr: comp.value });
      gamma = 1e5;
    } else gamma = gammaForResistance(kind === 'shaft' ? comp.value * SHAFT_G_FACTOR : comp.value);
    grid.setGamma(pg.zone.x0, pg.zone.y0, pg.zone.x1, pg.zone.y1, gamma);
  }

  // cząstki: naczynia do nominalnego lustra, rury i magistrala w całości, basen do poziomu masy
  const fill = new Uint8Array(layout.W * layout.H);
  const mark = (r: Rect, yTop?: number) => {
    const top = yTop === undefined ? r.y1 : Math.min(r.y1, Math.round(yTop));
    for (let j = r.y0; j < top; j++) for (let i = r.x0; i < r.x1; i++) fill[j * layout.W + i] = 1;
  };
  for (const v of all) mark(v.rect, v.nomY);
  for (const p of layout.pipes) for (const c of p.cavity) mark(c);
  if (layout.bus) mark(layout.bus);
  let nFluid = 0;
  for (let q = 0; q < fill.length; q++) nFluid += fill[q];
  const sim = new Sim(grid, nFluid + 200);
  sim.tune.xsph = 0.04;
  for (let j = 0; j < layout.H; j++) {
    for (let i = 0; i < layout.W; i++) if (fill[j * layout.W + i]) sim.addFluid(i, j, i + 1, j + 1);
  }

  const w = new World();
  w.sim = sim;
  w.layout = layout;
  w.k = k;
  w.cal = cal;
  w.W = layout.W;
  w.H = layout.H;
  w.windows = windows;
  w.outline = cavityOutline(mask, layout.W, layout.H);
  const toTank = (v: Vessel): TankInfo => ({ net: v.net, rect: v.rect, floorY: v.floorY, rimY: v.rimY, nomY: v.nomY });
  for (const v of layout.vessels) w.tanks.set(v.net, toTank(v));
  const gndTank = toTank({ ...layout.basin, net: gnd });
  w.tanks.set(gnd, gndTank);
  w.gnd = gndTank;
  w.conds = info;
  w.sources = sources;
  for (const { ci, value, left, right } of flowInit) {
    const hz = ci.kind === 'slot' ? ci.zone.y1 - ci.zone.y0 : ci.zone.x1 - ci.zone.x0;
    const head = () => w.surfaceY(w.tanks.get(left)!) - w.surfaceY(w.tanks.get(right)!);
    const axis = ci.kind === 'slot' ? ('x' as const) : ('y' as const);
    const params =
      ci.type === 'inductor'
        ? { m: INDUCTOR_M * Math.max(0.05, value), k: 0, c: 0.05, axis }
        : { m: 0.02, k: hz / Math.max(0.5, value * CAP_CELLS_PER_UF * k), c: 2, axis };
    w.flows.set(ci.id, { z: new FlowZone(sim, ci.zone, params, head), sign: ci.sign });
  }
  w.registerValves(dynInit);
  return w;
}
