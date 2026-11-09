import { chainLevel, makeChain } from '../src/engine/scenes';
// tryb: single | series | parallel | divider
const mode = process.argv[2]; const gamma = Number(process.argv[3] ?? 32);
const W = 14; // zbiorniki A i G
let c;
if (mode === 'single') c = makeChain({ tanks: [{ w: W, fill: 28 }, { w: W, fill: 6 }], walls: [[{ gamma }]] });
else if (mode === 'parallel') c = makeChain({ tanks: [{ w: W, fill: 28 }, { w: W, fill: 6 }], walls: [[{ gamma }, { gamma }]] });
else if (mode === 'series') c = makeChain({ tanks: [{ w: W, fill: 28 }, { w: 4, fill: 6 }, { w: W, fill: 6 }], walls: [[{ gamma }], [{ gamma }]] });
else c = makeChain({ tanks: [{ w: 30, fill: 30 }, { w: 4, fill: 10 }, { w: 30, fill: 2 }], walls: [[{ gamma: Number(process.argv[4] ?? gamma) }], [{ gamma }]] });
const s = c.sim; const last = c.tanks.length - 1;
const T: number[] = [], D: number[] = [], M: number[] = [];
let acc = 0, accm = 0, cnt = 0;
for (let k = 1; k <= 240 * (mode === 'divider' ? 12 : 40); k++) {
  s.step(); acc += chainLevel(c, 0) - chainLevel(c, last); accm += chainLevel(c, 1) ; cnt++;
  if (k % 30 === 0) { T.push(s.time); D.push(acc / cnt); M.push(accm / cnt); acc = 0; accm = 0; cnt = 0; }
}
if (mode === 'divider') {
  // średnia po oknie t in [3,9] s: (hM - hG)/(hA - hG)
  let a = 0, m = 0, g = 0, cn = 0;
  // ponowny przebieg niepotrzebny: używamy zapisanych D (hA-hG) i M (hM), a hG liczymy z bilansu poziomu
  const s2 = c.sim;
  console.log(`divider g1=${process.argv[4] ?? gamma} g2=${gamma}: hA=${chainLevel(c,0).toFixed(2)} hM=${chainLevel(c,1).toFixed(2)} hG=${chainLevel(c,2).toFixed(2)} ratio=${((chainLevel(c,1)-chainLevel(c,2))/(chainLevel(c,0)-chainLevel(c,2))).toFixed(3)} t=${s2.time.toFixed(1)}`);
  process.exit(0);
}
const off = D.slice(-8).reduce((a, b) => a + b) / 8;
const d0 = D[2] - off;
const idx = D.map((_, i) => i).filter(i => D[i] - off <= 0.8 * d0 && D[i] - off > 2);
const x = idx.map(i => T[i]), y = idx.map(i => Math.log(D[i] - off));
const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
let sxx = 0, sxy = 0, syy = 0; for (let i = 0; i < n; i++) { sxx += (x[i]-mx)**2; sxy += (x[i]-mx)*(y[i]-my); syy += (y[i]-my)**2; }
console.log(`${mode} gamma=${gamma}: tau=${(-1 / (sxy / sxx)).toFixed(3)} R2=${(sxy*sxy/(sxx*syy)).toFixed(4)} n=${n} off=${off.toFixed(2)} lost=${s.lost}`);
