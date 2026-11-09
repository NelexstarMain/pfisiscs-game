import { PARAMS } from '../engine/constants';
import { CellGrid } from '../engine/grid';
import { Sim } from '../engine/pbf';
import type { Doc } from '../model/doc';
import { computeNets } from '../model/nets';
import { portComp } from '../model/types';
import { CAL, gammaForResistance, SHAFT_G_FACTOR, ZONE_FLOW_BIAS } from './calibration';

export class CompileError extends Error {}

const WALL = 3;
const GAP = 4; // grubość ściany między zbiornikami = długość szczeliny
const SLOT_H = 4;
const RIB = 2;
const MANIFOLD_Y0 = 3;
const MANIFOLD_Y1 = 7;
const PLATE_Y1 = 11; // góra płyty = dno zbiorników
export const FLOOR_Y = PLATE_Y1;
/** wysokość, od której tamy między zbiornikami rysujemy dynamicznie (nad stosem szczelin) */
export const DAM_BASE_Y = FLOOR_Y + 11;
export const MANIFOLD_ROWS = { y0: MANIFOLD_Y0, y1: MANIFOLD_Y1 };
const SHAFT_W = 4;
const GAMMA_SWITCH_CLOSED = 8;
const GAMMA_SWITCH_OPEN = 1e5;
/** opór otwartego zaworu (dioda, LED, bezpiecznik) [Ω] */
const R_VALVE = 12;

type CondType = 'resistor' | 'bulb' | 'switch' | 'diode' | 'led' | 'fuse';
interface Cond {
  id: string;
  type: CondType;
  netA: string;
  netB: string;
}
interface Source {
  id: string;
  type: 'battery' | 'supply';
  plus: string;
  volts: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TankInfo {
  net: string;
  rect: Rect; // wnętrze zbiornika (od FLOOR_Y w górę)
  initLevel: number;
}

export interface CondInfo {
  id: string;
  type: CondType;
  netA: string;
  netB: string;
  zone: Rect;
  kind: 'slot' | 'shaft';
  /** znak prądu: +1, jeśli dodatni przepływ osi (x dla szczeliny, w dół dla szybu) idzie z portu A do B */
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

export interface Gap {
  x0: number;
  x1: number;
  netL: string;
  netR: string;
  /** czy między tymi zbiornikami płynie woda przez element (do rysowania wodospadu) */
  connected: boolean;
}

export class World {
  sim!: Sim;
  columns: { net: string; x0: number; x1: number }[] = [];
  gaps: Gap[] = [];
  W = 0;
  H = 0;
  tanks = new Map<string, TankInfo>();
  gnd!: TankInfo;
  conds: CondInfo[] = [];
  sources: { id: string; type: 'battery' | 'supply'; plus: string; volts: number }[] = [];
  /** wygładzone: napięcie sieci względem GND [V] */
  private vEma = new Map<string, Ema>();
  private iEma = new Map<string, Ema>();
  private servoAcc = new Map<string, number>();
  time = 0;
  /** zawory sterowane napięciem/przepływem: dioda, LED, bezpiecznik */
  private dyn = new Map<string, { type: 'diode' | 'led' | 'fuse'; gammaOn: number; thr: number; a: number; over: number }>();
  /** przepalone bezpieczniki */
  blown = new Set<string>();

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

  /** surowy poziom wody w zbiorniku (komórki nad dnem) */
  rawLevel(t: TankInfo): number {
    const r = t.rect;
    return this.sim.countIn(r.x0, FLOOR_Y, r.x1, 1e9) / (r.x1 - r.x0);
  }

  setSwitch(compId: string, closed: boolean): void {
    const c = this.conds.find((x) => x.id === compId && x.type === 'switch');
    if (!c) return;
    this.sim.grid.setGamma(c.zone.x0, c.zone.y0, c.zone.x1, c.zone.y1, closed ? GAMMA_SWITCH_CLOSED : GAMMA_SWITCH_OPEN);
  }

