import { PARAMS } from '../engine/constants';
import { compile, CompileError, type World } from '../compile/world';
import { Doc } from '../model/doc';
import type { DocData } from '../model/types';
import type { Frame, StaticInfo } from './protocol';

/**
 * Trzyma świat i go posuwa. Nie zna Web Workera (komunikaty obsługuje worker.ts albo SimClient w trybie awaryjnym),
 * więc da się go testować w node.
 */
export class SimHost {
  world: World | null = null;
  info: StaticInfo | null = null;
  buildId = 0;
  running = true;
  speed = 2;
  /** wynik ostatniej budowy: info albo komunikat błędu */
  build(id: number, docData: DocData, k: number): StaticInfo | string {
    this.buildId = id;
    this.world = null;
    this.info = null;
    try {
      const doc = new Doc();
      doc.load(docData);
      const w = compile(doc, { k });
      this.world = w;
      const tanks = [...w.tanks.values()];
      this.info = {
        W: w.W,
        H: w.H,
        k: w.k,
        cellsPerVolt: w.cal.cellsPerVolt,
        outline: w.outline,
        tanks,
        gndNet: w.gnd.net,
        conds: w.conds,
        flowIds: [...w.flows.keys()],
        liveIds: [
          ...w.conds.filter((c) => ['resistor', 'bulb', 'diode', 'led', 'fuse'].includes(c.type)).map((c) => c.id),
          ...w.sources.filter((x) => x.type !== 'battery').map((x) => x.id),
        ],
        basinNomY: w.layout.basin.nomY,
        nFluid: w.sim.fluidCount,
      };
      return this.info;
    } catch (e) {
      return e instanceof CompileError ? e.message : `Błąd: ${(e as Error).message}`;
    }
  }

  /**
   * Posuwa symulację o `due` sekund czasu symulacji, ale nie dłużej niż `budgetMs` czasu ściany.
   * Zwraca liczbę wykonanych kroków i średni czas kroku.
   */
  advance(due: number, budgetMs: number): { steps: number; stepMs: number } {
    const w = this.world;
    if (!w || !this.running) return { steps: 0, stepMs: 0 };
    const dt = PARAMS.dt;
    const want = Math.max(1, Math.round(due / dt));
    const t0 = performance.now();
    let steps = 0;
    while (steps < want) {
      w.step(dt);
      steps++;
      if (performance.now() - t0 > budgetMs) break;
    }
    return { steps, stepMs: steps ? (performance.now() - t0) / steps : 0 };
  }

  /** migawka wyników; `buf` to opcjonalny bufor pozycji do ponownego użycia */
  frame(steps: number, stepMs: number, buf?: Float32Array): Frame | null {
    const w = this.world;
    const info = this.info;
    if (!w || !info) return null;
    const s = w.sim;
    const n = s.fluidCount;
    const pos = buf && buf.length >= 2 * n ? buf : new Float32Array(2 * Math.max(n, 1) + 64);
    for (let i = 0; i < n; i++) {
      pos[2 * i] = s.px[s.nB + i];
      pos[2 * i + 1] = s.py[s.nB + i];
    }
    return {
      id: this.buildId,
      time: w.time,
      n,
      pos,
      volts: Float32Array.from(info.tanks, (t) => w.voltage(t.net)),
      currents: Float32Array.from(info.conds, (c) => w.current(c.id)),
      apertures: Float32Array.from(info.conds, (c) => w.aperture(c.id)),
      blown: [...w.blown],
      lost: s.lost,
      stepMs,
      steps,
    };
  }

  /** komenda z interfejsu; zwraca true, jeśli trzeba przebudować świat */
  command(cmd: 'setSwitch' | 'setValue' | 'resetFuse', id: string, value?: number): boolean {
    const w = this.world;
    if (!w) return false;
    if (cmd === 'setSwitch') w.setSwitch(id, (value ?? 0) >= 0.5);
    else if (cmd === 'resetFuse') w.resetFuse(id);
    else return !w.setValue(id, value ?? 0);
    return false;
  }
}
