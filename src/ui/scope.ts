import type { World } from '../compile/world';
import { COLORS } from './colors';

const PALETTE = ['#ffd36b', '#7ee0a5', '#ff8fa3', '#8fc8ff', '#d9a6ff'];

/** Oscyloskop: wykres napięć wybranych węzłów w czasie symulacji (ostatnie ~30 s). */
export class Scope {
  private ctx: CanvasRenderingContext2D;
  private t: number[] = [];
  private series = new Map<string, number[]>();
  private w = 0;
  private h = 0;
  private lastT = -1;
  window = 30;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  reset(): void {
    this.t = [];
    this.series.clear();
    this.lastT = -1;
  }

  /** zapisuje próbkę co 0,1 s czasu symulacji */
  push(world: World, nets: string[]): void {
    if (world.time - this.lastT < 0.1) return;
    this.lastT = world.time;
    this.t.push(world.time);
    for (const n of nets) {
      let s = this.series.get(n);
      if (!s) this.series.set(n, (s = new Array(this.t.length - 1).fill(NaN)));
      s.push(world.voltage(n));
    }
    const cut = this.t.length - this.window * 10 - 5;
    if (cut > 0) {
      this.t.splice(0, cut);
      for (const s of this.series.values()) s.splice(0, cut);
    }
  }

  draw(vmax: number, names: Map<string, string>, nets: string[]): void {
    const { ctx, w, h } = this;
    ctx.fillStyle = '#0c141c';
    ctx.fillRect(0, 0, w, h);
    const L = 38;
    const T = 8;
    const B = 18;
    const R = 8;
    const pw = w - L - R;
    const ph = h - T - B;
    const lo = -Math.max(2, vmax) * 1.15;
    const hi = Math.max(2, vmax) * 1.15;
    const Y = (v: number) => T + ph * (1 - (v - lo) / (hi - lo));
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.dim;
    ctx.strokeStyle = '#1d2b39';
    ctx.lineWidth = 1;
    const step = Math.max(1, Math.round((hi - lo) / 6));
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      ctx.beginPath();
      ctx.moveTo(L, Y(v));
      ctx.lineTo(w - R, Y(v));
      ctx.stroke();
      ctx.fillText(`${v}`, L - 4, Y(v) + 3);
    }
    ctx.strokeStyle = '#3a4f64';
    ctx.beginPath();
    ctx.moveTo(L, Y(0));
    ctx.lineTo(w - R, Y(0));
    ctx.stroke();
    if (this.t.length < 2) return;
    const t1 = this.t[this.t.length - 1];
    const t0 = Math.max(this.t[0], t1 - this.window);
    const X = (t: number) => L + (pw * (t - t0)) / Math.max(1e-6, t1 - t0);
    let ci = 0;
    ctx.textAlign = 'left';
    for (const n of nets) {
      const s = this.series.get(n);
      if (!s) continue;
      const col = PALETTE[ci++ % PALETTE.length];
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < this.t.length; i++) {
        if (this.t[i] < t0 || Number.isNaN(s[i])) continue;
        first ? ctx.moveTo(X(this.t[i]), Y(s[i])) : ctx.lineTo(X(this.t[i]), Y(s[i]));
        first = false;
      }
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillText(names.get(n) ?? n, L + 6 + (ci - 1) * 110, h - 5);
    }
    ctx.fillStyle = COLORS.dim;
    ctx.textAlign = 'right';
    ctx.fillText(`${(t1 - t0).toFixed(0)} s`, w - R, h - 5);
  }
}
