import { DEFS, type ComponentType } from './components/defs';
import type { DocData } from './model/types';

type Rot = 0 | 90 | 180 | 270;
interface Item {
  type: ComponentType;
  x: number;
  y: number;
  rot?: Rot;
  value?: number;
}

/** Buduje dokument z listy elementów i przewodów (porty jako [indeks elementu, port]). */
export function make(items: Item[], wires: [[number, number], [number, number]][]): DocData {
  return {
    version: 1,
    components: items.map((it, i) => ({
      id: `c${i + 1}`,
      type: it.type,
      value: it.value ?? defaultOf(it.type),
      pos: { x: it.x, y: it.y },
      rot: it.rot ?? 0,
    })),
    wires: wires.map(([a, b], i) => ({ id: `w${i + 1}`, a: `c${a[0] + 1}:${a[1]}`, b: `c${b[0] + 1}:${b[1]}` })),
    nextId: items.length + wires.length + 1,
  };
}

function defaultOf(t: ComponentType): number {
  return DEFS[t].defaultValue;
}

const chain = (mid: ComponentType, srcType: ComponentType = 'supply', midValue?: number): DocData =>
  make(
    [
      { type: srcType, x: 4, y: 6 },
      { type: 'ground', x: 4, y: 10 },
      { type: mid, x: 12, y: 6, value: midValue ?? defaultOf(mid) },
      { type: 'resistor', x: 20, y: 6, value: 47 },
      { type: 'ground', x: 24, y: 10 },
    ],
    [
      [[0, 0], [1, 0]],
      [[0, 1], [2, 0]],
      [[2, 1], [3, 0]],
      [[3, 1], [4, 0]],
    ],
  );

export const EXAMPLES: Record<string, { label: string; data: DocData }> = {
  rl: { label: 'Cewka: prąd rozkręca się powoli (RL)', data: chain('inductor') },
  cblock: { label: 'Kondensator blokuje stały prąd', data: chain('capacitor') },
  accap: { label: 'Kondensator przepuszcza prąd zmienny', data: chain('capacitor', 'ac') },
  parallel: {
    label: 'Dwie żarówki równolegle',
    data: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'bulb', x: 12, y: 6, value: 47 },
        { type: 'bulb', x: 12, y: 10, value: 47 },
        { type: 'ground', x: 20, y: 12 },
        { type: 'voltmeter', x: 10, y: 14 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[0, 1], [3, 0]],
        [[2, 1], [4, 0]],
        [[3, 1], [4, 0]],
        [[5, 0], [0, 1]],
      ],
    ),
  },
  ac: {
    label: 'Prąd zmienny (przypływ i odpływ)',
    data: make(
      [
        { type: 'ac', x: 4, y: 6, value: 4 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'resistor', x: 12, y: 6, value: 47 },
        { type: 'ground', x: 16, y: 10 },
        { type: 'voltmeter', x: 8, y: 9 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[4, 0], [0, 1]],
      ],
    ),
  },
  led: {
    label: 'LED z rezystorem',
    data: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'resistor', x: 12, y: 6, value: 47 },
        { type: 'led', x: 20, y: 6 },
        { type: 'ground', x: 24, y: 10 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[3, 1], [4, 0]],
      ],
    ),
  },
  fuse: {
    label: 'Bezpiecznik chroni obwód',
    data: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'fuse', x: 12, y: 6, value: 0.1 },
        { type: 'resistor', x: 20, y: 6, value: 22 },
        { type: 'ground', x: 24, y: 10 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[3, 1], [4, 0]],
      ],
    ),
  },
  resistor: {
    label: 'Zasilacz i rezystor',
    data: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'resistor', x: 12, y: 6 },
        { type: 'ground', x: 16, y: 10 },
        { type: 'voltmeter', x: 8, y: 9 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[4, 0], [0, 1]],
      ],
    ),
  },
  divider: {
    label: 'Dzielnik napięcia',
    data: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'resistor', x: 12, y: 6 },
        { type: 'resistor', x: 16, y: 6, rot: 90 },
        { type: 'ground', x: 16, y: 12 },
        { type: 'voltmeter', x: 20, y: 6 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[3, 1], [4, 0]],
        [[5, 0], [2, 1]],
      ],
    ),
  },
  bulb: {
    label: 'Przełącznik i żarówka',
    data: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'switch', x: 12, y: 6, value: 0 },
        { type: 'bulb', x: 20, y: 6, value: 22 },
        { type: 'ground', x: 24, y: 10 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[3, 1], [4, 0]],
      ],
    ),
  },
  rc: {
    label: 'Ładowanie kondensatora (RC)',
    data: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'resistor', x: 12, y: 6, value: 47 },
        { type: 'capacitor', x: 16, y: 6, rot: 90, value: 10 },
        { type: 'ground', x: 16, y: 12 },
        { type: 'voltmeter', x: 20, y: 6 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[3, 1], [4, 0]],
        [[5, 0], [2, 1]],
      ],
    ),
  },
};
