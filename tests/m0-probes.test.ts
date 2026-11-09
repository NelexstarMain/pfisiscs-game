import { describe, expect, it } from 'vitest';
import { chainLevel, makeChain } from '../src/engine/scenes';

describe('M0.3 sonda poziomu węzła', () => {
  it('szum (σ po wygładzeniu EMA 0,1 s) < 0,5% V_max w stanie ustalonym', () => {
    const c = makeChain({ tanks: [{ w: 12, fill: 20 }, { w: 12, fill: 20 }], walls: [[{ gamma: 32 }]] });
    for (let k = 0; k < 240 * 4; k++) c.sim.step();
    const alpha = 1 - Math.exp(-(1 / 240) / 0.1);
    let ema = chainLevel(c, 0);
    const xs: number[] = [];
    for (let k = 0; k < 240 * 3; k++) {
      c.sim.step();
      ema += alpha * (chainLevel(c, 0) - ema);
      xs.push(ema);
    }
    const mean = xs.reduce((a, b) => a + b) / xs.length;
    const sigma = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    const vmax = 20;
    expect(sigma / vmax).toBeLessThan(0.005);
  }, 60_000);

  it('poziom odtwarza znaną objętość wody (z dokładnością do wody w szczelinie)', () => {
    const c = makeChain({ tanks: [{ w: 12, fill: 20 }, { w: 12, fill: 20 }], walls: [[{ gamma: 32 }]] });
    for (let k = 0; k < 240 * 4; k++) c.sim.step();
    const total = (chainLevel(c, 0) + chainLevel(c, 1)) * 12;
    const slot = c.sim.countIn(c.slots[0][0].x0, c.slots[0][0].y0, c.slots[0][0].x1, c.slots[0][0].y1);
    expect(total + slot).toBeGreaterThanOrEqual(c.sim.fluidCount - 4); // reszta: cząstki ponad szczeliną w ścianie
  }, 60_000);
});
