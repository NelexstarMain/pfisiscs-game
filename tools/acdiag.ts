import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
import { EXAMPLES } from '../src/examples';
const d = new Doc(); d.load(JSON.parse(JSON.stringify(EXAMPLES.ac.data)));
const w = compile(d, { k: Number(process.argv[2] ?? 1) });
if (process.argv[3]) w.sim.tune.iterations = Number(process.argv[3]);
const R = 'c3'; const plus = 'c1:1';
let vmax = -99, vmin = 99, imax = -99, imin = 99;
const rows: string[] = [];
for (let k = 1; k <= 240 * 34; k++) {
  w.step();
  if (w.time > 12) { const v = w.voltage(plus), i = w.current(R); vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); imax = Math.max(imax, i); imin = Math.min(imin, i); }
  if (k % 480 === 0 && w.time > 12) rows.push(`t=${w.time.toFixed(0)} V=${w.voltage(plus).toFixed(2)} I=${(w.current(R) * 1000).toFixed(0)}mA`);
}
console.log(`Vmax=${vmax.toFixed(2)} Vmin=${vmin.toFixed(2)} Imax=${(imax*1000).toFixed(0)}mA Imin=${(imin*1000).toFixed(0)}mA lost=${w.sim.lost}`);
console.log(rows.join('\n'));