  step(dt: number = PARAMS.dt): void {
    this.sim.step(dt);
    this.time += dt;
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

  /** wymiana przepalonego bezpiecznika */
  resetFuse(compId: string): void {
    this.blown.delete(compId);
    const d = this.dyn.get(compId);
    if (d) d.over = 0;
  }

  private measure(dt: number): void {
    const gl = this.rawLevel(this.gnd);
    for (const t of this.tanks.values()) {
      const v = (this.rawLevel(t) - gl) / CAL.cellsPerVolt;
      let e = this.vEma.get(t.net);
      if (!e) this.vEma.set(t.net, (e = new Ema()));
      e.push(v, dt, 0.1);
    }
    for (const c of this.conds) {
      const z = c.zone;
      const { sum, count } = c.kind === 'slot' ? this.sim.vxIn(z.x0, z.y0, z.x1, z.y1) : this.vyIn(z);
      if (count < 3) continue;
      const mean = sum / count;
      const crossSection = c.kind === 'slot' ? z.y1 - z.y0 : z.x1 - z.x0;
      // dla szybu dodatni przepływ to w dół, czyli −vy
      const q = c.kind === 'slot' ? mean * crossSection : -mean * crossSection;
      let e = this.iEma.get(c.id);
      if (!e) this.iEma.set(c.id, (e = new Ema()));
      e.push((c.sign * q) / ZONE_FLOW_BIAS / CAL.particlesPerAmpere, dt, 0.25);
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

  /** zasilacz DC: serwo przenosi cząstki między kolektorem masy a zbiornikiem plus */
  private servo(dt: number): void {
    const gl = this.rawLevel(this.gnd);
    for (const src of this.sources) {
      if (src.type !== 'supply') continue;
      const t = this.tanks.get(src.plus)!;
      const w = t.rect.x1 - t.rect.x0;
      const target = gl + src.volts * CAL.cellsPerVolt;
      const e = target - (this.vEma.get(src.plus)!.v * CAL.cellsPerVolt + gl);
      const KP = 4;
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

  /** przenosi najwyższą cząstkę ze zbiornika from na powierzchnię zbiornika to */
  private moveParticle(from: TankInfo, to: TankInfo): boolean {
    const s = this.sim;
    let best = -1;
    let by = -Infinity;
    const f = from.rect;
    for (let i = s.nB; i < s.n; i++) {
      if (s.px[i] >= f.x0 && s.px[i] < f.x1 && s.py[i] >= FLOOR_Y && s.py[i] > by) {
        by = s.py[i];
        best = i;
      }
    }
    if (best < 0) return false;
    this.netMoves += to === this.gnd ? -1 : 1;
    const r = to.rect;
    const w = r.x1 - r.x0;
    const surface = FLOOR_Y + this.rawLevel(to);
    s.px[best] = r.x0 + 0.5 + ((this.moves++ * 7) % w);
    s.py[best] = surface + 1.5;
    s.vx[best] = 0;
    s.vy[best] = 0;
    return true;
  }
  private moves = 0;
  /** przepływ netto serwa (kolektor→plus = +1, plus→kolektor = −1), niezależna miara prądu w stanie ustalonym */
  netMoves = 0;
}

/** Kompiluje dokument do świata fizycznego. Rzuca CompileError z komunikatem po polsku. */
export function compile(doc: Doc): World {
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
      case 'fuse': {
        const a = netOf(c.id, 0);
        const b = netOf(c.id, 1);
        if (a === b) break; // zwarty sam ze sobą
        conds.push({ id: c.id, type: c.type, netA: a, netB: b });
        used.add(a).add(b);
        break;
      }
      case 'battery':
      case 'supply': {
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
        if (a !== gnd && b !== gnd) throw new CompileError('Kondensator między dwoma węzłami bez masy pojawi się w kolejnym etapie.');
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

  // przewody GND i szczeliny sąsiednie
  const gndConds = conds.filter((c) => c.netA === gnd || c.netB === gnd);
  const slotConds = conds.filter((c) => c.netA !== gnd && c.netB !== gnd);
  const shaftsPerNet = new Map<string, number>();
  for (const c of gndConds) {
    const x = c.netA === gnd ? c.netB : c.netA;
    shaftsPerNet.set(x, (shaftsPerNet.get(x) ?? 0) + 1);
  }
  const slotsPerGap = new Map<number, number>();
  for (const c of slotConds) {
    const g = Math.min(col.get(c.netA)!, col.get(c.netB)!);
    slotsPerGap.set(g, (slotsPerGap.get(g) ?? 0) + 1);
    if (slotsPerGap.get(g)! > 2) throw new CompileError('Co najwyżej dwa elementy równolegle między tymi samymi węzłami (widok wody).');
  }

  // początkowe poziomy: wszystko na poziomie GND, plus źródeł wyżej
  const level = new Map<string, number>();
  for (const n of order) level.set(n, CAL.groundLevel);
  for (const s of sources) level.set(s.plus, CAL.groundLevel + s.volts * CAL.cellsPerVolt);

  // szerokości zbiorników
  const widthOf = (n: string): number => {
    let w = 6;
    const src = sources.find((s) => s.plus === n);
    if (src) w = Math.max(w, src.type === 'battery' ? 30 : 14);
    w += widthExtra.get(n) ?? 0;
    const sh = shaftsPerNet.get(n) ?? 0;
    if (sh > 0) w = Math.max(w, sh * (SHAFT_W + RIB) - RIB);
    return w;
  };
  const GND_W = 24;

  // współrzędne x
  const tanks = new Map<string, TankInfo>();
  let x = WALL;
  const xs: { net: string; x0: number; x1: number }[] = [];
  for (const n of order) {
    const w = widthOf(n);
    xs.push({ net: n, x0: x, x1: x + w });
    x += w + GAP;
  }
  const gx0 = x;
  const gx1 = gx0 + GND_W;
  const W = gx1 + WALL;
  const maxLevel = Math.max(CAL.groundLevel, ...[...level.values()]);
  const H = FLOOR_Y + maxLevel + 14;

  const grid = new CellGrid(W, H);
  grid.fillSolid(0, 0, W, H, 1);
  const open = (x0: number, y0: number, x1: number, y1: number) => grid.fillSolid(x0, y0, x1, y1, 0);
  for (const t of xs) {
    open(t.x0, FLOOR_Y, t.x1, H);
    tanks.set(t.net, { net: t.net, rect: { x0: t.x0, y0: FLOOR_Y, x1: t.x1, y1: H }, initLevel: level.get(t.net)! });
  }
  open(WALL, MANIFOLD_Y0, gx1, MANIFOLD_Y1);
  open(gx0, MANIFOLD_Y0, gx1, H);
  const gndTank: TankInfo = { net: gnd, rect: { x0: gx0, y0: FLOOR_Y, x1: gx1, y1: H }, initLevel: CAL.groundLevel };
  tanks.set(gnd, gndTank);

  const info: CondInfo[] = [];
  // szyby do GND
  const shaftIdx = new Map<string, number>();
  const fillRects: Rect[] = [];
  for (const c of gndConds) {
    const netX = c.netA === gnd ? c.netB : c.netA;
    const k = shaftIdx.get(netX) ?? 0;
    shaftIdx.set(netX, k + 1);
    const t = xs.find((q) => q.net === netX)!;
    const sx = t.x0 + k * (SHAFT_W + RIB);
    open(sx, MANIFOLD_Y1, sx + SHAFT_W, PLATE_Y1);
    const zone: Rect = { x0: sx, y0: MANIFOLD_Y1, x1: sx + SHAFT_W, y1: PLATE_Y1 };
    fillRects.push(zone);
    info.push({ id: c.id, type: c.type, netA: c.netA, netB: c.netB, zone, kind: 'shaft', sign: c.netA === netX ? 1 : -1 });
  }
  // szczeliny w ścianach między sąsiednimi kolumnami
  const gapStack = new Map<number, number>();
  for (const c of slotConds) {
    const ca = col.get(c.netA)!;
    const cb = col.get(c.netB)!;
    const g = Math.min(ca, cb);
    const k = gapStack.get(g) ?? 0;
    gapStack.set(g, k + 1);
    const left = xs[g];
    const y0 = FLOOR_Y + k * (SLOT_H + RIB);
    const zone: Rect = { x0: left.x1, y0, x1: left.x1 + GAP, y1: y0 + SLOT_H };
    open(zone.x0, zone.y0, zone.x1, zone.y1);
    info.push({ id: c.id, type: c.type, netA: c.netA, netB: c.netB, zone, kind: 'slot', sign: ca < cb ? 1 : -1 });
  }
  // opór stref
  const dynInit: { id: string; type: 'diode' | 'led' | 'fuse'; gammaOn: number; thr: number }[] = [];
  for (const ci of info) {
    const comp = doc.components.get(ci.id)!;
    let gamma: number;
    if (ci.type === 'switch') gamma = comp.value >= 0.5 ? GAMMA_SWITCH_CLOSED : GAMMA_SWITCH_OPEN;
    else if (ci.type === 'diode' || ci.type === 'led' || ci.type === 'fuse') {
      const on = gammaForResistance(ci.kind === 'shaft' ? R_VALVE * SHAFT_G_FACTOR : R_VALVE);
      dynInit.push({ id: ci.id, type: ci.type, gammaOn: on, thr: comp.value });
      gamma = 1e5;
    } else gamma = gammaForResistance(ci.kind === 'shaft' ? comp.value * SHAFT_G_FACTOR : comp.value);
    grid.setGamma(ci.zone.x0, ci.zone.y0, ci.zone.x1, ci.zone.y1, gamma);
  }

  // cząstki: zbiorniki do poziomu, szyby, kolektor, kolumna GND
  let cells = 0;
  for (const t of xs) cells += (t.x1 - t.x0) * Math.ceil(level.get(t.net)!);
  cells += (gx1 - WALL) * (MANIFOLD_Y1 - MANIFOLD_Y0) + GND_W * (FLOOR_Y - MANIFOLD_Y1 + Math.ceil(CAL.groundLevel));
  cells += fillRects.length * SHAFT_W * (PLATE_Y1 - MANIFOLD_Y1);
  const sim = new Sim(grid, cells + 400);
  sim.tune.xsph = 0.04;
  for (const t of xs) sim.addFluid(t.x0, FLOOR_Y, t.x1, FLOOR_Y + Math.ceil(level.get(t.net)!));
  sim.addFluid(WALL, MANIFOLD_Y0, gx1, MANIFOLD_Y1);
  for (const z of fillRects) sim.addFluid(z.x0, z.y0, z.x1, z.y1);
  sim.addFluid(gx0, MANIFOLD_Y1, gx1, FLOOR_Y + Math.ceil(CAL.groundLevel));

  const w = new World();
  w.sim = sim;
  w.W = W;
  w.H = H;
  w.tanks = tanks;
  w.gnd = gndTank;
  w.conds = info;
  w.sources = sources;
  w.columns = xs;
  w.gaps = xs.map((t, k) => {
    const last = k === xs.length - 1;
    return {
      x0: t.x1,
      x1: last ? gx0 : xs[k + 1].x0,
      netL: t.net,
      netR: last ? gnd : xs[k + 1].net,
      connected: last
        ? gndConds.some((c) => c.netA === t.net || c.netB === t.net)
        : slotConds.some((c) => Math.min(col.get(c.netA)!, col.get(c.netB)!) === k),
    };
  });
  w.registerValves(dynInit);
  return w;
}

export { portComp };
