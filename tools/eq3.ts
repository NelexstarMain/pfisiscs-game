import { level, makeTwoTanks } from '../src/engine/scenes';
const [gamma, slotLen, slotH, xsph, wA] = process.argv.slice(2).map(Number);
const t = makeTwoTanks({ wA, wB: wA, fillA: 26, fillB: 6, gamma, slotLen, slotH });
const s = t.sim; s.tune.xsph = xsph;
for (let k=0;k<240*25;k++) s.step();
console.log(`gamma=${gamma} L=${slotLen} H=${slotH} xsph=${xsph} w=${wA}: countDiff=${(level(t,'a')-level(t,'b')).toFixed(2)} (mean level ${((level(t,'a')+level(t,'b'))/2).toFixed(1)})`);
