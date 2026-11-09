import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
const volts = Number(process.argv[2] ?? 0), R = Number(process.argv[3] ?? 47), k = Number(process.argv[4] ?? 1);
const d = new Doc(); let x = 0;
const add = (t: any, v?: number) => { const c = d.makeAdd(t, { x: x += 4, y: 0 }); d.apply(c); const id = (c as any).comp.id; if (v !== undefined) d.apply({ kind: 'value', id, value: v }); return id; };
const w = (a: string, b: string) => d.apply(d.makeWire(a, b));
const s = add('supply', volts), r = add('resistor', R), g = add('ground');
w(`${s}:1`, `${r}:0`); w(`${r}:1`, `${g}:0`); w(`${s}:0`, `${g}:0`);
const world = compile(d, { k }); const plus = 'c1:1';
for (let q = 0; q < 240 * 20; q++) world.step();
let v = 0, i = 0; const N = 240 * 10;
for (let q = 0; q < N; q++) { world.step(); v += world.voltage(plus) / N; i += world.current(r) / N; }
const t = world.tanks.get(plus)!;
console.log(`k=${k} supply=${volts}V R=${R}: V=${v.toFixed(3)} I=${(i * 1000).toFixed(1)}mA -> offset głowy ≈ ${(i * R).toFixed(2)} V; powierzchnia naczynia=${world.surfaceY(t).toFixed(2)} basenu=${world.surfaceY(world.gnd).toFixed(2)} cząstek=${world.sim.fluidCount}`);
