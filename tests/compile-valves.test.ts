import { describe, expect, it } from 'vitest';
import { build, compile, settle } from './helpers-circuit';

describe('M3 zawory: dioda, LED, bezpiecznik', () => {
  it('dioda przepuszcza w kierunku A→K i blokuje w odwrotnym', () => {
    let rf = '';
    const fwd = build((add, w) => {
      const s = add('supply', 9);
      const dd = add('diode');
      rf = add('resistor', 47);
      const g = add('ground');
      w(`${s}:1`, `${dd}:0`); // anoda do plusa
      w(`${dd}:1`, `${rf}:0`);
      w(`${rf}:1`, `${g}:0`);
      w(`${s}:0`, `${g}:0`);
    });
    const [iF] = settle(compile(fwd), 10, 4, (wd) => [wd.current(rf)]);
    let rr = '';
    const rev = build((add, w) => {
      const s = add('supply', 9);
      const dd = add('diode');
      rr = add('resistor', 47);
      const g = add('ground');
      w(`${s}:1`, `${dd}:1`); // katoda do plusa: kierunek zaporowy
      w(`${dd}:0`, `${rr}:0`);
      w(`${rr}:1`, `${g}:0`);
      w(`${s}:0`, `${g}:0`);
    });
    const [iR] = settle(compile(rev), 10, 4, (wd) => [wd.current(rr)]);
    expect(iF).toBeGreaterThan(0.08);
    expect(Math.abs(iR)).toBeLessThan(0.02);
  }, 120_000);

  it('bezpiecznik pęka po przekroczeniu prądu i można go wymienić', () => {
    let fu = '';
    let r = '';
    const d = build((add, w) => {
      const s = add('supply', 9);
      fu = add('fuse', 0.1);
      r = add('resistor', 22);
      const g = add('ground');
      w(`${s}:1`, `${fu}:0`);
      w(`${fu}:1`, `${r}:0`);
      w(`${r}:1`, `${g}:0`);
      w(`${s}:0`, `${g}:0`);
    });
    const world = compile(d);
    for (let k = 0; k < 240 * 10; k++) world.step();
    expect(world.blown.has(fu)).toBe(true);
    const [i] = settle(world, 4, 3, (wd) => [wd.current(r)]);
    expect(Math.abs(i)).toBeLessThan(0.03);
    world.resetFuse(fu);
    expect(world.blown.has(fu)).toBe(false);
  }, 120_000);
});
