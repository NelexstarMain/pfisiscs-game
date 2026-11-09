import { describe, expect, it } from 'vitest';
import { FlowZone } from '../src/engine/elements';
import { chainLevel, makeChain } from '../src/engine/scenes';

const DT = 1 / 240;

describe('M0 spike: cewka jako FlowZone (rezonans LC)', () => {
  it('okres drgań dwóch zbiorników przez cewkę zgodny z 2π/ω ±10%', () => {
    const wA = 12;
    const wB = 12;
    const m = 0.2; // indukcyjność
    const c = makeChain({ tanks: [{ w: wA, fill: 26 }, { w: wB, fill: 16 }], walls: [[{ gamma: 0 }]], inner: 60 });
    const z = new FlowZone(c.sim, c.slots[0][0], { m, k: 0, c: 0.05, antiWindup: 0 }, () => chainLevel(c, 0) - chainLevel(c, 1));
    const T: number[] = [];
    const D: number[] = [];
    for (let k = 1; k <= 240 * 30; k++) {
      c.sim.step();
      z.step(DT);
      if (k % 12 === 0) {
        T.push(c.sim.time);
        D.push(chainLevel(c, 0) - chainLevel(c, 1));
      }
    }
    // okres z kolejnych przejść przez zero Δh (w dół)
    const mean = D.reduce((a, b) => a + b) / D.length;
    const cross: number[] = [];
    for (let i = 1; i < D.length; i++) {
      if (D[i - 1] - mean > 0 && D[i] - mean <= 0) cross.push(T[i]);
    }
    expect(cross.length).toBeGreaterThanOrEqual(3);
    const period = (cross[cross.length - 1] - cross[0]) / (cross.length - 1);
    const omega = Math.sqrt((1 / wA + 1 / wB) / m);
    const expected = (2 * Math.PI) / omega;
    expect(Math.abs(period / expected - 1)).toBeLessThan(0.1);
    expect(c.sim.lost).toBe(0);
  }, 240_000);
});

describe('M0 spike: kondensator pływający jako FlowZone (tłok ze sprężyną)', () => {
  it('relaksacja z τ ≈ c/(1/wA+1/wB+κ/h) ±10% i równowagą sprężyny, bez nieszczelności', () => {
    const wA = 12;
    const wB = 12;
    const kappa = 2;
    const cc = 2;
    const c = makeChain({ tanks: [{ w: wA, fill: 26 }, { w: wB, fill: 16 }], walls: [[{ gamma: 0 }]], inner: 60 });
    const z = new FlowZone(c.sim, c.slots[0][0], { m: 0.02, k: kappa, c: cc }, () => chainLevel(c, 0) - chainLevel(c, 1));
    const n0 = c.sim.fluidCount;
    const T: number[] = [];
    const D: number[] = [];
    let acc = 0;
    let cnt = 0;
    for (let k = 1; k <= 240 * 25; k++) {
      c.sim.step();
      z.step(DT);
      acc += chainLevel(c, 0) - chainLevel(c, 1);
      cnt++;
      if (k % 30 === 0) {
        T.push(c.sim.time);
        D.push(acc / cnt);
        acc = 0;
        cnt = 0;
      }
    }
    const inf = D.slice(-10).reduce((a, b) => a + b) / 10;
    // równowaga sprężyny: κ·X = Δh∞ (brak przecieku przez strefę)
    expect(Math.abs((kappa * z.X) / inf - 1)).toBeLessThan(0.05);
    // wartość graniczna Δh∞ = Δh0 (κ/h) / (1/wA+1/wB+κ/h)
    const ceff = 1 / wA + 1 / wB;
    const expInf = (10 * (kappa / z.hz)) / (ceff + kappa / z.hz);
    expect(Math.abs(inf / expInf - 1)).toBeLessThan(0.12);
    // stała czasowa z dopasowania ln(Δh − Δh∞)
    const idx = D.map((_, i) => i).filter((i) => i > 2 && D[i] - inf > 0.15 * (D[2] - inf));
    const x = idx.map((i) => T[i]);
    const y = idx.map((i) => Math.log(D[i] - inf));
    const nn = x.length;
    const mx = x.reduce((a, b) => a + b) / nn;
    const my = y.reduce((a, b) => a + b) / nn;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < nn; i++) {
      sxx += (x[i] - mx) ** 2;
      sxy += (x[i] - mx) * (y[i] - my);
    }
    const tau = -sxx / sxy;
    const expTau = cc / (ceff + kappa / z.hz);
    expect(Math.abs(tau / expTau - 1)).toBeLessThan(0.1);
    expect(c.sim.fluidCount).toBe(n0);
    expect(c.sim.lost).toBe(0);
  }, 240_000);
});
