/**
 * Czysta geometria świata: osobne naczynia zawieszone na wysokościach zależnych od napięcia,
 * połączone rurami (od dołu do dołu, pod wodą), plus basen masy na dole.
 * Współrzędne w komórkach, y rośnie w górę. Nic tu nie zależy od symulacji.
 */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Win {
  nom: number;
  /** napięcie początkowe (od niego startuje wypełnienie); domyślnie nom */
  init?: number;
  lo: number;
  hi: number;
}

export interface LayoutInput {
  /** komórek na wolt */
  k: number;
  /** sieci-naczynia od lewej do prawej (bez masy) */
  order: string[];
  win: Map<string, Win>;
  /** szerokość wnętrza naczynia [komórki] */
  width: Map<string, number>;
  /** elementy między sąsiednimi kolumnami, w kolejności slotów */
  slots: { id: string; netA: string; netB: string }[];
  /** elementy z naczynia do masy */
  shafts: { id: string; net: string }[];
  basinWidth: number;
}

export interface Vessel {
  net: string;
  /** wnętrze naczynia od dna do brzegu */
  rect: Rect;
  floorY: number;
  rimY: number;
  /** nominalna wysokość lustra (komórki) */
  nomY: number;
}

export interface PipeGeo {
  id: string;
  /** prostokąty wnętrza rury (otwarte komórki) */
  cavity: Rect[];
  /** strefa oporowa (lub FlowZone) */
  zone: Rect;
  axis: 'x' | 'y';
  /** dla szczeliny: sieć po lewej i prawej stronie, dla szybu: sieć naczynia */
  left?: string;
  right?: string;
  net?: string;
  /** czy strefa leży przy niższym naczyniu */
  nearLower?: string;
}

export interface Layout {
  W: number;
  H: number;
  vessels: Vessel[];
  basin: Vessel;
  pipes: PipeGeo[];
  /** magistrala pod naczyniami do basenu */
  bus: Rect | null;
  /** kieszenie powietrza nad brzegami */
  pockets: Rect[];
}

const MARGIN = 6;
const PW = 4; // szerokość wnętrza rury
const PITCH = 6; // odstęp równoległych rur (wnętrze 4 + ścianka 2)

const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });

