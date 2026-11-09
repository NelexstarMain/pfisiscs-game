import { describe, expect, it } from 'vitest';
import { build, compile, settle } from './helpers-circuit';

describe('M1 kompilator: prawo Ohma w obwodzie zasilacz + rezystor', () => {
  for (const R of [22, 47, 100, 220]) {
    it(`R = ${R} Ω daje I ≈ V/R (±12%), napięcie ≈ 9 V (±5%)`, () => {
      let rid = '';
      const d = build((add, w) => {
        const s = add('supply', 9);
        rid = add('resistor', R);
        const g = add('ground');
        w(`${s}:1`, `${rid}:0`);
        w(`${rid}:1`, `${g}:0`);
        w(`${s}:0`, `${g}:0`);
      });
      const world = compile(d);
      const plus = [...world.tanks.keys()].find((n) => n !== world.gnd.net)!;
      const [v, i] = settle(world, 12, 5, (wd) => [wd.voltage(plus), wd.current(rid)]);
      expect(Math.abs(v / 9 - 1)).toBeLessThan(0.05);
      expect(Math.abs(i / (v / R) - 1)).toBeLessThan(R >= 200 ? 0.18 : 0.12);
      expect(world.sim.lost).toBe(0);
    }, 120_000);
  }
});
