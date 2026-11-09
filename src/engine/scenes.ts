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
