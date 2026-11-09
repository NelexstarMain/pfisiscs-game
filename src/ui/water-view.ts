import { CAL } from '../compile/calibration';
import { DAM_BASE_Y, FLOOR_Y, MANIFOLD_ROWS, type Gap, type Rect, type World } from '../compile/world';
import { COLORS } from './colors';

export interface NetLabels {
  /** id sieci -> nazwa do wyświetlenia */
  net: Map<string, string>;
  /** id elementu -> etykieta (np. "R 47 Ω") */
  comp: Map<string, string>;
}

const WOOD = { base: '#a8722f', light: '#d09a52', dark: '#6e4620', seam: 'rgba(60,35,12,0.55)' };
const EARTH = { base: '#6b4f37', dark: '#493625', stone: '#8d7861' };
const PIPE = '#3b2b1d';

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** deska drewniana: pionowe deski, szwy, słoje i sęki; (x, y, w, h) w pikselach */
function wood(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, plank: number, seed = 0): void {
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, WOOD.light);
  grad.addColorStop(0.15, WOOD.base);
  grad.addColorStop(1, WOOD.dark);
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  g.strokeStyle = WOOD.seam;
  g.lineWidth = 1;
  for (let px = x + plank; px < x + w - 1; px += plank) {
    g.beginPath();
    g.moveTo(px, y);
    g.lineTo(px, y + h);
    g.stroke();
  }
  g.strokeStyle = 'rgba(60,35,12,0.22)';
  for (let i = 0; i < Math.max(1, Math.floor(w / 6)); i++) {
    const gx = x + hash(seed + i) * w;
    g.beginPath();
    g.moveTo(gx, y);
    g.lineTo(gx + (hash(seed + i + 9) - 0.5) * 4, y + h);
    g.stroke();
  }
  g.fillStyle = 'rgba(50,28,10,0.5)';
  for (let k = 0; k < Math.floor(h / 70); k++) {
    g.beginPath();
    g.ellipse(x + hash(seed + k * 3.3) * w, y + hash(seed + k * 7.1) * h, 2.2, 3.4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,230,180,0.25)';
  g.fillRect(x, y, 1.5, h);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** drewniana tabliczka z napisem(ami) */
function plaque(g: CanvasRenderingContext2D, cx: number, cy: number, lines: [string, string][]): void {
  g.font = 'bold 11px system-ui';
  const w = Math.max(...lines.map(([t]) => g.measureText(t).width)) + 14;
  const lh = 14;
  const h = lines.length * lh + 6;
  g.fillStyle = 'rgba(20,10,0,0.35)';
  roundRect(g, cx - w / 2 + 1.5, cy - h / 2 + 2.5, w, h, 5);
  g.fill();
  const grad = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  grad.addColorStop(0, '#c68a45');
  grad.addColorStop(1, '#8a5a28');
  g.fillStyle = grad;
  roundRect(g, cx - w / 2, cy - h / 2, w, h, 5);
  g.fill();
  g.strokeStyle = '#4a2e12';
  g.lineWidth = 1.2;
  g.stroke();
  g.textAlign = 'center';
  lines.forEach(([t, col], i) => {
    g.fillStyle = col;
    g.fillText(t, cx, cy - h / 2 + 4 + lh * (i + 0.8));
  });
}

function halo(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(20,40,70,0.75)';
  g.strokeText(text, x, y);
  g.fillText(text, x, y);
}

/** Widok bajkowego „świata wody": wysokość = potencjał, spadek napięcia = wodospad. */
export class WaterView {
  private ctx: CanvasRenderingContext2D;
  world: World | null = null;
  labels: NetLabels = { net: new Map(), comp: new Map() };
  overlay = true;
  vmax = 9;
  message = '';
  private cache: HTMLCanvasElement | null = null;
  private cachedFor: World | null = null;
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

  /** statyczne części świata: ziemia z rurami oraz drewniane ściany */
  private buildStatic(world: World, s: number): void {
    const dpr = window.devicePixelRatio || 1;
    const extra = 7; // skalne „podbrzusze" wyspy poniżej planszy
    const c = document.createElement('canvas');
    c.width = Math.ceil(world.W * s * dpr);
    c.height = Math.ceil((world.H + extra) * s * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (x: number) => x * s;
    const Y = (y: number) => (world.H - y) * s;

    // podstawa: ziemia i kamienie (wyspa unosząca się na niebie), z poszarpanym spodem
    const island = new Path2D();
    island.moveTo(0, Y(FLOOR_Y));
    island.lineTo(X(world.W), Y(FLOOR_Y));
    island.lineTo(X(world.W), Y(0));
    const teeth = 9;
    for (let i = teeth; i >= 0; i--) {
      const tx = (world.W * i) / teeth;
      const depth = i === 0 || i === teeth ? 1.5 : 2 + hash(i * 4.1) * (extra - 2.5);
      island.lineTo(X(tx + (i % 2 ? -1.2 : 1.2)), Y(-depth));
      if (i > 0) island.lineTo(X(tx - world.W / teeth / 2), Y(0.8 - hash(i) * 1.2));
    }
    island.closePath();
    g.fillStyle = EARTH.base;
    g.fill(island);
    g.save();
    g.clip(island);
    const grd = g.createLinearGradient(0, Y(FLOOR_Y), 0, Y(-extra));
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(30,18,8,0.6)');
    g.fillStyle = grd;
    g.fillRect(0, Y(FLOOR_Y), X(world.W), (FLOOR_Y + extra) * s);
    g.restore();
    // kamyki
    for (let i = 0; i < 70; i++) {
      const rx = hash(i * 1.7) * world.W;
      const ry = hash(i * 2.9) * (FLOOR_Y + 1);
      g.fillStyle = i % 3 ? 'rgba(141,120,97,0.5)' : 'rgba(40,26,15,0.45)';
      g.beginPath();
      g.ellipse(X(rx), Y(ry), (0.25 + hash(i) * 0.5) * s, (0.2 + hash(i + 4) * 0.35) * s, 0, 0, Math.PI * 2);
      g.fill();
    }

    // wnętrze podziemnych rur (kolektor, szyby, dół kolumny GND): ciemne drewno
    g.fillStyle = PIPE;
    const pipe = (r: Rect) => g.fillRect(X(r.x0) - 2, Y(r.y1) - 2, (r.x1 - r.x0) * s + 4, (r.y1 - r.y0) * s + 4);
    const gr = world.gnd.rect;
    pipe({ x0: 3, y0: MANIFOLD_ROWS.y0, x1: gr.x1, y1: MANIFOLD_ROWS.y1 });
    pipe({ x0: gr.x0, y0: MANIFOLD_ROWS.y0, x1: gr.x1, y1: FLOOR_Y });
    for (const cd of world.conds) if (cd.kind === 'shaft') pipe(cd.zone);
    // obrzeża rur: jasna krawędź drewna
    g.strokeStyle = 'rgba(208,154,82,0.55)';
    g.lineWidth = 2;
    g.strokeRect(X(3) - 1, Y(MANIFOLD_ROWS.y1) - 1, (gr.x1 - 3) * s + 2, (MANIFOLD_ROWS.y1 - MANIFOLD_ROWS.y0) * s + 2);

    // drewniane ściany: zewnętrzne pełnej wysokości, tamy do DAM_BASE_Y
    const plank = Math.max(5, s * 1.0);
    wood(g, 0, Y(world.H), X(3), Y(FLOOR_Y) - Y(world.H), plank, 1);
    wood(g, X(world.W - 3), Y(world.H), X(3), Y(FLOOR_Y) - Y(world.H), plank, 2);
    world.gaps.forEach((gp, i) => wood(g, X(gp.x0), Y(DAM_BASE_Y), X(gp.x1 - gp.x0), Y(FLOOR_Y) - Y(DAM_BASE_Y), plank, 10 + i));
    // otwory szczelin: ciemny kanał w drewnie
    g.fillStyle = PIPE;
    for (const cd of world.conds) {
      if (cd.kind !== 'slot') continue;
      const z = cd.zone;
      g.fillRect(X(z.x0), Y(z.y1), (z.x1 - z.x0) * s, (z.y1 - z.y0) * s);
    }
    // trawa na szczytach ścian zewnętrznych
    for (const [x0, x1] of [
      [0, 3],
      [world.W - 3, world.W],
    ] as const) {
      g.fillStyle = '#5fa84a';
      roundRect(g, X(x0) - 1, Y(world.H) - s * 0.5, X(x1 - x0) + 2, s * 0.9, 3);
      g.fill();
      g.strokeStyle = '#3f7a30';
      g.lineWidth = 1.4;
      for (let k = 0; k < 6; k++) {
        const gx = X(x0) + ((k + 0.5) / 6) * X(x1 - x0);
        g.beginPath();
        g.moveTo(gx, Y(world.H) - s * 0.4);
        g.lineTo(gx + (k % 2 ? 2 : -2), Y(world.H) - s * 1.0);
        g.stroke();
      }
    }
    this.cache = c;
    this.cachedFor = world;
    this.cachedScale = s;
  }

  private rawOf(world: World, net: string): number {
    const t = world.tanks.get(net);
    return t ? world.rawLevel(t) : 0;
  }

  /** suma modułów prądów elementów związanych z przerwą (szczeliny w niej lub szyby sieci przy masie) */
  private gapFlow(world: World, gap: Gap, last: boolean): number {
    let sum = 0;
    for (const c of world.conds) {
      if (!last && c.kind === 'slot' && c.zone.x0 >= gap.x0 - 0.01 && c.zone.x1 <= gap.x1 + 0.01) sum += Math.abs(world.current(c.id));
      if (last && c.kind === 'shaft' && (c.netA === gap.netL || c.netB === gap.netL)) sum += Math.abs(world.current(c.id));
    }
    return sum;
  }

  draw(): void {
    const { ctx } = this;
    const t = performance.now() / 1000;
    // niebo
    const sky = ctx.createLinearGradient(0, 0, 0, this.ch);
    sky.addColorStop(0, '#4fa8e8');
    sky.addColorStop(0.6, '#a8dcf8');
    sky.addColorStop(1, '#e6f6ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.cw, this.ch);
    // słońce
    const sun = ctx.createRadialGradient(this.cw * 0.12, this.ch * 0.12, 4, this.cw * 0.12, this.ch * 0.12, 90);
    sun.addColorStop(0, 'rgba(255,248,200,1)');
    sun.addColorStop(0.25, 'rgba(255,230,140,0.8)');
    sun.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, this.cw, this.ch);
    // chmury (dryfują powoli)
    for (let i = 0; i < 7; i++) {
      const cx = (((hash(i) * 1.3 + t * (0.004 + hash(i + 3) * 0.006)) % 1.3) - 0.15) * this.cw;
      const cy = this.ch * (0.08 + hash(i + 7) * 0.7);
      const r = 14 + hash(i + 11) * 20;
      ctx.fillStyle = `rgba(255,255,255,${0.55 + hash(i + 5) * 0.3})`;
      for (const [dx, dy, k] of [
        [-1.1, 0.3, 0.8],
        [0, 0, 1.1],
        [1.2, 0.25, 0.85],
        [0.4, 0.45, 0.9],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx + dx * r, cy + dy * r, r * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const world = this.world;
    if (!world) {
      ctx.fillStyle = '#16314d';
      ctx.font = 'bold 15px system-ui';
      ctx.textAlign = 'center';
      const lines = (this.message || 'Zbuduj obwód w widoku schematu.').split('\n');
      lines.forEach((line, i) => halo(ctx, line, this.cw / 2, this.ch / 2 + i * 22));
      return;
    }
    const margin = 36;
    const s = Math.max(2, Math.min((this.cw - margin) / world.W, (this.ch - 40) / (world.H + 6)));
    const ox = margin;
    const oy = Math.max(8, (this.ch - (world.H + 6) * s) / 2) + 6;
    if (this.cachedFor !== world || this.cachedScale !== s) this.buildStatic(world, s);
    const Y = (y: number) => oy + (world.H - y) * s;
    const gndLevel = world.rawLevel(world.gnd);

    ctx.save();
    ctx.translate(ox, 0);
    // linie wysokości (pole potencjału): przerywane co 2 V nad poziomem masy
    if (this.overlay) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([2, 6]);
      ctx.lineWidth = 1;
      for (let v = 2; v <= this.vmax + 4; v += 2) {
        const y = Y(FLOOR_Y + gndLevel + v * CAL.cellsPerVolt);
        if (y < oy) break;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(world.W * s, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // ziemia, rury i drewniane ściany
    if (this.cache) {
      const dpr = window.devicePixelRatio || 1;
      ctx.drawImage(this.cache, 0, oy, this.cache.width / dpr, this.cache.height / dpr);
    }

    // tamy rosną z poziomem wody
    world.gaps.forEach((gp, i) => {
      const hi = Math.max(this.rawOf(world, gp.netL), this.rawOf(world, gp.netR));
      const top = FLOOR_Y + hi + 1.5;
      if (top > DAM_BASE_Y) {
        wood(ctx, gp.x0 * s, Y(top), (gp.x1 - gp.x0) * s, (top - DAM_BASE_Y) * s + 1, Math.max(5, s), 10 + i);
        ctx.fillStyle = WOOD.light;
        ctx.fillRect(gp.x0 * s - 1, Y(top), (gp.x1 - gp.x0) * s + 2, 3);
      }
    });

    // woda: ciała zbiorników z falującą powierzchnią, kolektor i szyby
    const waterGrad = (yTop: number, yBot: number) => {
      const g = ctx.createLinearGradient(0, yTop, 0, yBot);
      g.addColorStop(0, 'rgba(110,205,255,0.95)');
      g.addColorStop(1, 'rgba(24,100,190,0.95)');
      return g;
    };
    const fillRect = (r: Rect) => {
      ctx.fillStyle = waterGrad(Y(r.y1), Y(r.y0));
      ctx.fillRect(r.x0 * s, Y(r.y1), (r.x1 - r.x0) * s, (r.y1 - r.y0) * s);
    };
    fillRect({ x0: 3, y0: MANIFOLD_ROWS.y0, x1: world.gnd.rect.x1, y1: MANIFOLD_ROWS.y1 });
    for (const cd of world.conds) if (cd.kind === 'shaft') fillRect(cd.zone);
    for (const cd of world.conds) if (cd.kind === 'slot' && Math.abs(world.current(cd.id)) > 0.002) fillRect(cd.zone);
    const body = (x0: number, x1: number, yBase: number, level: number) => {
      const yTop = Y(FLOOR_Y + level);
      ctx.fillStyle = waterGrad(yTop, Y(yBase));
      ctx.beginPath();
      ctx.moveTo(x0 * s, Y(yBase));
      ctx.lineTo(x0 * s, yTop);
      for (let px = x0 * s; px <= x1 * s; px += 4) {
        ctx.lineTo(px, yTop + Math.sin(px * 0.11 + t * 2.2) * 1.4 + Math.sin(px * 0.047 - t * 1.3) * 1.1);
      }
      ctx.lineTo(x1 * s, Y(yBase));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(235,250,255,0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let px = x0 * s; px <= x1 * s; px += 4) {
        const py = yTop + Math.sin(px * 0.11 + t * 2.2) * 1.4 + Math.sin(px * 0.047 - t * 1.3) * 1.1;
        px === x0 * s ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    for (const tk of world.tanks.values()) {
      const lvl = world.rawLevel(tk);
      const isG = tk.net === world.gnd.net;
      // kolumna masy sięga w dół aż do kolektora, reszta zbiorników zaczyna się od podłogi
      body(tk.rect.x0, tk.rect.x1, isG ? MANIFOLD_ROWS.y0 : FLOOR_Y, lvl);
    }

    // cząstki jako mieniące się kropelki (widać przepływ)
    const sim = world.sim;
    for (const pass of [0, 1]) {
      ctx.fillStyle = pass === 0 ? 'rgba(200,238,255,0.30)' : 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      for (let i = sim.nB; i < sim.n; i++) {
        const sp = Math.hypot(sim.vx[i], sim.vy[i]);
        if ((pass === 1) !== sp > 4) continue;
        const x = sim.px[i] * s;
        const y = Y(sim.py[i]);
        const r = s * (pass ? 0.3 : 0.24);
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // wodospady: spadek napięcia na elemencie między sąsiednimi zbiornikami
    world.gaps.forEach((gp, k) => {
      if (!gp.connected) return;
      const lvL = this.rawOf(world, gp.netL);
      const lvR = this.rawOf(world, gp.netR);
      const drop = Math.abs(lvL - lvR);
      // wodospad tylko tam, gdzie woda naprawdę płynie; zamknięta tama (otwarty wyłącznik, przepalony bezpiecznik) stoi sucha
      const flow = this.gapFlow(world, gp, k === world.gaps.length - 1);
      if (drop < 0.35 || flow < 0.006) return;
      const leftHigher = lvL > lvR;
      const yTop = Y(FLOOR_Y + Math.max(lvL, lvR));
      const yBot = Y(FLOOR_Y + Math.min(lvL, lvR));
      const dir = leftHigher ? 1 : -1;
      const face = (leftHigher ? gp.x1 : gp.x0) * s;
      const sw = (0.9 + 2.6 * Math.min(1, flow / 0.35)) * s;
      const x0 = dir > 0 ? face : face - sw;
      // przelew na szczycie tamy
      ctx.fillStyle = 'rgba(190,235,255,0.95)';
      roundRect(ctx, gp.x0 * s, yTop - 3, (gp.x1 - gp.x0) * s + (dir > 0 ? sw * 0.5 : 0), 5, 2);
      ctx.fill();
      // sama kaskada
      const fall = ctx.createLinearGradient(0, yTop, 0, yBot);
      fall.addColorStop(0, 'rgba(235,250,255,0.95)');
      fall.addColorStop(1, 'rgba(110,195,255,0.8)');
      ctx.fillStyle = fall;
      ctx.beginPath();
      ctx.moveTo(dir > 0 ? face - 2 : face + 2, yTop - 2);
      ctx.quadraticCurveTo(dir > 0 ? x0 + sw : x0, yTop - 2, dir > 0 ? x0 + sw : x0, yTop + 14);
      ctx.lineTo(dir > 0 ? x0 + sw : x0, yBot);
      ctx.lineTo(dir > 0 ? face : face, yBot);
      ctx.closePath();
      ctx.fill();
      // smugi spadającej wody
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([7, 11]);
      ctx.lineDashOffset = -t * 110;
      for (let m = 0; m < 4; m++) {
        const lx = x0 + ((m + 0.6) / 4) * sw;
        ctx.beginPath();
        ctx.moveTo(lx, yTop + 6);
        ctx.lineTo(lx, yBot);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // piana i pryskająca woda na dole
      const cx = x0 + sw / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let m = 0; m < 7; m++) {
        const a = Math.sin(t * 7 + m * 1.7) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(cx + (m - 3) * sw * 0.18, yBot - a * 3, (0.35 + 0.25 * a) * s, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let m = 0; m < 9; m++) {
        const ph = (t * 1.4 + m / 9) % 1;
        const dx = (ph * 2.2 + 0.2) * s * (m % 2 ? 1 : -1);
        ctx.fillStyle = `rgba(255,255,255,${(1 - ph) * 0.9})`;
        ctx.beginPath();
        ctx.arc(cx + dx, yBot - Math.sin(ph * Math.PI) * s * 1.7, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // podpis: ile napięcia „spada" w wodospadzie
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff6c8';
      halo(ctx, `−${(drop / CAL.cellsPerVolt).toFixed(1)} V`, cx, yTop - 10);
    });

    // poziomy wody i napisy na tabliczkach
    for (const tk of world.tanks.values()) {
      const lvl = world.rawLevel(tk);
      const isG = tk.net === world.gnd.net;
      const x0 = tk.rect.x0 * s;
      const x1 = tk.rect.x1 * s;
      const yl = Y(FLOOR_Y + lvl);
      const v = world.voltage(tk.net);
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff6c8';
      halo(ctx, isG ? '0 V' : `${v.toFixed(2)} V`, (x0 + x1) / 2, yl - 6);
      const lab = this.labels.net.get(tk.net) ?? '';
      if (lab) plaque(ctx, (x0 + x1) / 2, Y(world.H - 2.5), [[lab, '#fff1cf']]);
    }
    // tabliczki elementów
    for (const c of world.conds) {
      const z = c.zone;
      const lab = this.labels.comp.get(c.id) ?? '';
      const i = world.current(c.id);
      const cx = ((z.x0 + z.x1) / 2) * s;
      const cy = c.kind === 'slot' ? Y(z.y1) - 24 : Y(1.2);
      if (c.kind === 'shaft') {
        ctx.strokeStyle = 'rgba(255,240,200,0.55)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, Y(z.y0));
        ctx.lineTo(cx, cy - 14);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      plaque(ctx, cx, cy, [
        [lab, '#fff1cf'],
        [`${(i * 1000).toFixed(0)} mA`, '#ffd36b'],
      ]);
    }
    ctx.restore();

    // linijka wysokości po lewej: „wysokość na niebie" = napięcie
    ctx.fillStyle = '#16314d';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'right';
    const y0 = Y(FLOOR_Y + gndLevel);
    for (let v = 0; v <= this.vmax + 4; v += 1) {
      const y = y0 - v * CAL.cellsPerVolt * s;
      if (y < oy) break;
      ctx.fillRect(margin - 7, y, v % 2 ? 3 : 6, 1.5);
      if (v % 2 === 0) ctx.fillText(`${v}`, margin - 10, y + 3);
    }
    ctx.textAlign = 'left';
    ctx.fillText('V', 4, Math.max(12, y0 - (this.vmax + 4) * s - 6));
    void COLORS;
  }
}
