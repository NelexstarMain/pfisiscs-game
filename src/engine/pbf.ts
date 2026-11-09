import { PARAMS } from './constants';
import { CellGrid } from './grid';

const { h, g, scorrDq, maxNeighbors } = PARAMS;
const H2 = h * h;
const POLY6 = 4 / (Math.PI * Math.pow(h, 8));
const SPIKY = -30 / (Math.PI * Math.pow(h, 5));

function poly6(r2: number): number {
  const d = H2 - r2;
  return d > 0 ? POLY6 * d * d * d : 0;
}

const W_DQ = poly6(scorrDq * scorrDq * H2);

/**
 * Płyn 2D metodą Position Based Fluids. Indeksy [0, nB) to nieruchome cząstki brzegowe,
 * [nB, n) to płyn. Deterministyczne: brak losowości.
 */
export class Sim {
  readonly grid: CellGrid;
  /** parametry do strojenia (domyślnie z PARAMS) */
  tune = { iterations: PARAMS.iterations as number, epsilon: PARAMS.epsilon as number, scorrK: PARAMS.scorrK as number, xsph: PARAMS.xsph as number };
  readonly nB: number;
  /** strefy z narzuconą prędkością x (FlowZone): cząstki w strefie nie reagują na ciśnienie w osi x */
  forced: { x0: number; y0: number; x1: number; y1: number; v: number; axis?: 'x' | 'y' }[] = [];
  /** opór strefy tłumi też przemieszczenie z korekcji ciśnienia (brak podłogi przecieku) */
  dragPressure = true;
  n: number;
  /** gęstość spoczynkowa policzona z idealnej siatki */
  readonly rho0: number;

  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  private qx: Float32Array;
  private qy: Float32Array;
  private lambda: Float32Array;
  private dx: Float32Array;
  private dy: Float32Array;
  private nbr: Int32Array;
  private nn: Int32Array;
  /** akumulatory par (symetryczne sumowanie): gęstość, gradient, suma |∇|², przemieszczenie */
  private aRho: Float64Array;
  private aGx: Float64Array;
  private aGy: Float64Array;
  private aGs: Float64Array;
  private aSx: Float64Array;
  private aSy: Float64Array;
  /** na krok: czynnik oporu strefy (1 poza strefą) i indeks strefy z narzuconą prędkością */
  private gfac: Float32Array;
  private zone: Int16Array;
  private cellFill: Int32Array;

  private cellStart: Int32Array;
  private cellItems: Int32Array;
  private gw: number;
  private gh: number;
  private cap: number;

  time = 0;
  /** liczba cząstek, które wyszły poza domenę (powinno być 0) */
  lost = 0;

  constructor(grid: CellGrid, capacity: number) {
    this.grid = grid;
    this.rho0 = idealDensity();
    const boundary = buildBoundary(grid);
    this.nB = boundary.length / 2;
    this.cap = this.nB + capacity;
    this.n = this.nB;
    const c = this.cap;
    this.px = new Float32Array(c);
    this.py = new Float32Array(c);
    this.vx = new Float32Array(c);
    this.vy = new Float32Array(c);
    this.qx = new Float32Array(c);
    this.qy = new Float32Array(c);
    this.lambda = new Float32Array(c);
    this.dx = new Float32Array(c);
    this.dy = new Float32Array(c);
    this.nbr = new Int32Array(c * maxNeighbors);
    this.nn = new Int32Array(c);
    this.aRho = new Float64Array(c);
    this.aGx = new Float64Array(c);
    this.aGy = new Float64Array(c);
    this.aGs = new Float64Array(c);
    this.aSx = new Float64Array(c);
    this.aSy = new Float64Array(c);
    this.gfac = new Float32Array(c);
    this.zone = new Int16Array(c);
    for (let k = 0; k < this.nB; k++) {
      this.px[k] = boundary[2 * k];
      this.py[k] = boundary[2 * k + 1];
    }
    this.gw = Math.ceil(grid.w / h) + 1;
    this.gh = Math.ceil(grid.h / h) + 1;
    this.cellStart = new Int32Array(this.gw * this.gh + 1);
    this.cellItems = new Int32Array(c);
    this.cellFill = new Int32Array(this.gw * this.gh);
  }

