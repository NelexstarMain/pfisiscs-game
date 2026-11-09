import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
const R = Number(process.argv[2]);
const d = new Doc(); let x = 0;
const add = (t: any, v?: number) => { const c = d.makeAdd(t, { x: x += 4, y: 0 }); d.apply(c); const id = (c as any).comp.id; if (v !== undefined) d.apply({ kind: 'value', id, value: v }); return id; };
const w = (a: string, b: string) => d.apply(d.makeWire(a, b));
const s = add('supply', 9), r = add('resistor', R), g = add('ground');
w(`${s}:1`, `${r}:0`); w(`${r}:1`, `${g}:0`); w(`${s}:0`, `${g}:0`);
const world = compile(d); const plus = 'c1:1';
for (let k = 0; k < 240 * 14; k++) world.step();
const T = 20, N = 240 * T; let v = 0, i = 0; const m0 = world.netMoves;
for (let k = 0; k < N; k++) { world.step(); v += world.voltage(plus) / N; i += world.current(r) / N; }
const truth = (world.netMoves - m0) / T / 50;
console.log(`R=${R}: V=${v.toFixed(2)} zone=${(i*1000).toFixed(0)}mA truth(servo net)=${(truth*1000).toFixed(0)}mA V/R=${(v/R*1000).toFixed(0)}mA  zone/truth=${(i/truth).toFixed(2)} truth/(V/R)=${(truth/(v/R)).toFixed(2)}`);
