import { describe, expect, it } from 'vitest';
import { compile } from '../src/compile/world';
import { EXAMPLES } from '../src/examples';
import { Doc } from '../src/model/doc';

function load(key: string): Doc {
  const d = new Doc();
  d.load(JSON.parse(JSON.stringify(EXAMPLES[key].data)));
  return d;
}

describe('geometria świata: stałe ścianki i pełne rury', () => {
  for (const [key, k] of [
    ['divider', 1],
    ['parallel', 1],
    ['resistor', 2],
  ] as const) {
    it(`${key}, k=${k}: ścianki się nie zmieniają, rury pełne, nic nie ucieka`, () => {
      const w = compile(load(key), { k });
      const solidBefore = w.sim.grid.solid.slice();
      const heightsBefore = w.layout.vessels.map((v) => [v.floorY, v.rimY].join(','));
      const n0 = w.sim.fluidCount;
      for (let i = 0; i < 240 * 10; i++) w.step();
      expect(w.sim.grid.solid).toEqual(solidBefore);
      expect(w.layout.vessels.map((v) => [v.floorY, v.rimY].join(','))).toEqual(heightsBefore);
      expect(w.sim.lost).toBe(0);
      expect(w.sim.fluidCount).toBe(n0);
      for (const p of w.layout.pipes) {
        for (const c of p.cavity) {
          const cells = (c.x1 - c.x0) * (c.y1 - c.y0);
          const n = w.sim.countIn(c.x0, c.y0, c.x1, c.y1);
          expect(n / cells, `rura ${p.id}`).toBeGreaterThanOrEqual(0.97);
        }
      }
    }, 120_000);
  }

  it('wyższe napięcie wisi wyżej: zasilacz ponad węzłem środkowym ponad masą', () => {
    const w = compile(load('divider'));
    const sup = w.tanks.get('c1:1')!;
    const mid = [...w.tanks.values()].find((t) => t.net !== 'c1:1' && t.net !== w.gnd.net)!;
    expect(sup.nomY).toBeGreaterThan(mid.nomY);
    expect(mid.nomY).toBeGreaterThan(w.gnd.nomY);
  });
});
