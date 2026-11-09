import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
function mk(fn: (add: (t: any, v?: number) => string, w: (a: string, b: string) => void) => void) {
  const d = new Doc(); let x = 0;
  const add = (t: any, v?: number) => { const c = d.makeAdd(t, { x: x += 4, y: 0 }); d.apply(c); const id = (c as any).comp.id; if (v !== undefined) d.apply({ kind: 'value', id, value: v }); return id; };
  fn(add, (a, b) => d.apply(d.makeWire(a, b)));
  return d;
}
const R = Number(process.argv[2] ?? 47), V = Number(process.argv[3] ?? 9);
const d = mk((add, w) => { const s = add('supply', V), r = add('resistor', R), g = add('ground'); w(`${s}:1`, `${r}:0`); w(`${r}:1`, `${g}:0`); w(`${s}:0`, `${g}:0`); });
const world = compile(d);
console.log(`W=${world.W} H=${world.H} particles=${world.sim.fluidCount} boundary=${world.sim.nB}`);
const nets = [...world.tanks.keys()];
for (let k = 1; k <= 240 * 20; k++) {
  world.step();
  if (k % 480 === 0) console.log(`t=${world.time.toFixed(0)} ` + nets.map(n => `V(${n})=${world.voltage(n).toFixed(2)}`).join(' ') + ` I(R)=${world.current('c2').toFixed(3)}A expected=${(V / R).toFixed(3)}A lost=${world.sim.lost}`);
}
// niezależny pomiar prądu: cząstki przenoszone przez serwo w ostatnich 10 s
const w2 = compile(d); for (let k = 0; k < 240 * 10; k++) w2.step();
const m0 = (w2 as any).moves; for (let k = 0; k < 240 * 10; k++) w2.step();
const flux = ((w2 as any).moves - m0) / 10;
console.log(`serwo: ${flux.toFixed(2)} cząstek/s = ${(flux / 50).toFixed(3)} A (pomiar strefy: ${w2.current('c2').toFixed(3)} A, V=${w2.voltage([...w2.tanks.keys()][0]).toFixed(2)})`);
