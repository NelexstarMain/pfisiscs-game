import { chainLevel, makeChain, type ChainOpts } from '../src/engine/scenes';

/** Stała czasowa rozładowania zbiornika 0 do ostatniego (dopasowanie ln(Δh − offset)). */
export function fitTau(opts: ChainOpts, seconds = 40) {
  const c = makeChain(opts);
  const last = c.tanks.length - 1;
  const T: number[] = [];
  const D: number[] = [];
  let acc = 0;
  let cnt = 0;
  for (let k = 1; k <= 240 * seconds; k++) {
    c.sim.step();
    acc += chainLevel(c, 0) - chainLevel(c, last);
    cnt++;
    if (k % 30 === 0) {
      T.push(c.sim.time);
      D.push(acc / cnt);
      acc = 0;
      cnt = 0;
    }
  }
  const off = D.slice(-8).reduce((a, b) => a + b) / 8;
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
  return { tau: -sxx / sxy, r2: (sxy * sxy) / (sxx * syy), n, off, lost: c.sim.lost };
}
