import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
import { EXAMPLES } from '../src/examples';
const phaseT = Number(process.argv[2]);
const d = new Doc(); d.load(JSON.parse(JSON.stringify(EXAMPLES.ac.data)));
const w = compile(d, { k: 1 });
for (let q = 0; q < 240 * 25; q++) { w.step(); w.time = phaseT; }
const s = w.sim;
const top = (x0: number, x1: number, y0: number, y1: number) => { const ys: number[] = []; for (let i = s.nB; i < s.n; i++) if (s.px[i] >= x0 && s.px[i] < x1 && s.py[i] >= y0 && s.py[i] < y1) ys.push(s.py[i]); ys.sort((a, b) => a - b); return { y95: ys[Math.floor(ys.length * 0.95)], n: ys.length }; };
const b = w.gnd, v = w.tanks.get('c1:1')!;
const tb = top(b.rect.x0, b.rect.x1, b.rect.y0, b.rimY + 6), tv = top(v.rect.x0, v.rect.x1, v.rect.y0, v.rimY + 6);
const dens = (t: any, rows: number[]) => rows.map(r => { let n = 0; for (let i = s.nB; i < s.n; i++) if (s.py[i] >= r && s.py[i] < r + 1 && s.px[i] >= t.rect.x0 && s.px[i] < t.rect.x1) n++; return (n / (t.rect.x1 - t.rect.x0)).toFixed(2); }).join(' ');
console.log(`basen: count-powierzchnia=${w.surfaceY(b).toFixed(2)} y95=${tb.y95.toFixed(2)} N=${tb.n} szer=${b.rect.x1 - b.rect.x0} głębokość=${(w.surfaceY(b) - b.floorY).toFixed(1)}`);
console.log(`naczynie: count-powierzchnia=${w.surfaceY(v).toFixed(2)} y95=${tv.y95.toFixed(2)} N=${tv.n}`);
console.log(`gęstość basenu w warstwach od dna co 4: ${dens(b, [6, 10, 14, 18, 22, 26, 30, 34])}`);
