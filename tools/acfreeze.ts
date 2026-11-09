import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
import { EXAMPLES } from '../src/examples';
const phaseT = Number(process.argv[2]); // 2.5 → +A, 7.5 → −A
const d = new Doc(); d.load(JSON.parse(JSON.stringify(EXAMPLES.ac.data)));
if (process.env.AMP) d.apply({ kind: 'value', id: 'c1', value: Number(process.env.AMP) });
const w = compile(d, { k: 1 });
if (process.argv[3] === 'nodrag') w.sim.dragPressure = false;
if (process.env.NOSLIP === '0') w.sim.freeSlip = false;
if (process.argv[4]) w.sim.tune.iterations = Number(process.argv[4]);
const hold = () => { w.time = phaseT; };
for (let q = 0; q < 240 * 25; q++) { w.step(); hold(); }
let v = 0, i = 0; const N = 240 * 10;
const m0 = w.netMoves;
for (let q = 0; q < N; q++) { w.step(); hold(); v += w.voltage('c1:1') / N; i += w.current('c3') / N; }
const flux = -(w.netMoves - m0) / 10 / 50;
console.log(`faza t=${phaseT}: V=${v.toFixed(2)} Izone=${(i * 1000).toFixed(0)}mA serwo-netto=${(flux * 1000).toFixed(0)}mA V/R=${(v / 47 * 1000).toFixed(0)}mA amp=${process.env.AMP ?? 4}`);
