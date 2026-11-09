import { chainLevel, makeChain } from '../src/engine/scenes';
const [gamma, fA, fB] = process.argv.slice(2).map(Number);
const c = makeChain({ tanks: [{ w: 30, fill: fA }, { w: 30, fill: fB }], walls: [[{ gamma }]] });
const s = c.sim;
const rec: { t: number; a: number; b: number }[] = [];
let a = 0, b = 0, n = 0;
for (let k = 1; k <= 240 * 5; k++) {
  s.step(); a += chainLevel(c, 0); b += chainLevel(c, 1); n++;
  if (k % 60 === 0) { rec.push({ t: s.time, a: a / n, b: b / n }); a = b = n = 0; }
}
// prąd z bilansu: I = -d(hA)/dt * 30 w oknie [1.5,4.5] s, Δh średnia
const r1 = rec[5], r0 = rec[1]; // t=1.5 → 0.5.. indeksy: rec[i].t = 0.25*(i+1)
const dt = r1.t - r0.t;
const I = -((r1.a - r0.a) / dt) * 30;
const dh = rec.slice(1, 6).reduce((x, r) => x + (r.a - r.b), 0) / 5;
const mean = rec.slice(1, 6).reduce((x, r) => x + (r.a + r.b) / 2, 0) / 5;
console.log(`gamma=${gamma} fill ${fA}/${fB}: dh=${dh.toFixed(2)} meanLevel=${mean.toFixed(1)} I=${I.toFixed(1)} G=I/dh=${(I / dh).toFixed(3)}`);
