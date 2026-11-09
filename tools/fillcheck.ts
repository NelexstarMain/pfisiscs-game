import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
import { EXAMPLES } from '../src/examples';
const phaseT = Number(process.argv[2]);
const d = new Doc(); d.load(JSON.parse(JSON.stringify(EXAMPLES.ac.data)));
const w = compile(d, { k: 1 });
for (let q = 0; q < 240 * 25; q++) { w.step(); w.time = phaseT; }
const s = w.sim;
const cnt = (x0: number, y0: number, x1: number, y1: number) => s.countIn(x0, y0, x1, y1);
for (const p of w.layout.pipes) for (const c of p.cavity) console.log(`rura ${p.id} [${c.x0},${c.y0})-[${c.x1},${c.y1}): ${cnt(c.x0, c.y0, c.x1, c.y1)}/${(c.x1 - c.x0) * (c.y1 - c.y0)}`);
if (w.layout.bus) { const b = w.layout.bus; console.log(`magistrala [${b.x0},${b.y0})-[${b.x1},${b.y1}): ${cnt(b.x0, b.y0, b.x1, b.y1)}/${(b.x1 - b.x0) * (b.y1 - b.y0)}`); }
for (const v of w.layout.vessels) console.log(`naczynie ${v.net} dno=${v.floorY} rim=${v.rimY} nom=${v.nomY} powierzchnia=${w.surfaceY(w.tanks.get(v.net)!).toFixed(2)}`);
const b = w.layout.basin; console.log(`basen dno=${b.floorY} powierzchnia=${w.surfaceY(w.gnd).toFixed(2)} (szer ${b.rect.x1 - b.rect.x0})`);
const z = w.layout.pipes[0].zone; console.log(`strefa [${z.x0},${z.y0})-[${z.x1},${z.y1}) cząstek=${cnt(z.x0, z.y0, z.x1, z.y1)}`);
