import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
const [R1, R2] = process.argv.slice(2).map(Number);
const d = new Doc(); let x = 0;
const add = (t: any, v?: number) => { const c = d.makeAdd(t, { x: x += 4, y: 0 }); d.apply(c); const id = (c as any).comp.id; if (v !== undefined) d.apply({ kind: 'value', id, value: v }); return id; };
const w = (a: string, b: string) => d.apply(d.makeWire(a, b));
const s = add('supply', 9), r1 = add('resistor', R1), r2 = add('resistor', R2), g = add('ground');
w(`${s}:1`, `${r1}:0`); w(`${r1}:1`, `${r2}:0`); w(`${r2}:1`, `${g}:0`); w(`${s}:0`, `${g}:0`);
const world = compile(d);
const plus = 'c1:1'; const mid = [...world.tanks.keys()].find(n => n !== plus && n !== world.gnd.net)!;
for (let k = 0; k < 240 * 14; k++) world.step();
let vp = 0, vm = 0, i1 = 0, i2 = 0; const N = 240 * 6;
const m0 = (world as any).moves;
for (let k = 0; k < N; k++) { world.step(); vp += world.voltage(plus) / N; vm += world.voltage(mid) / N; i1 += world.current(r1) / N; i2 += world.current(r2) / N; }
const flux = ((world as any).moves - m0) / 6 / 50;
console.log(`R1=${R1} R2=${R2}: Vplus=${vp.toFixed(2)} Vmid=${vm.toFixed(2)} I1=${(i1*1000).toFixed(0)} I2=${(i2*1000).toFixed(0)} servo=${(flux*1000).toFixed(0)}mA | Reff1=${((vp-vm)/i1).toFixed(0)} (nom ${R1}) Reff2=${(vm/i2).toFixed(0)} (nom ${R2}) Itheory=${(9/(R1+R2)*1000).toFixed(0)}mA`);
