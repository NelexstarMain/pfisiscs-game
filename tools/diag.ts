import { PARAMS } from '../src/engine/constants';
import { level, makeTwoTanks } from '../src/engine/scenes';
const t = makeTwoTanks({ wA: 12, wB: 12, fillA: 20, fillB: 20 });
const s = t.sim;
console.log('rho0', s.rho0.toFixed(4), 'fluid', s.fluidCount, 'boundary', s.nB);
for (let sec = 0; sec < 4; sec++) {
  for (let k = 0; k < 240; k++) s.step();
  let vmax = 0;
  for (let i = s.nB; i < s.n; i++) vmax = Math.max(vmax, Math.hypot(s.vx[i], s.vy[i]));
  // gęstość w warstwach (liczba cząstek na komórkę) wg wysokości
  const rows: string[] = [];
  for (let y = 0; y < 22; y += 3) {
    const c = s.countIn(t.a.x0 + 2, t.floor + y, t.a.x1 - 2, t.floor + y + 3);
    rows.push((c / ((t.a.x1 - t.a.x0 - 4) * 3)).toFixed(2));
  }
  console.log(`t=${s.time.toFixed(1)} vmax=${vmax.toFixed(2)} levelA=${level(t,'a').toFixed(2)} dens/rows(3 cells): ${rows.join(' ')}`);
}
