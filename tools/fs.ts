import { chainLevel, makeChain } from '../src/engine/scenes';
const free = process.argv[2] === '1';
const c = makeChain({ tanks: [{ w: 30, fill: 40 }, { w: 12, fill: 24 }, { w: 30, fill: 12 }], walls: [[{ gamma: 32 }], [{ gamma: 32 }]] });
c.sim.freeSlip = free;
const s = c.sim; let a = 0, m = 0, g = 0, n = 0; const out: string[] = [];
for (let k = 1; k <= 240 * 6; k++) { s.step(); a += chainLevel(c,0); m += chainLevel(c,1); g += chainLevel(c,2); n++;
  if (k % 240 === 0) { const A=a/n, M=m/n, G=g/n; a=m=g=n=0; out.push(`t=${s.time.toFixed(0)} A=${A.toFixed(1)} M=${M.toFixed(1)} G=${G.toFixed(1)} ratio=${((M-G)/(A-G)).toFixed(3)}`);} }
console.log(`freeSlip=${free} lost=${s.lost}`); console.log(out.join('\n'));
