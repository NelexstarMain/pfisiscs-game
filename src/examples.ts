import type { ComponentType } from './components/defs';
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
function make(items: Item[], wires: [[number, number], [number, number]][]): DocData {
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
  return { battery: 9, supply: 9, ground: 0, resistor: 47, bulb: 22, switch: 1, capacitor: 10, voltmeter: 0 }[t];
}

export const EXAMPLES: Record<string, { label: string; data: DocData }> = {
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