  /** Wypełnia komórki prostokąta cząstkami (po jednej na komórkę, środek komórki). */
  addFluid(i0: number, j0: number, i1: number, j1: number): number {
    let added = 0;
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        if (this.grid.isSolid(i, j) || this.n >= this.cap) continue;
        this.px[this.n] = i + 0.5;
        this.py[this.n] = j + 0.5;
        this.n++;
        added++;
      }
    }
    return added;
  }

  get fluidCount(): number {
    return this.n - this.nB;
  }

  private buildGrid(): void {
    const { gw, gh, cellStart, cellItems } = this;
    cellStart.fill(0);
    const cellOf = (x: number, y: number) =>
      Math.min(gh - 1, Math.max(0, (y / h) | 0)) * gw + Math.min(gw - 1, Math.max(0, (x / h) | 0));
    for (let k = 0; k < this.n; k++) cellStart[cellOf(this.qx[k], this.qy[k]) + 1]++;
    for (let c = 0; c < gw * gh; c++) cellStart[c + 1] += cellStart[c];
    const fill = this.cellFill;
    fill.fill(0);
    for (let k = 0; k < this.n; k++) {
      const c = cellOf(this.qx[k], this.qy[k]);
      cellItems[cellStart[c] + fill[c]++] = k;
    }
  }

  private findNeighbors(): void {
    const { gw, gh, cellStart, cellItems, qx, qy, nbr, nn } = this;
    for (let i = this.nB; i < this.n; i++) {
      const x = qx[i];
      const y = qy[i];
      const cx = Math.min(gw - 1, Math.max(0, (x / h) | 0));
      const cy = Math.min(gh - 1, Math.max(0, (y / h) | 0));
      let cnt = 0;
      const base = i * maxNeighbors;
      for (let oy = -1; oy <= 1; oy++) {
        const yy = cy + oy;
        if (yy < 0 || yy >= gh) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox;
          if (xx < 0 || xx >= gw) continue;
          const c = yy * gw + xx;
          for (let s = cellStart[c]; s < cellStart[c + 1]; s++) {
            const j = cellItems[s];
            if (j >= this.nB && j <= i) continue; // pary płyn-płyn tylko raz (j > i), ściany zawsze
            const ddx = x - qx[j];
            const ddy = y - qy[j];
            if (ddx * ddx + ddy * ddy < H2 && cnt < maxNeighbors) nbr[base + cnt++] = j;
          }
        }
      }
      nn[i] = cnt;
    }
  }

  private zoneOf(x: number, y: number): number {
    for (let z = 0; z < this.forced.length; z++) {
      const f = this.forced[z];
      if (x >= f.x0 && x < f.x1 && y >= f.y0 && y < f.y1) return z;
    }
    return -1;
  }

  /** wypycha cząstkę z komórek-ścian */
  private collide(i: number): void {
    const gr = this.grid;
    const x = this.qx[i];
    const y = this.qy[i];
    const ci = Math.floor(x);
    const cj = Math.floor(y);
    if (!gr.isSolid(ci, cj)) return;
    // najbliższe wyjście: sprawdź 4 kierunki
    const fx = x - ci;
    const fy = y - cj;
    let best = Infinity;
    let nx = x;
    let ny = y;
    const eps = 1e-3;
    if (!gr.isSolid(ci - 1, cj) && fx < best) {
      best = fx;
      nx = ci - eps;
      ny = y;
    }
    if (!gr.isSolid(ci + 1, cj) && 1 - fx < best) {
      best = 1 - fx;
      nx = ci + 1 + eps;
      ny = y;
    }
    if (!gr.isSolid(ci, cj - 1) && fy < best) {
      best = fy;
      nx = x;
      ny = cj - eps;
    }
    if (!gr.isSolid(ci, cj + 1) && 1 - fy < best) {
      best = 1 - fy;
      nx = x;
      ny = cj + 1 + eps;
    }
    if (best === Infinity) return; // głęboko w ścianie: zostaw (nie powinno się zdarzyć)
    this.qx[i] = nx;
    this.qy[i] = ny;
  }

  step(dt: number = PARAMS.dt): void {
    const { nB, n, px, py, vx, vy, qx, qy, lambda, dx, dy, nbr, nn, grid, gfac, zone } = this;
    const { aRho, aGx, aGy, aGs, aSx, aSy } = this;
    const gw = grid.w;
    const gh = grid.h;
    const gamma = grid.gamma;
    const solid = grid.solid;
    const forced = this.forced;
    const hasForced = forced.length > 0;
    const dragP = this.dragPressure;
    // predykcja z grawitacją i oporem strefy (półjawnie); opór i strefa zależą od pozycji z początku kroku,
    // więc liczymy je raz na cząstkę
    for (let i = nB; i < n; i++) {
      const ci = Math.min(gw - 1, Math.max(0, Math.floor(px[i])));
      const cj = Math.min(gh - 1, Math.max(0, Math.floor(py[i])));
      const gam = gamma[cj * gw + ci];
      // najpierw opór strefy (tłumi dotychczasową prędkość), potem grawitacja (nietłumiona),
      // żeby hydrostatyka w pionowym szybie nie była osłabiona oporem
      let f = 1;
      if (gam > 0) {
        f = 1 / (1 + gam * dt);
        vx[i] *= f;
        vy[i] *= f;
      }
      // korekcja ciśnienia w strefie jest tłumiona tym samym czynnikiem, więc grawitację też (równowaga hydrostatyczna)
      const fz = dragP ? f : 1;
      gfac[i] = fz;
      vy[i] -= g * dt * fz;
      const zi = hasForced ? this.zoneOf(px[i], py[i]) : -1;
      zone[i] = zi;
      if (zi >= 0) {
        if (forced[zi].axis === 'y') vy[i] = forced[zi].v;
        else vx[i] = forced[zi].v;
      }
      qx[i] = px[i] + vx[i] * dt;
      qy[i] = py[i] + vy[i] * dt;
      this.collideIfSolid(i, gw, gh, solid);
    }
    // cząstki brzegowe stoją
    for (let k = 0; k < nB; k++) {
      qx[k] = px[k];
      qy[k] = py[k];
    }
    this.buildGrid();
    this.findNeighbors();

    const rho0 = this.rho0;
    const invRho0 = 1 / rho0;
    const { iterations, epsilon, scorrK, xsph } = this.tune;
    const W0 = poly6(0);
    for (let it = 0; it < iterations; it++) {
      // 1. gęstość i gradienty: każda para płyn-płyn liczona raz i dodawana do obu cząstek
      for (let i = nB; i < n; i++) {
        aRho[i] = W0;
        aGx[i] = 0;
        aGy[i] = 0;
        aGs[i] = 0;
      }
      for (let i = nB; i < n; i++) {
        const base = i * maxNeighbors;
        const cnt = nn[i];
        const xi = qx[i];
        const yi = qy[i];
        let rho = aRho[i];
        let gix = aGx[i];
        let giy = aGy[i];
        let gsi = aGs[i];
        for (let s = 0; s < cnt; s++) {
          const j = nbr[base + s];
          const ddx = xi - qx[j];
          const ddy = yi - qy[j];
          const r2 = ddx * ddx + ddy * ddy;
          const dd = H2 - r2;
          const w = dd > 0 ? POLY6 * dd * dd * dd : 0;
          const r = Math.sqrt(r2) + 1e-9;
          const gm = (SPIKY * (h - r) * (h - r) * invRho0) / r;
          const gx = gm * ddx;
          const gy = gm * ddy;
          const gg = gm * gm * r2;
          rho += w;
          gix += gx;
          giy += gy;
          gsi += gg;
          if (j >= nB) {
            aRho[j] += w;
            aGx[j] -= gx;
            aGy[j] -= gy;
            aGs[j] += gg;
          }
        }
        aRho[i] = rho;
        aGx[i] = gix;
        aGy[i] = giy;
        aGs[i] = gsi;
      }
      for (let i = nB; i < n; i++) {
        const C = Math.max(0, aRho[i] * invRho0 - 1);
        lambda[i] = C > 0 ? -C / (aGs[i] + aGx[i] * aGx[i] + aGy[i] * aGy[i] + epsilon) : 0;
        aSx[i] = 0;
        aSy[i] = 0;
      }
      // 2. przemieszczenia: też parami, pary z zerowym λ pomijamy (nie wnoszą nic)
      const hasScorr = scorrK !== 0;
      for (let i = nB; i < n; i++) {
        const base = i * maxNeighbors;
        const cnt = nn[i];
        const li = lambda[i];
        const xi = qx[i];
        const yi = qy[i];
        let sx = aSx[i];
        let sy = aSy[i];
        for (let s = 0; s < cnt; s++) {
          const j = nbr[base + s];
          const wall = j < nB;
          const lj = wall ? li : lambda[j];
          const lsum = li + lj;
          if (lsum === 0 && !hasScorr) continue;
          const ddx = xi - qx[j];
          const ddy = yi - qy[j];
          const r2 = ddx * ddx + ddy * ddy;
          const r = Math.sqrt(r2) + 1e-9;
          let sc = 0;
          if (hasScorr) {
            const wr = poly6(r2) / W_DQ;
            sc = -scorrK * wr * wr * wr * wr;
          }
          const k = ((lsum + sc) * SPIKY * (h - r) * (h - r)) / r;
          const kx = k * ddx;
          const ky = k * ddy;
          sx += kx;
          sy += ky;
          if (!wall) {
            aSx[j] -= kx;
            aSy[j] -= ky;
          }
        }
        aSx[i] = sx;
        aSy[i] = sy;
      }
      for (let i = nB; i < n; i++) {
        dx[i] = aSx[i] * invRho0;
        dy[i] = aSy[i] * invRho0;
        const fz = gfac[i];
        const zi = zone[i];
        if (zi >= 0) {
          // w strefie z narzuconą prędkością nie ruszamy osi przepływu
          if (forced[zi].axis === 'y') qx[i] += dx[i] * fz;
          else qy[i] += dy[i] * fz;
        } else {
          qx[i] += dx[i] * fz;
          qy[i] += dy[i] * fz;
        }
        this.collideIfSolid(i, gw, gh, solid);
      }
    }

    // prędkości, lepkość XSPH (parami), zapis pozycji
    for (let i = nB; i < n; i++) {
      vx[i] = (qx[i] - px[i]) / dt;
      vy[i] = (qy[i] - py[i]) / dt;
      aSx[i] = 0;
      aSy[i] = 0;
    }
    for (let i = nB; i < n; i++) {
      const base = i * maxNeighbors;
      const cnt = nn[i];
      const xi = qx[i];
      const yi = qy[i];
      const vxi = vx[i];
      const vyi = vy[i];
      let ax = aSx[i];
      let ay = aSy[i];
      for (let s = 0; s < cnt; s++) {
        const j = nbr[base + s];
        if (j < nB) continue;
        const ddx = xi - qx[j];
        const ddy = yi - qy[j];
        const d2 = H2 - (ddx * ddx + ddy * ddy);
        if (d2 <= 0) continue;
        const w = (POLY6 * d2 * d2 * d2) * invRho0;
        const ux = (vx[j] - vxi) * w;
        const uy = (vy[j] - vyi) * w;
        ax += ux;
        ay += uy;
        aSx[j] -= ux;
        aSy[j] -= uy;
      }
      aSx[i] = ax;
      aSy[i] = ay;
    }
    const W = grid.w;
    const Hh = grid.h;
    for (let i = nB; i < n; i++) {
      vx[i] += xsph * aSx[i];
      vy[i] += xsph * aSy[i];
      px[i] = qx[i];
      py[i] = qy[i];
      if (!(px[i] >= 0 && px[i] <= W && py[i] >= 0 && py[i] <= Hh)) this.lost++;
    }
    this.time += dt;
  }

  /** szybka ścieżka: pełne wypychanie ze ściany tylko, gdy cząstka jest w komórce-ścianie lub poza siatką */
  private collideIfSolid(i: number, gw: number, gh: number, solid: Uint8Array): void {
    const ci = Math.floor(this.qx[i]);
    const cj = Math.floor(this.qy[i]);
    if (ci < 0 || cj < 0 || ci >= gw || cj >= gh || solid[cj * gw + ci] === 1) this.collide(i);
  }

  /** liczba cząstek płynu w prostokącie [x0,x1) x [y0,y1) */
  countIn(x0: number, y0: number, x1: number, y1: number): number {
    let c = 0;
    for (let i = this.nB; i < this.n; i++) {
      if (this.px[i] >= x0 && this.px[i] < x1 && this.py[i] >= y0 && this.py[i] < y1) c++;
    }
    return c;
  }

  /** suma prędkości x cząstek w prostokącie i ich liczba */
  vxIn(x0: number, y0: number, x1: number, y1: number): { sum: number; count: number } {
    let sum = 0;
    let count = 0;
    for (let i = this.nB; i < this.n; i++) {
      if (this.px[i] >= x0 && this.px[i] < x1 && this.py[i] >= y0 && this.py[i] < y1) {
        sum += this.vx[i];
        count++;
      }
    }
    return { sum, count };
  }

  /** deterministyczny skrót stanu (do testów powtarzalności) */
  hash(): number {
    let hsh = 2166136261;
    for (let i = this.nB; i < this.n; i++) {
      hsh = Math.imul(hsh ^ Math.round(this.px[i] * 1000), 16777619);
      hsh = Math.imul(hsh ^ Math.round(this.py[i] * 1000), 16777619);
    }
    return hsh >>> 0;
  }
}

/** gęstość kernela na idealnej siatce o odstępie 1 */
function idealDensity(): number {
  let rho = 0;
  const R = Math.ceil(h) + 1;
  for (let a = -R; a <= R; a++) {
    for (let b = -R; b <= R; b++) rho += poly6(a * a + b * b);
  }
  return rho;
}

/** cząstki brzegowe: komórki ścian w pobliżu przestrzeni otwartej, środki komórek */
function buildBoundary(grid: CellGrid): number[] {
  const out: number[] = [];
  const R = 3;
  for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
      if (!grid.isSolid(i, j)) continue;
      let near = false;
      for (let b = -R; b <= R && !near; b++) {
        for (let a = -R; a <= R; a++) {
          const ii = i + a;
          const jj = j + b;
          if (ii < 0 || jj < 0 || ii >= grid.w || jj >= grid.h) continue;
          if (!grid.isSolid(ii, jj)) {
            near = true;
            break;
          }
        }
      }
      if (near) out.push(i + 0.5, j + 0.5);
    }
  }
  return out;
}
