import { describe, expect, it } from 'vitest';
import { chainLevel, makeChain } from '../src/engine/scenes';

function ratioAt(g1: number, g2: number, seconds: number) {
  const c = makeChain({
    tanks: [{ w: 30, fill: 40 }, { w: 12, fill: 24 }, { w: 30, fill: 12 }],
    walls: [[{ gamma: g1 }], [{ gamma: g2 }]],
  });
  let a = 0;
  let m = 0;
  let g = 0;
  let n = 0;
  for (let k = 1; k <= 240 * seconds; k++) {
    c.sim.step();
    if (k > 240 * (seconds - 1)) {
      a += chainLevel(c, 0);
      m += chainLevel(c, 1);
      g += chainLevel(c, 2);
      n++;
    }
  }
  return { ratio: (m / n - g / n) / (a / n - g / n), lost: c.sim.lost };
}

describe('M0.6 dzielnik napięcia', () => {
  // Znany stały błąd ok. −0,06 (węzeł środkowy czyta ok. 1 komórki za nisko pod przepływem),
  // do skalibrowania w kompilatorze. Tu pilnujemy, żeby się nie pogorszył. Patrz docs/M0-notes.md.
  it('1:1 daje ok. 0,5 z tolerancją ±0,07', () => {
    const r = ratioAt(32, 32, 5);
    expect(Math.abs(r.ratio - 0.5)).toBeLessThan(0.07);
    expect(r.lost).toBe(0);
  }, 120_000);

  it('rośnie, gdy zwiększamy opór górnej szczeliny: kierunek się zgadza', () => {
    const hi = ratioAt(96, 32, 5).ratio; // górna szczelina oporniejsza, M bliżej G... spadek na górnej większy
    const lo = ratioAt(32, 96, 5).ratio;
    expect(hi).toBeLessThan(0.4);
    expect(lo).toBeGreaterThan(0.55);
  }, 240_000);
});
