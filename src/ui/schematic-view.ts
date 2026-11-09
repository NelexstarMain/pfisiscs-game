import { DEFS, type ComponentType } from '../components/defs';
import type { WorldView } from '../sim/view';
import type { Doc } from '../model/doc';
import { computeNets, type NetList } from '../model/nets';
import { portComp, portIndex, portKey, type Component, type PortKey, type Vec } from '../model/types';
import { COLORS, voltageColor } from './colors';
import { bounds, GRID, portOffsets, portPos, rotate } from './geometry';

export type Tool = 'select' | 'wire';

interface ViewHooks {
  onSelect(id: string | null): void;
  onStatus(msg: string): void;
}

/** Edytor schematu na canvasie (symbole IEC). Wszystkie zmiany idą przez Doc.apply. */
export class SchematicView {
  private ctx: CanvasRenderingContext2D;
  tool: Tool = 'select';
  selected: string | null = null;
  /** typ elementu do postawienia (tryb stawiania z palety) */
  placing: ComponentType | null = null;
  world: WorldView | null = null;
  vmax = 9;
  private nets: NetList;
  private mouse: Vec = { x: 0, y: 0 };
  private drag: { id: string; offset: Vec; start: Vec; moved: boolean } | null = null;
  private wireFrom: PortKey | null = null;
  private pan: Vec = { x: 40, y: 40 };
  private panDrag: { sx: number; sy: number; px: number; py: number } | null = null;
  private dots = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private doc: Doc,
    private hooks: ViewHooks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.nets = computeNets(doc);
    doc.subscribe(() => {
      this.nets = computeNets(doc);
    });
    canvas.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', () => this.onUp());
    canvas.addEventListener('dblclick', (e) => this.onDouble(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  resize(w: number, h: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private toGrid(e: MouseEvent): Vec {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.pan.x) / GRID, y: (e.clientY - r.top - this.pan.y) / GRID };
  }

  private snap(v: Vec): Vec {
    return { x: Math.round(v.x), y: Math.round(v.y) };
  }

  private hitPort(g: Vec): PortKey | null {
    for (const c of this.doc.components.values()) {
      for (let i = 0; i < DEFS[c.type].ports; i++) {
        const p = portPos(c, i);
        if (Math.hypot(p.x - g.x, p.y - g.y) < 0.45) return portKey(c.id, i);
      }
    }
    return null;
  }

  private hitComp(g: Vec): Component | null {
    let best: Component | null = null;
    for (const c of this.doc.components.values()) {
      const b = bounds(c);
      if (g.x >= b.x0 && g.x <= b.x1 && g.y >= b.y0 && g.y <= b.y1) best = c;
    }
    return best;
  }

  private onDown(e: MouseEvent): void {
    const g = this.toGrid(e);
    this.mouse = g;
    if (e.button === 1 || e.button === 2) {
      this.panDrag = { sx: e.clientX, sy: e.clientY, px: this.pan.x, py: this.pan.y };
      return;
    }
    if (this.placing) {
      const p = this.snap(g);
      const cmd = this.doc.makeAdd(this.placing, p);
      this.doc.apply(cmd);
      const id = (cmd as { comp: Component }).comp.id;
      this.select(id);
      if (!e.shiftKey) this.placing = null;
      return;
    }
    const port = this.hitPort(g);
    if (port && (this.tool === 'wire' || !this.hitComp(g) || true)) {
      // klik w port zawsze zaczyna/kończy przewód
      if (this.wireFrom === null) {
        this.wireFrom = port;
        this.hooks.onStatus('Kliknij drugi port, aby połączyć (Esc anuluje).');
      } else if (this.wireFrom !== port) {
        try {
          this.doc.apply(this.doc.makeWire(this.wireFrom, port));
          this.hooks.onStatus('Połączono.');
        } catch (err) {
          this.hooks.onStatus((err as Error).message);
        }
        this.wireFrom = null;
      } else {
        this.wireFrom = null;
      }
      return;
    }
    this.wireFrom = null;
    const c = this.hitComp(g);
    if (c) {
      this.select(c.id);
      this.drag = { id: c.id, offset: { x: g.x - c.pos.x, y: g.y - c.pos.y }, start: { ...c.pos }, moved: false };
    } else {
      // przewód pod kursorem?
      const wid = this.hitWire(g);
      if (wid) {
        this.select('wire:' + wid);
      } else {
        this.select(null);
      }
    }
  }

  private onMove(e: MouseEvent): void {
    if (this.panDrag) {
      this.pan = { x: this.panDrag.px + e.clientX - this.panDrag.sx, y: this.panDrag.py + e.clientY - this.panDrag.sy };
      return;
    }
    const g = this.toGrid(e);
    this.mouse = g;
    if (this.drag) {
      const c = this.doc.components.get(this.drag.id);
      if (!c) return;
      const p = this.snap({ x: g.x - this.drag.offset.x, y: g.y - this.drag.offset.y });
      if (p.x !== c.pos.x || p.y !== c.pos.y) {
        c.pos = p; // podgląd na żywo, komenda zapisuje się przy puszczeniu
        this.drag.moved = true;
      }
    }
  }

  private onUp(): void {
    this.panDrag = null;
    if (this.drag) {
      const c = this.doc.components.get(this.drag.id);
      if (c && this.drag.moved) {
        const end = { ...c.pos };
        c.pos = { ...this.drag.start };
        this.doc.apply({ kind: 'move', id: c.id, pos: end });
      }
      this.drag = null;
    }
  }

  private onDouble(e: MouseEvent): void {
    const c = this.hitComp(this.toGrid(e));
    if (c && c.type === 'switch') this.doc.apply({ kind: 'value', id: c.id, value: c.value >= 0.5 ? 0 : 1 });
  }

  private hitWire(g: Vec): string | null {
    for (const w of this.doc.wires.values()) {
      const pa = this.portOf(w.a);
      const pb = this.portOf(w.b);
      if (!pa || !pb) continue;
      for (const [a, b] of this.route(pa, pb)) {
        if (distSeg(g, a, b) < 0.35) return w.id;
      }
    }
    return null;
  }

  private portOf(k: PortKey): Vec | null {
    const c = this.doc.components.get(portComp(k));
    return c ? portPos(c, portIndex(k)) : null;
  }

  /** przewód prowadzony ortogonalnie: poziomo do połowy, pionowo, poziomo */
  private route(a: Vec, b: Vec): [Vec, Vec][] {
    if (a.x === b.x || a.y === b.y) return [[a, b]];
    const mx = (a.x + b.x) / 2;
    return [
      [a, { x: mx, y: a.y }],
      [{ x: mx, y: a.y }, { x: mx, y: b.y }],
      [{ x: mx, y: b.y }, b],
    ];
  }

  select(id: string | null): void {
    this.selected = id;
    this.hooks.onSelect(id && !id.startsWith('wire:') ? id : null);
  }

  deleteSelected(): void {
    if (!this.selected) return;
    if (this.selected.startsWith('wire:')) this.doc.apply({ kind: 'unwire', id: this.selected.slice(5) });
    else this.doc.apply({ kind: 'remove', id: this.selected });
    this.select(null);
  }

  rotateSelected(): void {
    if (!this.selected || this.selected.startsWith('wire:')) return;
    const c = this.doc.components.get(this.selected);
    if (!c) return;
    this.doc.apply({ kind: 'rotate', id: c.id, rot: ((c.rot + 90) % 360) as Component['rot'] });
  }

  cancel(): void {
    this.wireFrom = null;
    this.placing = null;
    this.hooks.onStatus('');
  }

  private netVoltage(k: PortKey): number | null {
    if (!this.world) return null;
    const net = this.nets.netOf.get(k);
    if (!net) return null;
    if (!this.world.tanks.has(net)) return null;
    return this.world.voltage(net);
  }

  draw(dtSec: number): void {
    const { ctx, canvas } = this;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    // siatka kropkowa
    ctx.fillStyle = COLORS.grid;
    const ox = ((this.pan.x % GRID) + GRID) % GRID;
    const oy = ((this.pan.y % GRID) + GRID) % GRID;
    for (let x = ox; x < w; x += GRID) for (let y = oy; y < h; y += GRID) ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.save();
    ctx.translate(this.pan.x, this.pan.y);
    this.dots += dtSec;

    // przewody
    for (const wire of this.doc.wires.values()) {
      const pa = this.portOf(wire.a);
      const pb = this.portOf(wire.b);
      if (!pa || !pb) continue;
      const v = this.netVoltage(wire.a);
      ctx.strokeStyle = this.selected === 'wire:' + wire.id ? COLORS.select : v === null ? COLORS.dim : voltageColor(v, this.vmax);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const segs = this.route(pa, pb);
      ctx.moveTo(segs[0][0].x * GRID, segs[0][0].y * GRID);
      for (const [, b] of segs) ctx.lineTo(b.x * GRID, b.y * GRID);
      ctx.stroke();
    }
    // przewód w trakcie rysowania
    if (this.wireFrom) {
      const pa = this.portOf(this.wireFrom);
      if (pa) {
        ctx.strokeStyle = COLORS.accent;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pa.x * GRID, pa.y * GRID);
        ctx.lineTo(this.mouse.x * GRID, this.mouse.y * GRID);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    for (const c of this.doc.components.values()) this.drawComponent(c);

    // duch elementu do postawienia
    if (this.placing) {
      const p = this.snap(this.mouse);
      ctx.globalAlpha = 0.5;
      this.drawComponent({ id: '_ghost', type: this.placing, value: DEFS[this.placing].defaultValue, pos: p, rot: 0 }, true);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawComponent(c: Component, ghost = false): void {
    const { ctx } = this;
    const def = DEFS[c.type];
    const sel = this.selected === c.id;
    const live = this.world && !ghost;
    ctx.save();
    ctx.translate(c.pos.x * GRID, c.pos.y * GRID);
    ctx.rotate((c.rot * Math.PI) / 180);
    const ink = sel ? COLORS.select : COLORS.ink;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 2;
    const L = 4 * GRID;
    const mid = L / 2;
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
    switch (c.type) {
      case 'resistor':
        line(0, 0, mid - 18, 0);
        line(mid + 18, 0, L, 0);
        ctx.strokeRect(mid - 18, -7, 36, 14);
        break;
      case 'bulb': {
        line(0, 0, mid - 12, 0);
        line(mid + 12, 0, L, 0);
        const p = live ? Math.min(1, this.world!.power(c.id) / 0.5) : 0;
        if (p > 0.02) {
          const g = ctx.createRadialGradient(mid, 0, 2, mid, 0, 34);
          g.addColorStop(0, `rgba(255,230,120,${0.9 * p})`);
          g.addColorStop(1, 'rgba(255,200,60,0)');
          ctx.fillStyle = g;
          ctx.fillRect(mid - 36, -36, 72, 72);
          ctx.fillStyle = ink;
        }
        ctx.beginPath();
        ctx.arc(mid, 0, 12, 0, Math.PI * 2);
        ctx.stroke();
        line(mid - 8, -8, mid + 8, 8);
        line(mid - 8, 8, mid + 8, -8);
        break;
      }
      case 'switch': {
        const closed = c.value >= 0.5;
        line(0, 0, mid - 14, 0);
        line(mid + 14, 0, L, 0);
        line(mid - 14, 0, mid + 12, closed ? 0 : -14);
        ctx.beginPath();
        ctx.arc(mid - 14, 0, 2.5, 0, Math.PI * 2);
        ctx.arc(mid + 14, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'inductor': {
        line(0, 0, mid - 20, 0);
        line(mid + 20, 0, L, 0);
        ctx.beginPath();
        for (let k = 0; k < 4; k++) ctx.arc(mid - 15 + k * 10, 0, 5, Math.PI, 0);
        ctx.stroke();
        break;
      }
      case 'diode':
      case 'led': {
        line(0, 0, mid - 10, 0);
        line(mid + 10, 0, L, 0);
        ctx.beginPath();
        ctx.moveTo(mid - 10, -11);
        ctx.lineTo(mid - 10, 11);
        ctx.lineTo(mid + 10, 0);
        ctx.closePath();
        ctx.stroke();
        line(mid + 10, -11, mid + 10, 11);
        if (c.type === 'led') {
          const p = live ? Math.min(1, this.world!.power(c.id) / 0.15) : 0;
          if (p > 0.02) {
            const g = ctx.createRadialGradient(mid, -2, 2, mid, -2, 30);
            g.addColorStop(0, `rgba(255,90,80,${0.95 * p})`);
            g.addColorStop(1, 'rgba(255,60,60,0)');
            ctx.fillStyle = g;
            ctx.fillRect(mid - 34, -34, 68, 68);
            ctx.fillStyle = ink;
          }
          line(mid - 2, -14, mid + 6, -22);
          line(mid + 4, -12, mid + 12, -20);
        }
        break;
      }
      case 'fuse': {
        const blown = live && this.world!.blown.has(c.id);
        line(0, 0, mid - 18, 0);
        line(mid + 18, 0, L, 0);
        ctx.strokeRect(mid - 18, -6, 36, 12);
        if (blown) {
          ctx.strokeStyle = COLORS.danger;
          line(mid - 18, 7, mid + 18, -7);
        } else line(mid - 18, 0, mid + 18, 0);
        break;
      }
      case 'capacitor':
        line(0, 0, mid - 4, 0);
        line(mid + 4, 0, L, 0);
        line(mid - 4, -12, mid - 4, 12);
        line(mid + 4, -12, mid + 4, 12);
        break;
      case 'battery':
        line(0, 0, mid - 6, 0);
        line(mid + 6, 0, L, 0);
        line(mid - 6, -7, mid - 6, 7); // minus: krótka
        ctx.lineWidth = 3.5;
        line(mid + 6, -13, mid + 6, 13); // plus: długa
        ctx.lineWidth = 2;
        break;
      case 'supply':
        line(0, 0, mid - 14, 0);
        line(mid + 14, 0, L, 0);
        ctx.beginPath();
        ctx.arc(mid, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '11px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('DC', mid, 4);
        break;
      case 'ac':
        line(0, 0, mid - 14, 0);
        line(mid + 14, 0, L, 0);
        ctx.beginPath();
        ctx.arc(mid, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mid - 8, 0);
        ctx.bezierCurveTo(mid - 5, -9, mid - 2, -9, mid, 0);
        ctx.bezierCurveTo(mid + 2, 9, mid + 5, 9, mid + 8, 0);
        ctx.stroke();
        break;
      case 'ground':
        line(0, 0, 0, 14);
        line(-12, 14, 12, 14);
        line(-8, 20, 8, 20);
        line(-4, 26, 4, 26);
        break;
      case 'voltmeter': {
        line(0, 0, 0, 14);
        ctx.beginPath();
        ctx.arc(0, 28, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = 'bold 13px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('V', 0, 33);
        break;
      }
    }
    // porty
    ctx.fillStyle = COLORS.bg;
    for (const o of portOffsets(c.type)) {
      ctx.beginPath();
      ctx.arc(o.x * GRID, o.y * GRID, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this.wireFrom && portKey(c.id, portOffsets(c.type).indexOf(o)) === this.wireFrom ? COLORS.accent : COLORS.dim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    // opis (bez obrotu, żeby był czytelny)
    ctx.save();
    const lab = c.type === 'switch' ? '' : this.valueLabel(c);
    const center = rotate({ x: c.type === 'ground' || c.type === 'voltmeter' ? 0 : 2, y: 0 }, c.rot);
    const lx = (c.pos.x + center.x) * GRID;
    const ly = (c.pos.y + center.y) * GRID;
    ctx.fillStyle = COLORS.dim;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(def.label + (lab ? ' ' + lab : ''), lx + (c.type === 'voltmeter' ? 34 : 0), ly + (c.rot === 90 || c.rot === 270 ? 0 : -22));
    if (live) {
      let txt = '';
      if (c.type === 'voltmeter') {
        const v = this.netVoltage(portKey(c.id, 0));
        txt = v === null ? '' : `${v.toFixed(2)} V`;
      } else if (c.type === 'resistor' || c.type === 'bulb' || c.type === 'switch' || c.type === 'diode' || c.type === 'led' || c.type === 'fuse' || c.type === 'inductor' || c.type === 'capacitor') {
        const i = this.world!.current(c.id);
        txt = `${(i * 1000).toFixed(0)} mA`;
      }
      if (txt) {
        ctx.fillStyle = COLORS.accent;
        ctx.font = 'bold 12px system-ui';
        ctx.fillText(txt, lx + (c.type === 'voltmeter' ? 34 : 0), ly + (c.rot === 90 || c.rot === 270 ? 14 : 24));
      }
    }
    ctx.restore();

    // kropki przepływu prądu na elemencie 2-portowym
    if (live && (c.type === 'resistor' || c.type === 'bulb' || c.type === 'switch' || c.type === 'diode' || c.type === 'led' || c.type === 'fuse' || c.type === 'inductor' || (c.type === 'capacitor' && this.world!.flows.has(c.id)))) {
      const i = this.world!.current(c.id);
      if (Math.abs(i) > 0.003) {
        const a = portPos(c, 0);
        const b = portPos(c, 1);
        const speed = Math.min(2.5, Math.abs(i) * 6);
        ctx.fillStyle = COLORS.water;
        for (let k = 0; k < 4; k++) {
          const t = (((this.dots * speed + k / 4) * Math.sign(i)) % 1 + 1) % 1;
          ctx.beginPath();
          ctx.arc((a.x + (b.x - a.x) * t) * GRID, (a.y + (b.y - a.y) * t) * GRID - 0, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private valueLabel(c: Component): string {
    const def = DEFS[c.type];
    if (!def.unit || c.type === 'voltmeter') return '';
    return `${c.value} ${def.unit}`;
  }
}

function distSeg(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
