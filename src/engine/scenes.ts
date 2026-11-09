import { CellGrid } from './grid';
import { Sim } from './pbf';

export interface TwoTanksOpts {
  wA: number;
  wB: number;
  /** poziom wody (liczba warstw) w A i B ponad dnem zbiornika */
  fillA: number;
  fillB: number;
  /** wysokość wnętrza zbiorników */
  inner?: number;
  /** długość i wysokość szczeliny przy dnie */
  slotLen?: number;
  slotH?: number;
  gamma?: number;
  /** wysokość podniesienia dna (komórki-podłoga) */
  floor?: number;
}

export interface TwoTanks {
  sim: Sim;
  /** granice x wnętrza zbiornika A i B oraz szczeliny */
  a: { x0: number; x1: number };
  b: { x0: number; x1: number };
  slot: { x0: number; x1: number; y0: number; y1: number };
  floor: number;
}

export function makeTwoTanks(o: TwoTanksOpts): TwoTanks {
  const floor = o.floor ?? 3;
  const wall = 3;
  const inner = o.inner ?? 40;
  const slotLen = o.slotLen ?? 6;
  const slotH = o.slotH ?? 3;
  const gamma = o.gamma ?? 0;
  const W = wall + o.wA + slotLen + o.wB + wall;
  const Ht = floor + inner;
  const grid = new CellGrid(W, Ht);
  grid.fillSolid(0, 0, W, floor);
  grid.fillSolid(0, 0, wall, Ht);
  grid.fillSolid(W - wall, 0, W, Ht);
  const dx0 = wall + o.wA;
  grid.fillSolid(dx0, 0, dx0 + slotLen, Ht);
  // szczelina przy dnie
  grid.fillSolid(dx0, floor, dx0 + slotLen, floor + slotH, 0);
  if (gamma > 0) grid.setGamma(dx0, floor, dx0 + slotLen, floor + slotH, gamma);
  const cap = (o.wA + o.wB + slotLen) * (Math.max(o.fillA, o.fillB) + slotH + 2);
  const sim = new Sim(grid, cap);
  sim.addFluid(wall, floor, wall + o.wA, floor + o.fillA);
  sim.addFluid(dx0 + slotLen, floor, dx0 + slotLen + o.wB, floor + o.fillB);
  return {
    sim,
    a: { x0: wall, x1: wall + o.wA },
    b: { x0: dx0 + slotLen, x1: dx0 + slotLen + o.wB },
    slot: { x0: dx0, x1: dx0 + slotLen, y0: floor, y1: floor + slotH },
    floor,
  };
}

/** poziom wody w węźle z liczby cząstek (wysokość ponad dnem zbiornika) */
export function level(t: TwoTanks, side: 'a' | 'b'): number {
  const s = side === 'a' ? t.a : t.b;
  const n = t.sim.countIn(s.x0, t.floor, s.x1, 1e9);
  return n / (s.x1 - s.x0);
}

export interface SlotSpec {
  gamma: number;
  /** wysokość szczeliny (komórki) */
  h?: number;
}

export interface ChainOpts {
  tanks: { w: number; fill: number }[];
  /** szczeliny w ścianie k (między zbiornikiem k a k+1); wiele = równolegle */
  walls: SlotSpec[][];
  inner?: number;
  slotLen?: number;
  floor?: number;
}

export interface Chain {
  sim: Sim;
  tanks: { x0: number; x1: number }[];
  slots: { x0: number; x1: number; y0: number; y1: number }[][];
  floor: number;
}

/** łańcuch zbiorników połączonych szczelinami przy dnie (równoległe szczeliny dzielone żebrem 2 komórki) */
export function makeChain(o: ChainOpts): Chain {
  const floor = o.floor ?? 3;
  const wall = 3;
  const inner = o.inner ?? 60;
  const L = o.slotLen ?? 4;
  const n = o.tanks.length;
  const W = wall + o.tanks.reduce((a, t) => a + t.w, 0) + (n - 1) * L + wall;
  const Ht = floor + inner;
  const grid = new CellGrid(W, Ht);
  grid.fillSolid(0, 0, W, floor);
  grid.fillSolid(0, 0, wall, Ht);
  grid.fillSolid(W - wall, 0, W, Ht);
  const tanks: Chain['tanks'] = [];
  const slots: Chain['slots'] = [];
  let x = wall;
  let cap = 0;
  for (let k = 0; k < n; k++) {
    const t = o.tanks[k];
    tanks.push({ x0: x, x1: x + t.w });
    cap += t.w * (t.fill + 8);
    x += t.w;
    if (k < n - 1) {
      grid.fillSolid(x, 0, x + L, Ht);
      const list: Chain['slots'][number] = [];
      let y = floor;
      for (const sp of o.walls[k] ?? []) {
        const h = sp.h ?? 4;
        grid.fillSolid(x, y, x + L, y + h, 0);
        grid.setGamma(x, y, x + L, y + h, sp.gamma);
        list.push({ x0: x, x1: x + L, y0: y, y1: y + h });
        y += h + 2;
        cap += L * h;
      }
      slots.push(list);
      x += L;
    }
  }
  const sim = new Sim(grid, cap);
  sim.tune.xsph = 0.04;
  for (let k = 0; k < n; k++) sim.addFluid(tanks[k].x0, floor, tanks[k].x1, floor + o.tanks[k].fill);
  return { sim, tanks, slots, floor };
}

/** poziom wody w zbiorniku k z liczby cząstek */
export function chainLevel(c: Chain, k: number): number {
  const t = c.tanks[k];
  return c.sim.countIn(t.x0, c.floor, t.x1, 1e9) / (t.x1 - t.x0);
}
