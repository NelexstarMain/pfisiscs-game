import { describe, expect, it } from 'vitest';
import { PARAMS } from '../src/engine/constants';
import { level, makeTwoTanks } from '../src/engine/scenes';

function run(sim: { step(): void }, seconds: number) {
  const steps = Math.round(seconds / PARAMS.dt);
  for (let k = 0; k < steps; k++) sim.step();
}

describe('M0.2 hydrostatyka i podstawy', () => {
  it('cząstki zostają w domenie, N zachowane, stan ustala się', () => {
    const t = makeTwoTanks({ wA: 12, wB: 12, fillA: 20, fillB: 20 });
    const n0 = t.sim.fluidCount;
    run(t.sim, 3);
    expect(t.sim.fluidCount).toBe(n0);
    expect(t.sim.lost).toBe(0);
    // prędkość po osiadnięciu mała względem sqrt(g H)
    let vmax = 0;
    for (let i = t.sim.nB; i < t.sim.n; i++) vmax = Math.max(vmax, Math.hypot(t.sim.vx[i], t.sim.vy[i]));
    expect(vmax).toBeLessThan(0.05 * Math.sqrt(PARAMS.g * 20) * 4);
    // poziom równy ilości wlanej wody ±5%
    const la = level(t, 'a');
    expect(Math.abs(la - 20) / 20).toBeLessThan(0.05);
  });

  it('deterministyczny hash dla dwóch przebiegów', () => {
    const mk = () => {
      const t = makeTwoTanks({ wA: 8, wB: 8, fillA: 14, fillB: 4 });
      run(t.sim, 0.5);
      return t.sim.hash();
    };
    expect(mk()).toBe(mk());
  });
});

describe('M0.7 RC: rozładowanie przez szczelinę', () => {
  it('Δh(t) maleje wykładniczo (ln liniowy, R² ≥ 0,99)', () => {
    const t = makeTwoTanks({ wA: 12, wB: 12, fillA: 28, fillB: 6, inner: 70, gamma: 32, slotLen: 4, slotH: 4 });
    t.sim.tune.xsph = 0.04;
    const T: number[] = [];
    const D: number[] = [];
    let acc = 0;
    let c = 0;
    for (let k = 1; k <= 240 * 25; k++) {
      t.sim.step();
      acc += level(t, 'a') - level(t, 'b');
      c++;
      if (k % 30 === 0) {
        T.push(t.sim.time);
        D.push(acc / c);
        acc = 0;
        c = 0;
      }
    }
    const off = D.slice(-8).reduce((a, b) => a + b) / 8; // resztkowa strefa martwa
    expect(Math.abs(off)).toBeLessThan(1.5);
    const d0 = D[2] - off;
    const idx = D.map((_, i) => i).filter((i) => D[i] - off <= 0.8 * d0 && D[i] - off > 2);
    const x = idx.map((i) => T[i]);
    const y = idx.map((i) => Math.log(D[i] - off));
    const n = x.length;
    const mx = x.reduce((a, b) => a + b) / n;
    const my = y.reduce((a, b) => a + b) / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sxx += (x[i] - mx) ** 2;
      sxy += (x[i] - mx) * (y[i] - my);
      syy += (y[i] - my) ** 2;
    }
    expect(n).toBeGreaterThan(15);
    expect((sxy * sxy) / (sxx * syy)).toBeGreaterThanOrEqual(0.99);
    expect(t.sim.lost).toBe(0);
  }, 120_000);
});

// Kolejne progi M0 z planu. Wstępne wyniki i wnioski: docs/M0-notes.md
describe('M0 – do zrobienia (bramka go/no-go)', () => {
  it.todo('M0.3 sondy: |V_licznik − V_powierzchnia| < 3%, σ(V) < 0,5% V_max');
  it.todo('M0.5 Ohm: R² ≥ 0,99, ±5%, niezależność od poziomu średniego, R(2γ)/R(γ) = 2 ± 5%');
  it.todo('M0.6 szereg/równoległość ±7%, dzielnik ±0,03');
});
