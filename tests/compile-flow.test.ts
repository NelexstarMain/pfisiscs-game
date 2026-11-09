import { describe, expect, it } from 'vitest';
import { build, compile } from './helpers-circuit';

describe('cewka i kondensator pływający w obwodzie', () => {
  it('cewka: prąd narasta powoli (bezwładność), potem zbliża się do V/R', () => {
    let l = '';
    let r = '';
    const d = build((add, w) => {
      const s = add('supply', 9);
      l = add('inductor', 1);
      r = add('resistor', 47);
      const g = add('ground');
      w(`${s}:1`, `${l}:0`);
      w(`${l}:1`, `${r}:0`);
      w(`${r}:1`, `${g}:0`);
      w(`${s}:0`, `${g}:0`);
    });
    const world = compile(d);
    const at = (t: number) => {
      while (world.time < t) world.step();
      return world.current(r);
    };
    const early = at(1.5);
    const late = at(30);
    expect(late).toBeGreaterThan(0.1);
    expect(late).toBeLessThan(0.3);
    expect(early).toBeLessThan(late * 0.75);
    expect(world.sim.lost).toBe(0);
  }, 180_000);

  it('kondensator pływający przepuszcza chwilowy prąd, ale blokuje stały', () => {
    let c = '';
    let r = '';
    const d = build((add, w) => {
      const s = add('supply', 9);
      c = add('capacitor', 10);
      r = add('resistor', 47);
      const g = add('ground');
      w(`${s}:1`, `${c}:0`);
      w(`${c}:1`, `${r}:0`);
      w(`${r}:1`, `${g}:0`);
      w(`${s}:0`, `${g}:0`);
    });
    const world = compile(d);
    let peak = 0;
    while (world.time < 4) {
      world.step();
      peak = Math.max(peak, world.current(r));
    }
    while (world.time < 45) world.step();
    expect(peak).toBeGreaterThan(0.04);
    expect(world.current(r)).toBeLessThan(0.025);
    expect(world.sim.lost).toBe(0);
  }, 240_000);
});
