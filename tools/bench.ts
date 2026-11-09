import { makeChain } from '../src/engine/scenes';
for (const [w, fill] of [[30, 25], [40, 38], [60, 40]] as const) {
  const c = makeChain({ tanks: [{ w, fill }, { w, fill: 4 }], walls: [[{ gamma: 32 }]], inner: 70 });
  const s = c.sim;
  for (let k = 0; k < 60; k++) s.step(); // rozgrzewka
  const N = 240; const t0 = performance.now();
  for (let k = 0; k < N; k++) s.step();
  const ms = (performance.now() - t0) / N;
  console.log(`fluid=${s.fluidCount} boundary=${s.nB}: ${ms.toFixed(2)} ms/krok, ${(ms * 2).toFixed(1)} ms/klatkę (2 podkroki), ${(ms * 1000 / s.fluidCount).toFixed(2)} us/cząstkę`);
}
