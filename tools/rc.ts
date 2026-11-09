import { level, makeTwoTanks } from '../src/engine/scenes';
const gamma = Number(process.argv[2]); const L = Number(process.argv[3] ?? 4); const H = Number(process.argv[4] ?? 4);
const w = Number(process.argv[5] ?? 12);
const fA = Number(process.argv[6] ?? 28), fB = Number(process.argv[7] ?? 6);
const t = makeTwoTanks({ wA: w, wB: w, fillA: fA, fillB: fB, inner: 70, gamma, slotLen: L, slotH: H });
const s = t.sim; s.tune.xsph = 0.04;
const T: number[] = [], D: number[] = [];
let acc = 0, c = 0;
const total = 240 * Number(process.env.SECONDS ?? 40);
for (let k = 1; k <= total; k++) {
  s.step(); acc += level(t, 'a') - level(t, 'b'); c++;
  if (k % 30 === 0) { T.push(s.time); D.push(acc / c); acc = 0; c = 0; }
}
const off = D.slice(-8).reduce((a, b) => a + b) / 8;
const d0 = D[2] - off;
// zakres dopasowania: od 0.8*d0 do 2.5 (powyżej strefy martwej)
const idx = D.map((d, i) => i).filter(i => D[i] - off <= 0.8 * d0 && D[i] - off > 2.0);
const x = idx.map(i => T[i]), y = idx.map(i => Math.log(D[i] - off));
const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
let sxx = 0, sxy = 0, syy = 0; for (let i = 0; i < n; i++) { sxx += (x[i]-mx)**2; sxy += (x[i]-mx)*(y[i]-my); syy += (y[i]-my)**2; }
const slope = sxy / sxx, r2 = sxy*sxy/(sxx*syy);
const Cser = (w * w) / (2 * w);
console.log(`gamma=${gamma} L=${L} H=${H} w=${w} fA=${fA} fB=${fB}: tau=${(-1/slope).toFixed(3)}s R2(ln)=${r2.toFixed(4)} n=${n} G=C/tau=${(Cser/(-1/slope)).toFixed(3)} off=${off.toFixed(2)} lost=${s.lost}`);
