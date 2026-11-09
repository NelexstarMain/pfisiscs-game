import { chainLevel, makeChain } from '../src/engine/scenes';
const g1 = Number(process.argv[2]), g2 = Number(process.argv[3]);
const mw = Number(process.argv[4] ?? 4), fA = Number(process.argv[5] ?? 40), fG = Number(process.argv[6] ?? 12), fM = Number(process.argv[7] ?? 24), its = Number(process.argv[8] ?? 4), xs = Number(process.argv[9] ?? 0.04);
const c = makeChain({ tanks: [{ w: 30, fill: fA }, { w: mw, fill: fM }, { w: 30, fill: fG }], walls: [[{ gamma: g1 }], [{ gamma: g2 }]] });
const s = c.sim; s.tune.iterations = its; s.tune.xsph = xs;
let a = 0, m = 0, g = 0, n = 0; const out: string[] = [];
for (let k = 1; k <= 240 * 6; k++) {
  s.step(); a += chainLevel(c, 0); m += chainLevel(c, 1); g += chainLevel(c, 2); n++;
  if (k % 120 === 0) {
    const A = a / n, M = m / n, G = g / n; a = m = g = n = 0;
    out.push(`t=${s.time.toFixed(1)} A=${A.toFixed(1)} M=${M.toFixed(1)} G=${G.toFixed(1)} ratio=${((M - G) / (A - G)).toFixed(3)}`);
  }
}
console.log(`divider g1=${g1} g2=${g2}`); console.log(out.slice(1).join('\n'));
