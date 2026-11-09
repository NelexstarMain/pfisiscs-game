import { FlowZone } from '../src/engine/elements';
import { chainLevel, makeChain } from '../src/engine/scenes';
const m = Number(process.argv[2] ?? 0.2), cc = Number(process.argv[3] ?? 0.05);
const wA = 12, wB = 12;
const c = makeChain({ tanks: [{ w: wA, fill: 26 }, { w: wB, fill: 16 }], walls: [[{ gamma: 0 }]], inner: 60 });
const z = new FlowZone(c.sim, c.slots[0][0], { m, k: 0, c: cc }, () => chainLevel(c, 0) - chainLevel(c, 1));
const T: number[] = [], D: number[] = [], Iq: number[] = [];
for (let k = 1; k <= 240 * 30; k++) { c.sim.step(); z.step(1 / 240); if (k % 12 === 0) { T.push(c.sim.time); D.push(chainLevel(c, 0) - chainLevel(c, 1)); Iq.push(z.measuredFlow()); } }
const mean = D.reduce((a, b) => a + b) / D.length;
const cross: number[] = []; for (let i = 1; i < D.length; i++) if (D[i-1]-mean > 0 && D[i]-mean <= 0) cross.push(T[i]);
const period = (cross[cross.length-1]-cross[0])/(cross.length-1);
const omega = Math.sqrt((1/wA+1/wB)/m);
// amplitudy kolejnych maksimów
const peaks: string[] = []; for (let i = 1; i < D.length-1; i++) if (D[i] > D[i-1] && D[i] >= D[i+1] && D[i]-mean > 0.5) peaks.push(`${T[i].toFixed(1)}s:${(D[i]-mean).toFixed(1)}`);
console.log(`m=${m} c=${cc}: period=${period.toFixed(2)} expected=${(2*Math.PI/omega).toFixed(2)} crossings=${cross.length} mean dh=${mean.toFixed(2)} I_set=${z.I.toFixed(1)} I_meas=${z.measuredFlow().toFixed(1)}`);
console.log('peaks', peaks.join(' '));
