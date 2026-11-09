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

// Kolejne progi M0 z planu. Wstępne wyniki i wnioski: docs/M0-notes.md
describe('M0 – do zrobienia (bramka go/no-go)', () => {
  it.todo('M0.3 sondy: |V_licznik − V_powierzchnia| < 3%, σ(V) < 0,5% V_max');
  it.todo('M0.5 Ohm: R² ≥ 0,99, ±5%, niezależność od poziomu średniego, R(2γ)/R(γ) = 2 ± 5%');
  it.todo('M0.6 szereg/równoległość ±7%, dzielnik ±0,03');
  it.todo('M0.7 RC: τ ±7%');
});
