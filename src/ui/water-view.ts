import { CAL } from '../compile/calibration';
import { FLOOR_Y, type World } from '../compile/world';
import { COLORS, voltageColor } from './colors';

export interface NetLabels {
  /** id sieci -> nazwa do wyświetlenia */
  net: Map<string, string>;
  /** id elementu -> etykieta (np. "R 47 Ω") */
  comp: Map<string, string>;
}

function halo(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(15,23,32,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

/** Widok „wodnego świata": przekrój z boku, wysokość = potencjał. */
export class WaterView {
  private ctx: CanvasRenderingContext2D;
  world: World | null = null;
  labels: NetLabels = { net: new Map(), comp: new Map() };
  overlay = true;
  vmax = 9;
  message = '';
  private solidCache: HTMLCanvasElement | null = null;
  private cachedFor: World | null = null;
  private cw = 0;
  private ch = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.cw = w;
    this.ch = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cachedFor = null;
  }

  private buildSolids(world: World, s: number): void {
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.ceil(world.W * s * dpr);
    c.height = Math.ceil(world.H * s * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grid = world.sim.grid;
    g.fillStyle = COLORS.wall;
    for (let j = 0; j < grid.h; j++) {
      let i = 0;
      while (i < grid.w) {
        if (grid.solid[j * grid.w + i]) {
          let k = i;
          while (k < grid.w && grid.solid[j * grid.w + k]) k++;
          g.fillRect(i * s, (grid.h - 1 - j) * s, (k - i) * s + 0.5, s + 0.5);
          i = k;
        } else i++;
      }
    }
    this.solidCache = c;
    this.cachedFor = world;
  }

  draw(): void {
    const { ctx } = this;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.cw, this.ch);
    const world = this.world;
    if (!world) {
      ctx.fillStyle = COLORS.dim;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      const lines = (this.message || 'Zbuduj obwód w widoku schematu.').split('\n');
      lines.forEach((t, i) => ctx.fillText(t, this.cw / 2, this.ch / 2 + i * 20));
      return;
    }
    const margin = 36;
    const s = Math.max(2, Math.min((this.cw - margin) / world.W, this.ch / world.H));
    const ox = margin;
    const oy = (this.ch - world.H * s) / 2;
    if (this.cachedFor !== world) this.buildSolids(world, s);
    const gndLevel = world.rawLevel(world.gnd);
    const yScreen = (y: number) => oy + (world.H - y) * s;

    ctx.save();
    ctx.translate(ox, 0);
    // pole potencjału: kolor tła według wysokości nad poziomem GND
    if (this.overlay) {
      const baseY = FLOOR_Y + gndLevel;
      const top = world.H;
      for (let y = 0; y < top; y += 1) {
        const v = (y + 0.5 - baseY) / CAL.cellsPerVolt;
        ctx.fillStyle = voltageColor(Math.max(0, v), this.vmax);
        ctx.globalAlpha = 0.16;
        ctx.fillRect(0, yScreen(y + 1), world.W * s, s + 0.5);
      }
      ctx.globalAlpha = 1;
    }
    // ściany
    if (this.solidCache) {
      const dpr = window.devicePixelRatio || 1;
      ctx.drawImage(this.solidCache, 0, oy, this.solidCache.width / dpr, this.solidCache.height / dpr);
    }
    // cząstki, trzy kubełki szybkości
    const sim = world.sim;
    const buckets: [number, string][] = [
      [1.5, '#3a86e0'],
      [6, '#59b0ff'],
      [Infinity, '#bfe4ff'],
    ];
    for (let b = 0; b < buckets.length; b++) {
      ctx.fillStyle = buckets[b][1];
      ctx.beginPath();
      const lo = b === 0 ? -1 : buckets[b - 1][0];
      const hi = buckets[b][0];
      for (let i = sim.nB; i < sim.n; i++) {
        const sp = Math.hypot(sim.vx[i], sim.vy[i]);
        if (sp <= lo || sp > hi) continue;
        const x = sim.px[i] * s;
        const y = yScreen(sim.py[i]);
        ctx.moveTo(x + s * 0.5, y);
        ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    // poziomy wody i etykiety zbiorników
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    for (const t of world.tanks.values()) {
      const lvl = world.rawLevel(t);
      const isG = t.net === world.gnd.net;
      const yl = yScreen(FLOOR_Y + lvl);
      const x0 = t.rect.x0 * s;
      const x1 = t.rect.x1 * s;
      ctx.strokeStyle = isG ? COLORS.dim : COLORS.accent;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x0, yl);
      ctx.lineTo(x1, yl);
      ctx.stroke();
      ctx.setLineDash([]);
      const v = world.voltage(t.net);
      ctx.fillStyle = isG ? COLORS.dim : COLORS.accent;
      ctx.font = 'bold 12px system-ui';
      halo(ctx, isG ? '0 V' : `${v.toFixed(2)} V`, (x0 + x1) / 2, yl - 5);
      ctx.fillStyle = COLORS.ink;
      ctx.font = '11px system-ui';
      halo(ctx, this.labels.net.get(t.net) ?? '', (x0 + x1) / 2, yScreen(world.H - 2));
    }
    // opisy elementów przy szczelinach i szybach
    for (const c of world.conds) {
      const z = c.zone;
      const cx = ((z.x0 + z.x1) / 2) * s;
      const cy = yScreen((z.y0 + z.y1) / 2);
      ctx.strokeStyle = 'rgba(255,200,120,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(z.x0 * s, yScreen(z.y1), (z.x1 - z.x0) * s, (z.y1 - z.y0) * s);
      const lab = this.labels.comp.get(c.id) ?? '';
      const i = world.current(c.id);
      ctx.fillStyle = COLORS.ink;
      ctx.font = '10px system-ui';
      halo(ctx, lab, cx, c.kind === 'slot' ? yScreen(z.y1) - 14 : cy + 3);
      ctx.fillStyle = COLORS.accent;
      halo(ctx, `${(i * 1000).toFixed(0)} mA`, cx, c.kind === 'slot' ? yScreen(z.y1) - 4 : cy + 14);
    }
    ctx.restore();

    // linijka napięcia z lewej strony
    ctx.fillStyle = COLORS.dim;
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    const y0 = yScreen(FLOOR_Y + gndLevel);
    for (let v = 0; v <= this.vmax + 3; v += 1) {
      const y = y0 - v * CAL.cellsPerVolt * s;
      if (y < 4) break;
      ctx.fillRect(margin - 6, y, 4, 1);
      if (v % 2 === 0) ctx.fillText(`${v}`, margin - 8, y + 3);
    }
    ctx.textAlign = 'left';
    ctx.fillText('V', 4, y0 - (this.vmax + 3) * s - 4 < 10 ? 12 : y0 - (this.vmax + 3) * s - 4);
  }
}
