import { compile } from '../src/compile/world';
import { Doc } from '../src/model/doc';
import { EXAMPLES } from '../src/examples';
const k = Number(process.argv[3] ?? 1);
for (const key of (process.argv[2] ?? 'resistor,divider,bulb,rc,ac').split(',')) {
  const d = new Doc(); d.load(JSON.parse(JSON.stringify(EXAMPLES[key].data)));
  const w = compile(d, { k });
  const t0 = performance.now(); for (let i = 0; i < 120; i++) w.step();
  const ms = (performance.now() - t0) / 120;
  console.log(`${key} k=${k}: ${w.W}x${w.H} cząstek=${w.sim.fluidCount} brzeg=${w.sim.nB} ${ms.toFixed(2)} ms/krok`);
}
