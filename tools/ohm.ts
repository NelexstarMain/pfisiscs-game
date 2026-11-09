import { PARAMS } from '../src/engine/constants';
import { level, makeTwoTanks } from '../src/engine/scenes';
const gamma = Number(process.argv[2] ?? 20);
const t = makeTwoTanks({ wA: 12, wB: 12, fillA: 26, fillB: 6, gamma, slotLen: 8, slotH: 3 });
const s = t.sim;
const sl = t.slot;
const win = 60; // 0.25 s
let acc = { dh: 0, i: 0, c: 0 };
const out: string[] = [];
for (let k = 1; k <= 240 * 8; k++) {
  s.step();
  const v = s.vxIn(sl.x0, sl.y0, sl.x1, sl.y1);
  acc.i += v.count ? (v.sum / v.count) * (sl.y1 - sl.y0) : 0;
  acc.dh += level(t, 'a') - level(t, 'b');
  acc.c++;
  if (k % win === 0) {
    out.push(`t=${s.time.toFixed(2)} dh=${(acc.dh / acc.c).toFixed(2)} I=${(acc.i / acc.c).toFixed(2)} I/dh=${(acc.i / acc.dh).toFixed(3)} nSlot=${v.count}`);
    acc = { dh: 0, i: 0, c: 0 };
  }
}
console.log(`gamma=${gamma}`); console.log(out.join('\n'));
