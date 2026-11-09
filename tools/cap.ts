import { FlowZone } from '../src/engine/elements';
import { chainLevel, makeChain } from '../src/engine/scenes';
const kappa = Number(process.argv[2] ?? 2), cc = Number(process.argv[3] ?? 2), m = Number(process.argv[4] ?? 0.02);
const wA = 12, wB = 12;
const c = makeChain({ tanks: [{ w: wA, fill: 26 }, { w: wB, fill: 16 }], walls: [[{ gamma: 0 }]], inner: 60 });
const z = new FlowZone(c.sim, c.slots[0][0], { m, k: kappa, c: cc }, () => chainLevel(c, 0) - chainLevel(c, 1));
const hz = z.hz; const Ceff = 1 / wA + 1 / wB;
const lam = (Ceff + kappa / hz) / cc;
const dh0 = 10; const dhInf = dh0 * (kappa / hz) / (Ceff + kappa / hz);
const T: number[] = [], D: number[] = [];
let acc = 0, n = 0;
for (let k = 1; k <= 240 * 25; k++) { c.sim.step(); z.step(1 / 240); acc += chainLevel(c, 0) - chainLevel(c, 1); n++; if (k % 30 === 0) { T.push(c.sim.time); D.push(acc / n); acc = 0; n = 0; } }
const inf = D.slice(-10).reduce((a, b) => a + b) / 10;
const idx = D.map((_, i) => i).filter(i => D[i] - inf > 0.15 * (D[2] - inf) && i > 2);
const x = idx.map(i => T[i]), y = idx.map(i => Math.log(D[i] - inf));
const nn = x.length, mx = x.reduce((a, b) => a + b) / nn, my = y.reduce((a, b) => a + b) / nn;
let sxx = 0, sxy = 0, syy = 0; for (let i = 0; i < nn; i++) { sxx += (x[i]-mx)**2; sxy += (x[i]-mx)*(y[i]-my); syy += (y[i]-my)**2; }
console.log(`kappa=${kappa} c=${cc} m=${m}: dh_inf=${inf.toFixed(2)} expected=${dhInf.toFixed(2)} tau=${(-sxx/sxy).toFixed(2)} expected=${(1/lam).toFixed(2)} R2=${(sxy*sxy/(sxx*syy)).toFixed(3)} X=${z.X.toFixed(2)} N=${c.sim.fluidCount} lost=${c.sim.lost}`);
