import { describe, expect, it } from 'vitest';
import { fitTau } from './helpers';

const W = 14;
describe('M0.6 równolegle', () => {
  // przy małych γ (szybkie τ) bezwładność wody zaburza pomiar, więc próg sprawdzamy dla γ = 64
  it('dwie jednakowe szczeliny równolegle dają ok. 0,5× τ (±7%) dla γ=64', () => {
    const one = fitTau({ tanks: [{ w: W, fill: 28 }, { w: W, fill: 6 }], walls: [[{ gamma: 64 }]] });
    const two = fitTau({ tanks: [{ w: W, fill: 28 }, { w: W, fill: 6 }], walls: [[{ gamma: 64 }, { gamma: 64 }]] });
    expect(one.r2).toBeGreaterThan(0.99);
    expect(two.r2).toBeGreaterThan(0.99);
    expect(Math.abs((two.tau / one.tau) / 0.5 - 1)).toBeLessThan(0.07);
    expect(one.lost + two.lost).toBe(0);
  }, 300_000);
});
