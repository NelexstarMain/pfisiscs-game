import type { Seg } from '../compile/outline';
import type { CondInfo, TankInfo } from '../compile/world';
import type { DocData } from '../model/types';
import { SimHost } from './host';
import type { Frame, FromWorker, StaticInfo, ToWorker } from './protocol';
import type { WorldView } from './view';
import SimWorker from './worker?worker&inline';

/**
 * Strona interfejsu: świat żyje w Web Workerze (albo, gdy go brak, w głównym wątku), a tu są tylko wyniki z ostatniej ramki.
 * Implementuje `WorldView`, więc widoki, zadania i oscyloskop czytają go tak samo jak `World`.
 */
export class SimClient implements WorldView {
  W = 0;
  H = 0;
  k = 1;
  cal = { cellsPerVolt: 1 };
  outline: Seg[] = [];
  layout = { basin: { nomY: 0 } };
  tanks = new Map<string, TankInfo>();
  gnd!: TankInfo;
  conds: CondInfo[] = [];
  flows = new Set<string>();
  blown = new Set<string>();
  time = 0;
  sim = { nB: 0, n: 0, px: new Float32Array(0), py: new Float32Array(0), lost: 0 };
  /** czy świat jest zbudowany i są dane do rysowania */
  ready = false;
  /** tempo symulacji względem czasu rzeczywistego (EMA) */
  tempo = 0;
  /** średni czas jednego kroku fizyki [ms] */
  stepMs = 0;
  nFluid = 0;
  onBuilt: (info: StaticInfo) => void = () => {};
  onError: (message: string) => void = () => {};
  onNeedRebuild: () => void = () => {};

  private worker: Worker | null = null;
  private inline: SimHost | null = null;
  private buildId = 0;
  private info: StaticInfo | null = null;
  private live = new Set<string>();
  private volts = new Map<string, number>();
  private currents = new Map<string, number>();
  private apertures = new Map<string, number>();
  private running = true;
  private speed = 2;
  private lastSim = -1;
  private lastReal = 0;

  constructor() {
    try {
      this.worker = new SimWorker();
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
      this.worker.onerror = () => this.fallback();
    } catch {
      this.fallback();
    }
  }

  get usesWorker(): boolean {
    return this.worker !== null;
  }

  private fallback() {
    this.worker?.terminate();
    this.worker = null;
    this.inline = new SimHost();
  }

  private send(m: ToWorker) {
    this.worker?.postMessage(m);
  }

  build(doc: DocData, k: number): void {
    this.ready = false;
    this.lastSim = -1;
    const id = ++this.buildId;
    if (this.worker) {
      this.send({ type: 'build', id, doc, k });
    } else if (this.inline) {
      const r = this.inline.build(id, doc, k);
      this.inline.running = this.running;
      this.inline.speed = this.speed;
      queueMicrotask(() => (typeof r === 'string' ? this.onError(r) : this.receive({ type: 'built', id, info: r })));
    }
  }

  run(running: boolean, speed: number): void {
    this.running = running;
    this.speed = speed;
    if (this.worker) this.send({ type: 'run', running, speed });
    else if (this.inline) {
      this.inline.running = running;
      this.inline.speed = speed;
    }
  }

  /** tryb awaryjny (bez workera): posuwa świat w głównym wątku w ramach budżetu czasu klatki */
  tickInline(realDtSec: number): void {
    if (!this.inline || !this.info) return;
    const r = this.inline.advance(Math.min(0.1, realDtSec) * this.speed, 12);
    const f = this.inline.frame(r.steps, r.stepMs);
    if (f) this.applyFrame(f);
  }

  private receive(m: FromWorker) {
    if (m.type === 'built') {
      if (m.id !== this.buildId) return;
      this.setStatic(m.info);
      this.onBuilt(m.info);
    } else if (m.type === 'error') {
      if (m.id !== this.buildId) return;
      this.ready = false;
      this.onError(m.message);
    } else if (m.type === 'frame') {
      this.applyFrame(m);
      this.send({ type: 'ack', buf: m.pos });
    } else if (m.type === 'needRebuild') {
      this.onNeedRebuild();
    }
  }

  private setStatic(info: StaticInfo) {
    this.info = info;
    this.W = info.W;
    this.H = info.H;
    this.k = info.k;
    this.cal = { cellsPerVolt: info.cellsPerVolt };
    this.outline = info.outline;
    this.layout = { basin: { nomY: info.basinNomY } };
    this.tanks = new Map(info.tanks.map((t) => [t.net, t]));
    this.gnd = this.tanks.get(info.gndNet)!;
    this.conds = info.conds;
    this.flows = new Set(info.flowIds);
    this.live = new Set(info.liveIds);
    this.nFluid = info.nFluid;
    this.volts.clear();
    this.currents.clear();
    this.apertures.clear();
    this.blown = new Set();
    this.time = 0;
    this.sim = { nB: 0, n: 0, px: new Float32Array(info.nFluid + 64), py: new Float32Array(info.nFluid + 64), lost: 0 };
    this.ready = true;
  }

  private applyFrame(f: Frame) {
    const info = this.info;
    if (!info || f.id !== this.buildId) return;
    const s = this.sim;
    if (s.px.length < f.n) {
      s.px = new Float32Array(f.n + 64);
      s.py = new Float32Array(f.n + 64);
    }
    for (let i = 0; i < f.n; i++) {
      s.px[i] = f.pos[2 * i];
      s.py[i] = f.pos[2 * i + 1];
    }
    s.n = f.n;
    s.lost = f.lost;
    info.tanks.forEach((t, i) => this.volts.set(t.net, f.volts[i]));
    info.conds.forEach((c, i) => {
      this.currents.set(c.id, f.currents[i]);
      this.apertures.set(c.id, f.apertures[i]);
    });
    this.blown = new Set(f.blown);
    this.time = f.time;
    this.stepMs = f.stepMs || this.stepMs;
    const now = performance.now();
    if (this.lastSim >= 0 && f.time > this.lastSim) {
      const t = (f.time - this.lastSim) / Math.max(1e-3, (now - this.lastReal) / 1000);
      this.tempo = this.tempo === 0 ? t : this.tempo + 0.1 * (t - this.tempo);
    }
    this.lastSim = f.time;
    this.lastReal = now;
  }

  voltage(net: string): number {
    return this.info && net === this.info.gndNet ? 0 : (this.volts.get(net) ?? 0);
  }

  current(id: string): number {
    return this.currents.get(id) ?? 0;
  }

  power(id: string): number {
    const c = this.conds.find((x) => x.id === id);
    return c ? Math.abs((this.voltage(c.netA) - this.voltage(c.netB)) * this.current(id)) : 0;
  }

  aperture(id: string): number {
    return this.apertures.get(id) ?? 0;
  }

  private cmd(cmd: 'setSwitch' | 'setValue' | 'resetFuse', id: string, value?: number): boolean {
    if (this.worker) {
      this.send({ type: 'cmd', cmd, id, value });
      return false;
    }
    return this.inline ? this.inline.command(cmd, id, value) : false;
  }

  setSwitch(id: string, closed: boolean): void {
    this.cmd('setSwitch', id, closed ? 1 : 0);
  }

  setValue(id: string, value: number): boolean {
    if (!this.live.has(id)) return false;
    const rebuild = this.cmd('setValue', id, value);
    return !rebuild; // w trybie workera przebudowę zgłosi `needRebuild`
  }

  resetFuse(id: string): void {
    this.cmd('resetFuse', id);
  }
}
