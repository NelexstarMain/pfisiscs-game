import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
import { EXAMPLES } from '../src/examples';
const d = new Doc(); d.load(JSON.parse(JSON.stringify(EXAMPLES.ac.data)));
const w = compile(d, { k: 1 });
let last = 0, lastT = 0; const rows: string[] = [];
let sumI = 0, n = 0;
for (let k = 1; k <= 240 * 32; k++) {
  w.step(); sumI += w.current('c3'); n++;
  if (k % 240 === 0 && w.time > 11) {
    const flux = (w.netMoves - last) / (w.time - lastT) / 50; // A, dodatni = basen→plus = prąd dodatni? (plus→basen to ujemny netMoves)
    rows.push(`t=${w.time.toFixed(0)} V=${w.voltage('c1:1').toFixed(2)} Izone=${(sumI / n * 1000).toFixed(0)}mA  serwo(netto, znak odwrócony)=${(-flux * 1000).toFixed(0)}mA`);
  }
  if (k % 240 === 0) { last = w.netMoves; lastT = w.time; sumI = 0; n = 0; }
}
console.log(rows.join('\n'));
