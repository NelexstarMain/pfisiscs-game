import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
const gamma = Number(process.argv[2]);
const d = new Doc(); let x = 0;
const add = (t: any, v?: number) => { const c = d.makeAdd(t, { x: x += 4, y: 0 }); d.apply(c); const id = (c as any).comp.id; if (v !== undefined) d.apply({ kind: 'value', id, value: v }); return id; };
const w = (a: string, b: string) => d.apply(d.makeWire(a, b));
const s = add('supply', 9), r = add('resistor', 47), g = add('ground');
w(`${s}:1`, `${r}:0`); w(`${r}:1`, `${g}:0`); w(`${s}:0`, `${g}:0`);
const world = compile(d); const plus = 'c1:1';
const z = world.conds[0].zone; world.sim.grid.setGamma(z.x0, z.y0, z.x1, z.y1, gamma);
const warm = gamma > 200 ? 40 : 15;
for (let k = 0; k < 240 * warm; k++) world.step();
const T = gamma > 200 ? 40 : 20, N = 240 * T; let v = 0; const m0 = world.netMoves;
for (let k = 0; k < N; k++) { world.step(); v += world.voltage(plus) / N; }
const truth = (world.netMoves - m0) / T;  // cząstki/s
console.log(`gamma=${gamma} V=${v.toFixed(2)} Q=${truth.toFixed(2)} G=Q/V=${(truth / v).toFixed(3)} G*gamma=${(truth / v * gamma).toFixed(1)}`);
