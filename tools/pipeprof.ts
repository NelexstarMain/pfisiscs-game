import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
import { EXAMPLES } from '../src/examples';
const phaseT = Number(process.argv[2]);
const d = new Doc(); d.load(JSON.parse(JSON.stringify(EXAMPLES.ac.data)));
const w = compile(d, { k: 1 });
for (let q = 0; q < 240 * 25; q++) { w.step(); w.time = phaseT; }
const s = w.sim; const p = w.layout.pipes[0]; const c = p.cavity[0]; const v = w.layout.vessels[0];
console.log(`rura x[${c.x0},${c.x1}) y[${c.y0},${c.y1}) strefa y[${p.zone.y0},${p.zone.y1}) naczynie dno=${v.floorY} x[${v.rect.x0},${v.rect.x1}) powierzchnia=${w.surfaceY(w.tanks.get(v.net)!).toFixed(1)} basen=${w.surfaceY(w.gnd).toFixed(1)}`);
const rows: string[] = [];
for (let y = c.y0 - 4; y < v.floorY + 6; y++) {
  let n = 0, sv = 0;
  for (let i = s.nB; i < s.n; i++) if (s.py[i] >= y && s.py[i] < y + 1 && s.px[i] >= c.x0 && s.px[i] < c.x1) { n++; sv += s.vy[i]; }
  rows.push(`y=${y}: n=${n}/4 vy=${n ? (sv / n).toFixed(2) : '-'}`);
}
console.log(rows.join('\n'));
