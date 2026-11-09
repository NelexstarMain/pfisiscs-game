import { describe, expect, it } from 'vitest';
import { build, compile, settle } from './helpers-circuit';

describe('M1 kompilator: dzielnik napięcia i przełącznik', () => {
  it('dzielnik 47/47 Ω daje V(środek)/V(plus) ≈ 0,5 (±0,08)', () => {
    let r1 = '';
    let r2 = '';
    const d = build((add, w) => {
      const s = add('supply', 9);
      r1 = add('resistor', 47);
      r2 = add('resistor', 47);
      const g = add('ground');
      w(`${s}:1`, `${r1}:0`);
      w(`${r1}:1`, `${r2}:0`);
      w(`${r2}:1`, `${g}:0`);
      w(`${s}:0`, `${g}:0`);
    });
    const world = compile(d);
    const nets = [...world.tanks.keys()].filter((n) => n !== world.gnd.net);
    const plus = nets.find((n) => n === 'c1:1')!;
    const mid = nets.find((n) => n !== plus)!;
    const [vp, vm] = settle(world, 14, 5, (wd) => [wd.voltage(plus), wd.voltage(mid)]);
    expect(Math.abs(vm / vp - 0.5)).toBeLessThan(0.08);
    expect(world.sim.lost).toBe(0);
  }, 120_000);

  it('przełącznik: rozwarty blokuje prąd, zwarty przepuszcza', () => {
    let sw = '';
    let r = '';
    const d = build((add, w) => {
      const s = add('supply', 9);
      sw = add('switch', 0);
      r = add('resistor', 47);
      const g = add('ground');
      w(`${s}:1`, `${sw}:0`);
      w(`${sw}:1`, `${r}:0`);
      w(`${r}:1`, `${g}:0`);
      w(`${s}:0`, `${g}:0`);
    });
    const world = compile(d);
    const [iOpen] = settle(world, 8, 3, (wd) => [wd.current(r)]);
    world.setSwitch(sw, true);
    const [iClosed] = settle(world, 10, 4, (wd) => [wd.current(r)]);
    expect(Math.abs(iOpen)).toBeLessThan(0.02);
    expect(iClosed).toBeGreaterThan(0.1);
    expect(iClosed).toBeLessThan(0.25);
  }, 120_000);
});
