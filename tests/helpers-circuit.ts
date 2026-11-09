import { compile, type World } from '../src/compile/world';
import { Doc } from '../src/model/doc';
import type { ComponentType } from '../src/components/defs';

export type Add = (t: ComponentType, v?: number) => string;
export type Wire = (a: string, b: string) => void;

export function build(fn: (add: Add, w: Wire) => void): Doc {
  const d = new Doc();
  let x = 0;
  const add: Add = (t, v) => {
    const c = d.makeAdd(t, { x: (x += 4), y: 0 });
    d.apply(c);
    const id = (c as { comp: { id: string } }).comp.id;
    if (v !== undefined) d.apply({ kind: 'value', id, value: v });
    return id;
  };
  fn(add, (a, b) => d.apply(d.makeWire(a, b)));
  return d;
}

/** uruchamia świat przez warmup, potem uśrednia pomiary przez avg sekund */
export function settle(world: World, warmup: number, avg: number, probe: (w: World) => number[]): number[] {
  const steps = (s: number) => Math.round(s * 240);
  for (let k = 0; k < steps(warmup); k++) world.step();
  const sums: number[] = [];
  const n = steps(avg);
  for (let k = 0; k < n; k++) {
    world.step();
    probe(world).forEach((v, i) => (sums[i] = (sums[i] ?? 0) + v / n));
  }
  return sums;
}

export { compile };
