import type { WorldView } from '../sim/view';

export interface NetLabels {
  /** id sieci -> nazwa do wyświetlenia */
  net: Map<string, string>;
  /** id elementu -> etykieta (np. "R 47 Ω") */
  comp: Map<string, string>;
}

const BG = '#0b1220';
const GRID = '#16233a';
const LINE = '#e8f1fb';
const BALL = '#8fd4ff';
const TEXT = '#c9dcef';
const ACCENT = '#ffb347';
const DIM = '#6f86a0';

/**
 * Widok świata wody: tylko kulki i cienkie kontury naczyń i rur na ciemnym tle z siatką.
 * Wysokość w świecie = napięcie (linie co 2 V od zera masy).
 */
export class WaterView {
  private ctx: CanvasRenderingContext2D;
  world: WorldView | null = null;
  labels: NetLabels = { net: new Map(), comp: new Map() };
  /** linie wysokości (napięcia) co 2 V */
  overlay = true;
  vmax = 9;
  message = '';
  private cache: HTMLCanvasElement | null = null;
  private cachedFor: WorldView | null = null;
  private cachedScale = 0;
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

  /** kontury jam rysowane raz na skalę (ścianki są stałe) */
  private buildOutline(world: WorldView, s: number): void {
    const dpr = window.devicePixelRatio || 1;
    const c = document.createElement('canvas');
    c.width = Math.ceil(world.W * s * dpr) + 4;
    c.height = Math.ceil(world.H * s * dpr) + 4;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.strokeStyle = LINE;
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    g.beginPath();
    for (const [x0, y0, x1, y1] of world.outline) {
      g.moveTo(x0 * s, (world.H - y0) * s);
      g.lineTo(x1 * s, (world.H - y1) * s);
    }
    g.stroke();
    this.cache = c;
    this.cachedFor = world;
    this.cachedScale = s;
  }

  draw(): void {
    const { ctx } = this;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.cw, this.ch);
    const world = this.world;
    if (!world) {
      ctx.fillStyle = TEXT;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      const lines = (this.message || 'Zbuduj obwód w widoku schematu.').split('\n');
      lines.forEach((t, i) => ctx.fillText(t, this.cw / 2, this.ch / 2 + i * 20));
      return;
    }
    const margin = 34;
    const pad = 14;
    const s = Math.max(1.5, Math.min((this.cw - margin - pad) / world.W, (this.ch - 2 * pad) / world.H));
    const ox = margin;
    const oy = Math.max(pad, (this.ch - world.H * s) / 2);
    const X = (x: number) => ox + x * s;
    const Y = (y: number) => oy + (world.H - y) * s;
    if (this.cachedFor !== world || this.cachedScale !== s) this.buildOutline(world, s);

    // siatka (co 5 komórek), jak na szkicu
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= world.W; x += 5) {
      ctx.moveTo(X(x), oy);
      ctx.lineTo(X(x), oy + world.H * s);
    }
    for (let y = 0; y <= world.H; y += 5) {
      ctx.moveTo(ox, Y(y));
      ctx.lineTo(ox + world.W * s, Y(y));
    }
    ctx.stroke();

    // linie napięcia co 2 V od zera masy (wysokość = napięcie)
    const y0v = world.layout.basin.nomY;
    const cpv = world.cal.cellsPerVolt;
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    for (let v = -Math.ceil(this.vmax); v <= Math.ceil(this.vmax) + 4; v += 1) {
      const y = y0v + v * cpv;
      if (y < 0 || y > world.H) continue;
      ctx.fillStyle = v === 0 ? ACCENT : DIM;
      ctx.fillRect(ox - 6, Y(y), v % 2 ? 3 : 6, 1);
      if (v % 2 === 0) ctx.fillText(`${v}`, ox - 9, Y(y) + 3);
      if (this.overlay && v % 2 === 0) {
        ctx.strokeStyle = v === 0 ? 'rgba(255,179,71,0.35)' : 'rgba(111,134,160,0.22)';
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(ox, Y(y));
        ctx.lineTo(ox + world.W * s, Y(y));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM;
    ctx.fillText('V', 4, oy + 8);

    // kontury naczyń i rur
    if (this.cache) {
      const dpr = window.devicePixelRatio || 1;
      ctx.drawImage(this.cache, ox, oy, this.cache.width / dpr, this.cache.height / dpr);
    }

    // kulki
    const sim = world.sim;
    const r = Math.max(0.8, 0.38 * s);
    ctx.fillStyle = BALL;
    ctx.beginPath();
    for (let i = sim.nB; i < sim.n; i++) {
      const x = X(sim.px[i]);
      const y = Y(sim.py[i]);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    // napisy: nazwa i napięcie przy każdym naczyniu
    ctx.font = '11px system-ui';
    for (const t of world.tanks.values()) {
      const isG = t.net === world.gnd.net;
      const cx = X((t.rect.x0 + t.rect.x1) / 2);
      const top = Y(t.rimY + 6) - 4;
      ctx.textAlign = 'center';
      ctx.fillStyle = TEXT;
      ctx.fillText(this.labels.net.get(t.net) ?? '', cx, top - 13);
      ctx.fillStyle = ACCENT;
      ctx.font = 'bold 11px system-ui';
      ctx.fillText(isG ? '0 V' : `${world.voltage(t.net).toFixed(2)} V`, cx, top);
      ctx.font = '11px system-ui';
    }
    // opis elementu przy strefie oporowej i dwie kreski poprzeczne na jej końcach
    ctx.lineWidth = 1.2;
    for (const c of world.conds) {
      const z = c.zone;
      const horizontal = c.kind === 'slot';
      ctx.strokeStyle = ACCENT;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(X(z.x0), Y(z.y1) - 2);
        ctx.lineTo(X(z.x0), Y(z.y0) + 2);
        ctx.moveTo(X(z.x1), Y(z.y1) - 2);
        ctx.lineTo(X(z.x1), Y(z.y0) + 2);
      } else {
        ctx.moveTo(X(z.x0) - 2, Y(z.y1));
        ctx.lineTo(X(z.x1) + 2, Y(z.y1));
        ctx.moveTo(X(z.x0) - 2, Y(z.y0));
        ctx.lineTo(X(z.x1) + 2, Y(z.y0));
      }
      ctx.stroke();
      let lab = this.labels.comp.get(c.id) ?? '';
      if (world.blown.has(c.id)) lab += ' (przepalony)';
      const i = world.current(c.id);
      ctx.textAlign = horizontal ? 'center' : 'left';
      const lx = horizontal ? X((z.x0 + z.x1) / 2) : X(z.x1) + 8;
      const ly = horizontal ? Y(z.y1) - 18 : Y((z.y0 + z.y1) / 2) - 2;
      ctx.fillStyle = TEXT;
      ctx.fillText(lab, lx, ly);
      ctx.fillStyle = ACCENT;
      ctx.fillText(`${(i * 1000).toFixed(0)} mA`, lx, ly + 12);
    }
  }
}
