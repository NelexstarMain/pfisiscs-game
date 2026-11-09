import { chainLevel, makeChain } from '../src/engine/scenes';
const [g1, g2, mw, fA, fM, fG] = process.argv.slice(2).map(Number);
const c = makeChain({ tanks: [{ w: 30, fill: fA }, { w: mw, fill: fM }, { w: 30, fill: fG }], walls: [[{ gamma: g1 }], [{ gamma: g2 }]] });
const s = c.sim;
const rec: number[][] = [];
let a = 0, m = 0, g = 0, n = 0;
for (let k = 1; k <= 240 * 8; k++) {
  s.step(); a += chainLevel(c, 0); m += chainLevel(c, 1); g += chainLevel(c, 2); n++;
  if (k % 120 === 0) { rec.push([s.time, a / n, m / n, g / n]); a = m = g = n = 0; }
}
// okno 3..7 s
const r0 = rec[5], r1 = rec[13]; const dt = r1[0] - r0[0];
const I1 = -(r1[1] - r0[1]) / dt * 30, I2 = (r1[3] - r0[3]) / dt * 30;
const avg = (i: number) => rec.slice(5, 14).reduce((x, r) => x + r[i], 0) / 9;
const A = avg(1), M = avg(2), G = avg(3);
console.log(`g1=${g1} g2=${g2} mw=${mw}: A=${A.toFixed(1)} M=${M.toFixed(1)} G=${G.toFixed(1)} D1=${(A-M).toFixed(2)} D2=${(M-G).toFixed(2)} I1=${I1.toFixed(1)} I2=${I2.toFixed(1)} G1=${(I1/(A-M)).toFixed(3)} G2=${(I2/(M-G)).toFixed(3)}`);
