import { level, makeTwoTanks } from '../src/engine/scenes';
const [gamma, slotLen, slotH, xsph] = process.argv.slice(2).map(Number);
const t = makeTwoTanks({ wA: 12, wB: 12, fillA: 28, fillB: 6, gamma, slotLen, slotH });
const s = t.sim; s.tune.xsph = xsph; const sl = t.slot;
const pts: [number, number][] = [];
let a = { dh: 0, i: 0, c: 0 };
for (let k = 1; k <= 240 * 10; k++) {
  s.step();
  const v = s.vxIn(sl.x0, sl.y0, sl.x1, sl.y1);
  a.i += v.count ? (v.sum / v.count) * (sl.y1 - sl.y0) : 0;
  a.dh += level(t, 'a') - level(t, 'b'); a.c++;
  if (k % 60 === 0) { if (s.time > 0.75) pts.push([a.dh / a.c, a.i / a.c]); a = { dh: 0, i: 0, c: 0 }; }
}
// regresja I = k*dh + b  (tylko dh > 3, poza strefą przy zerze)
const P = pts.filter(p => p[0] > 3);
const n = P.length, mx = P.reduce((s2, p) => s2 + p[0], 0) / n, my = P.reduce((s2, p) => s2 + p[1], 0) / n;
let sxx = 0, sxy = 0, syy = 0; for (const [x, y] of P) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
const k = sxy / sxx, b = my - k * mx, r2 = (sxy * sxy) / (sxx * syy);
console.log(`gamma=${gamma} L=${slotLen} H=${slotH} xsph=${xsph}: G=${k.toFixed(3)} intercept=${b.toFixed(2)} R2=${r2.toFixed(4)} n=${n} range dh ${Math.min(...P.map(p=>p[0])).toFixed(1)}..${Math.max(...P.map(p=>p[0])).toFixed(1)}`);
