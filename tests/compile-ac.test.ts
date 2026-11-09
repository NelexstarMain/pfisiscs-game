import { describe, expect, it } from 'vitest';
import { build, compile } from './helpers-circuit';

describe('źródło AC i obwody równoległe', () => {
  it('AC: napięcie i prąd na rezystorze zmieniają znak, amplituda napięcia ≈ ustawiona (±35%)', () => {
    let r = '';
    const d = build((add, w) => {
      const s = add('ac', 4);
      r = add('resistor', 47);
      const g = add('ground');
      w(`${s}:1`, `${r}:0`);
      w(`${r}:1`, `${g}:0`);
      w(`${s}:0`, `${g}:0`);
    });
    const world = compile(d);
    const plus = 'c1:1';
    let vmax = -99;
    let vmin = 99;
    let imax = -99;
    let imin = 99;
    for (let k = 0; k < 240 * 32; k++) {
      world.step();
      if (world.time > 12) {
        vmax = Math.max(vmax, world.voltage(plus));
        vmin = Math.min(vmin, world.voltage(plus));
        imax = Math.max(imax, world.current(r));
        imin = Math.min(imin, world.current(r));
      }
    }
    expect(vmax).toBeGreaterThan(4 * 0.65);
    expect(vmax).toBeLessThan(4 * 1.35);
    expect(vmin).toBeLessThan(-4 * 0.65);
    expect(imax).toBeGreaterThan(0.03);
    // w świecie z wiszącymi naczyniami upływ w górę (węzeł poniżej masy) jest słabszy (ok. 60% i próg ok. 2 V), patrz docs/M2-notes.md
    expect(imin).toBeLessThan(-0.015);
    expect(world.sim.lost).toBe(0);
  }, 180_000);

  it('dwie jednakowe żarówki równolegle pobierają ok. 2× więcej prądu (±25%)', () => {
    const run = (n: number) => {
      const ids: string[] = [];
      const d = build((add, w) => {
        const s = add('supply', 9);
        const g = add('ground');
        w(`${s}:0`, `${g}:0`);
        for (let i = 0; i < n; i++) {
          const b = add('bulb', 47);
          ids.push(b);
          w(`${s}:1`, `${b}:0`);
          w(`${b}:1`, `${g}:0`);
        }
      });
      const world = compile(d);
      for (let k = 0; k < 240 * 12; k++) world.step();
      let sum = 0;
      for (let k = 0; k < 240 * 5; k++) {
        world.step();
        sum += ids.reduce((a, id) => a + world.current(id), 0) / (240 * 5);
      }
      return sum;
    };
    const one = run(1);
    const two = run(2);
    expect(Math.abs(two / one / 2 - 1)).toBeLessThan(0.25);
  }, 180_000);
});
