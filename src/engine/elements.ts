import type { Sim } from './pbf';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FlowZoneParams {
  /** "masa" (indukcyjność L dla cewki) */
  m: number;
  /** sztywność sprężyny (tłok kondensatora pływającego), 0 dla cewki */
  k: number;
  /** tłumienie (rezystancja szeregowa) */
  c: number;
  /** oś przepływu: 'x' (szczelina pozioma, domyślnie) albo 'y' (szyb, dodatni przepływ w dół) */
  axis?: 'x' | 'y';
  /** wygładzanie pomiaru różnicy poziomów [s] */
  tauHead?: number;
  /** siła korekty anty-windup do zmierzonego przepływu [1/s] */
  antiWindup?: number;
}

/**
 * Strefa wymuszonego przepływu. Stan: przepływ I [komórki²/s] i wychylenie X.
 *   m·dI/dt = Δh − k·X − c·I,   dX/dt = I / h_strefy
 * gdzie Δh = poziom lewy − prawy, zmierzony z cząstek. Przepływ jest realizowany prawdziwym ruchem cząstek
 * w strefie (ustawiamy ich prędkość), więc ładunek się zachowuje. Cewka: k=0. Tłok kondensatora: małe m, k>0.
 */
export class FlowZone {
  I = 0;
  X = 0;
  private headEma = 0;
  private primed = false;
  readonly hz: number;
  private entry: { x0: number; y0: number; x1: number; y1: number; v: number; axis?: 'x' | 'y' };

  constructor(
    private sim: Sim,
    private rect: Rect,
    private p: FlowZoneParams,
    private head: () => number,
  ) {
    this.hz = p.axis === 'y' ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
    this.entry = { ...rect, v: 0, axis: p.axis ?? 'x' };
    sim.forced.push(this.entry);
  }

  /** zmierzony przepływ (średnia objętościowa vx w strefie × wysokość) */
  measuredFlow(): number {
    const { sum, count } = this.sim.vxIn(this.rect.x0, this.rect.y0, this.rect.x1, this.rect.y1);
    return this.p.axis === 'y' ? 0 : count ? (sum / count) * this.hz : 0;
  }

  /** wywołać po sim.step() */
  step(dt: number): void {
    const raw = this.head();
    if (!this.primed) {
      this.headEma = raw;
      this.primed = true;
    }
    const tau = this.p.tauHead ?? 0.1;
    this.headEma += (1 - Math.exp(-dt / tau)) * (raw - this.headEma);
    const F = this.headEma - this.p.k * this.X - this.p.c * this.I;
    this.I += (dt * F) / this.p.m;
    this.X += (dt * this.I) / this.hz;
    const aw = this.p.antiWindup ?? 0;
    if (aw > 0) this.I += aw * (this.measuredFlow() - this.I) * dt;
    this.entry.v = (this.p.axis === 'y' ? -this.I : this.I) / this.hz;
  }
}
