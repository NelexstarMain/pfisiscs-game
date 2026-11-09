import { chainLevel, makeChain } from '../src/engine/scenes';
const [fa, fm, fg, mw, gamma] = process.argv.slice(2).map(Number);
const c = makeChain({ tanks: [{ w: 30, fill: fa }, { w: mw, fill: fm }, { w: 30, fill: fg }], walls: [[{ gamma }], [{ gamma }]] });
const s = c.sim;
const rows: string[] = [];
for (let k = 1; k <= 240 * 12; k++) {
  s.step();
  if (k % 480 === 0) {
    let slotN = 0; for (const w of c.slots) for (const sl of w) slotN += s.countIn(sl.x0, sl.y0, sl.x1, sl.y1);
    rows.push(`t=${s.time.toFixed(0)} A=${chainLevel(c,0).toFixed(2)} M=${chainLevel(c,1).toFixed(2)} G=${chainLevel(c,2).toFixed(2)} slotN=${slotN}`);
  }
}
console.log(`fills ${fa}/${fm}/${fg} mw=${mw} gamma=${gamma}`); console.log(rows.join('\n'));