export function buildLayout(inp: LayoutInput): Layout {
  const { k } = inp;
  const yOf = (v: number) => Math.round(v * k);
  const n = inp.order.length;

  // liczba rur w każdej przerwie
  const lanes: number[] = new Array(Math.max(0, n - 1)).fill(0);
  const colOf = new Map(inp.order.map((net, i) => [net, i]));
  const gapSlots: { id: string; netA: string; netB: string; s: number }[][] = lanes.map(() => []);
  for (const sl of inp.slots) {
    const g = Math.min(colOf.get(sl.netA)!, colOf.get(sl.netB)!);
    gapSlots[g].push({ ...sl, s: gapSlots[g].length });
    lanes[g]++;
  }
  const shaftsOf = new Map<string, { id: string }[]>();
  for (const sh of inp.shafts) {
    const l = shaftsOf.get(sh.net) ?? [];
    l.push(sh);
    shaftsOf.set(sh.net, l);
  }

  // pozycje x
  let x = MARGIN;
  const xs: { x0: number; x1: number }[] = [];
  for (let i = 0; i < n; i++) {
    const net = inp.order[i];
    const m = shaftsOf.get(net)?.length ?? 0;
    // szyby odsunięte o 3 komórki od ścian, żeby ścianka przy rurach bocznych miała ≥ 2
    const w = Math.max(inp.width.get(net) ?? 6 * k, m > 0 ? PITCH * m + 4 : 0, 6);
    xs.push({ x0: x, x1: x + w });
    const gapW = i < n - 1 ? (lanes[i] > 0 ? 24 + PITCH * lanes[i] : 8) : 8;
    x += w + gapW;
  }
  const bx0 = x;
  const bx1 = bx0 + inp.basinWidth;

  // pionowe okna naczyń
  const vessels: Vessel[] = inp.order.map((net, i) => {
    const w = inp.win.get(net) ?? { nom: 0, lo: 0, hi: 0 };
    const portsL = i > 0 ? lanes[i - 1] : 0;
    const portsR = i < n - 1 ? lanes[i] : 0;
    const maxPorts = Math.max(portsL, portsR);
    const portTop = maxPorts > 0 ? PITCH * maxPorts - 2 : PW;
    const floorY = Math.round(yOf(w.lo) - portTop - 3 - k);
    let rimY = Math.round(yOf(w.hi) + 3 * k + 4);
    if (rimY - floorY < 12) rimY = floorY + 12;
    return { net, rect: rect(xs[i].x0, floorY, xs[i].x1, rimY), floorY, rimY, nomY: yOf(w.init ?? w.nom) };
  });

  const minFloor = vessels.length ? Math.min(...vessels.map((v) => v.floorY)) : 0;
  const yBus = Math.min(minFloor - 14, -14);
  const basinFloor = yBus - 6;
  const basinRim = 10;
  const basin: Vessel = { net: '', rect: rect(bx0, basinFloor, bx1, basinRim), floorY: basinFloor, rimY: basinRim, nomY: 0 };

  const pipes: PipeGeo[] = [];

  // rury między sąsiednimi kolumnami
  for (let g = 0; g < lanes.length; g++) {
    const A = vessels[g];
    const B = vessels[g + 1];
    const gx0 = A.rect.x1;
    const gx1 = B.rect.x0;
    const aHigher = A.floorY >= B.floorY;
    for (const sl of gapSlots[g]) {
      const s = sl.s;
      const yA = A.floorY + PITCH * s;
      const yB = B.floorY + PITCH * s;
      const lx = aHigher ? gx0 + 2 + PITCH * s : gx1 - 2 - PW - PITCH * s;
      const cavity = [
        rect(gx0, yA, lx + PW, yA + PW),
        rect(lx, Math.min(yA, yB), lx + PW, Math.max(yA, yB) + PW),
        rect(lx, yB, gx1, yB + PW),
      ];
      // strefa przy niższym naczyniu, co najmniej 4 komórki od narożnika
      const zone = aHigher ? rect(gx1 - 8, yB, gx1 - 4, yB + PW) : rect(gx0 + 4, yA, gx0 + 8, yA + PW);
      pipes.push({ id: sl.id, cavity, zone, axis: 'x', left: A.net, right: B.net, nearLower: aHigher ? B.net : A.net });
    }
  }

  // rury do masy: pionowo w dół do magistrali
  let minSx = Infinity;
  for (const v of vessels) {
    const list = shaftsOf.get(v.net) ?? [];
    list.forEach((sh, j) => {
      const sx = v.rect.x0 + 3 + PITCH * j;
      minSx = Math.min(minSx, sx);
      pipes.push({
        id: sh.id,
        cavity: [rect(sx, yBus + PW, sx + PW, v.floorY)],
        zone: rect(sx, yBus + 6, sx + PW, yBus + 10),
        axis: 'y',
        net: v.net,
      });
    });
  }
  const bus = Number.isFinite(minSx) ? rect(minSx, yBus, bx0, yBus + PW) : null;

  const pockets = [...vessels, basin].map((v) => rect(v.rect.x0, v.rimY, v.rect.x1, v.rimY + 6));

  // przesunięcie, żeby wszystko leżało w dodatnich współrzędnych z marginesem
  const topY = Math.max(...pockets.map((p) => p.y1));
  const botY = Math.min(basinFloor, yBus);
  const dy = MARGIN - botY;
  const shift = (r: Rect): Rect => rect(r.x0, r.y0 + dy, r.x1, r.y1 + dy);
  const sv = (v: Vessel): Vessel => ({ ...v, rect: shift(v.rect), floorY: v.floorY + dy, rimY: v.rimY + dy, nomY: v.nomY + dy });
  return {
    W: bx1 + MARGIN,
    H: topY + dy + MARGIN,
    vessels: vessels.map(sv),
    basin: sv(basin),
    pipes: pipes.map((p) => ({ ...p, cavity: p.cavity.map(shift), zone: shift(p.zone) })),
    bus: bus ? shift(bus) : null,
    pockets: pockets.map(shift),
  };
}
