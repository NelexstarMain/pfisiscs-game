import { DEFS } from '../components/defs';
import type { Component, PortKey, Vec } from '../model/types';
import { portComp, portIndex } from '../model/types';

export const GRID = 16; // px na jednostkę siatki w widoku schematu

/** przesunięcia portów w jednostkach siatki dla rotacji 0 */
export function portOffsets(type: Component['type']): Vec[] {
  const n = DEFS[type].ports;
  if (n === 1) return [{ x: 0, y: 0 }];
  return [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ];
}

export function rotate(v: Vec, rot: number): Vec {
  switch (rot) {
    case 90:
      return { x: -v.y, y: v.x };
    case 180:
      return { x: -v.x, y: -v.y };
    case 270:
      return { x: v.y, y: -v.x };
    default:
      return { x: v.x, y: v.y };
  }
}

/** pozycja portu (siatka) */
export function portPos(c: Component, index: number): Vec {
  const o = rotate(portOffsets(c.type)[index], c.rot);
  return { x: c.pos.x + o.x, y: c.pos.y + o.y };
}

export function portPosByKey(comps: Map<string, Component>, k: PortKey): Vec | null {
  const c = comps.get(portComp(k));
  return c ? portPos(c, portIndex(k)) : null;
}

/** prostokąt zajmowany przez element (siatka), do klikania */
export function bounds(c: Component): { x0: number; y0: number; x1: number; y1: number } {
  const pts = portOffsets(c.type).map((o) => rotate(o, c.rot));
  // 1-portowe: symbol rozciąga się w dół o 2 jednostki
  if (pts.length === 1) pts.push(rotate({ x: 0, y: 2 }, c.rot));
  const xs = pts.map((p) => c.pos.x + p.x);
  const ys = pts.map((p) => c.pos.y + p.y);
  return { x0: Math.min(...xs) - 0.5, y0: Math.min(...ys) - 1, x1: Math.max(...xs) + 0.5, y1: Math.max(...ys) + 1 };
}
