import { describe, expect, it } from 'vitest';
import { fitTau } from './helpers';

const W = 14;
// Po poprawce silnika (opór także na przemieszczenie z korekcji ciśnienia) zmierzone: 1,79× (−10,7%).
describe('M0.6 szereg', () => {
  it('dwie jednakowe szczeliny w szereg dają ok. 2× większe τ (±12%)', () => {
    const one = fitTau({ tanks: [{ w: W, fill: 28 }, { w: W, fill: 6 }], walls: [[{ gamma: 32 }]] });
    const two = fitTau({ tanks: [{ w: W, fill: 28 }, { w: 4, fill: 6 }, { w: W, fill: 6 }], walls: [[{ gamma: 32 }], [{ gamma: 32 }]] });
    expect(one.r2).toBeGreaterThan(0.99);
    expect(two.r2).toBeGreaterThan(0.99);
    expect(Math.abs(two.tau / one.tau / 2 - 1)).toBeLessThan(0.12);
    expect(one.lost + two.lost).toBe(0);
  }, 300_000);
});
