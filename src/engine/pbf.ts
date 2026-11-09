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
  /** ściana bez tarcia stycznego (eksperyment: nie zmienia wyniku dzielnika, domyślnie wyłączone) */
  freeSlip = false;
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
    for (let k = 0; k < this.nB; k++) {
      this.px[k] = boundary[2 * k];
      this.py[k] = boundary[2 * k + 1];
    }
    this.gw = Math.ceil(grid.w / h) + 1;
    this.gh = Math.ceil(grid.h / h) + 1;
    this.cellStart = new Int32Array(this.gw * this.gh + 1);
    this.cellItems = new Int32Array(c);
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
    const fill = new Int32Array(gw * gh);
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
            if (j === i) continue;
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
    const { nB, n, px, py, vx, vy, qx, qy, lambda, dx, dy, nbr, nn, grid } = this;
    const gw = grid.w;
    // predykcja z grawitacją i oporem strefy (półjawnie)
    for (let i = nB; i < n; i++) {
      const ci = Math.min(grid.w - 1, Math.max(0, Math.floor(px[i])));
      const cj = Math.min(grid.h - 1, Math.max(0, Math.floor(py[i])));
      const gam = grid.gamma[cj * gw + ci];
      // najpierw opór strefy (tłumi dotychczasową prędkość), potem grawitacja (nietłumiona),
      // żeby hydrostatyka w pionowym szybie nie była osłabiona oporem
      let fg = 1;
      if (gam > 0) {
        const f = 1 / (1 + gam * dt);
        vx[i] *= f;
        vy[i] *= f;
        // korekcja ciśnienia w strefie jest tłumiona tym samym czynnikiem, więc grawitację też (równowaga hydrostatyczna)
        if (this.dragPressure) fg = f;
      }
      vy[i] -= g * dt * fg;
      if (this.forced.length) {
        const z = this.zoneOf(px[i], py[i]);
        if (z >= 0) {
          if (this.forced[z].axis === 'y') vy[i] = this.forced[z].v;
          else vx[i] = this.forced[z].v;
        }
      }
      qx[i] = px[i] + vx[i] * dt;
      qy[i] = py[i] + vy[i] * dt;
      this.collide(i);
    }
    // cząstki brzegowe stoją
    for (let k = 0; k < nB; k++) {
      qx[k] = px[k];
      qy[k] = py[k];
    }
    this.buildGrid();
    this.findNeighbors();

    const rho0 = this.rho0;
    const { iterations, epsilon, scorrK, xsph } = this.tune;
    for (let it = 0; it < iterations; it++) {
      for (let i = nB; i < n; i++) {
        let rho = poly6(0);
        let gsum2 = 0;
        let gix = 0;
        let giy = 0;
        const base = i * maxNeighbors;
        for (let s = 0; s < nn[i]; s++) {
          const j = nbr[base + s];
          const ddx = qx[i] - qx[j];
          const ddy = qy[i] - qy[j];
          const r2 = ddx * ddx + ddy * ddy;
          rho += poly6(r2);
          const r = Math.sqrt(r2) + 1e-9;
          const gm = (SPIKY * (h - r) * (h - r)) / (rho0 * r);
          gix += gm * ddx;
          giy += gm * ddy;
          gsum2 += gm * gm * r2;
        }
        gsum2 += gix * gix + giy * giy;
        const C = Math.max(0, rho / rho0 - 1);
        lambda[i] = -C / (gsum2 + epsilon);
      }
      for (let i = nB; i < n; i++) {
        let sx = 0;
        let sy = 0;
        // wkład ściany (cząstek brzegowych) i normalna ściany
        let bx = 0;
        let by = 0;
        let nxw = 0;
        let nyw = 0;
        const base = i * maxNeighbors;
        const li = lambda[i];
        for (let s = 0; s < nn[i]; s++) {
          const j = nbr[base + s];
          const ddx = qx[i] - qx[j];
          const ddy = qy[i] - qy[j];
          const r2 = ddx * ddx + ddy * ddy;
          const r = Math.sqrt(r2) + 1e-9;
          const wall = j < nB;
          const lj = wall ? li : lambda[j];
          const wr = poly6(r2) / W_DQ;
          const sc = -scorrK * wr * wr * wr * wr;
          const gm = (SPIKY * (h - r) * (h - r)) / r;
          const k = (li + lj + sc) * gm;
          if (wall && this.freeSlip) {
            bx += k * ddx;
            by += k * ddy;
            const w = poly6(r2);
            nxw += ddx * w;
            nyw += ddy * w;
          } else {
            sx += k * ddx;
            sy += k * ddy;
          }
        }
        if (bx !== 0 || by !== 0) {
          // ściana swobodnego poślizgu: tylko składowa wzdłuż normalnej
          const nl = Math.hypot(nxw, nyw);
          if (nl > 1e-9) {
            const ux = nxw / nl;
            const uy = nyw / nl;
            const proj = bx * ux + by * uy;
            sx += proj * ux;
            sy += proj * uy;
          } else {
            sx += bx;
            sy += by;
          }
        }
        dx[i] = sx / rho0;
        dy[i] = sy / rho0;
      }
      for (let i = nB; i < n; i++) {
        // w strefie oporowej tłumimy też przemieszczenie z korekcji ciśnienia (inaczej opór ma „podłogę przecieku")
        const gam = grid.gamma[Math.min(grid.h - 1, Math.max(0, Math.floor(py[i]))) * gw + Math.min(grid.w - 1, Math.max(0, Math.floor(px[i])))];
        const fz = gam > 0 && this.dragPressure ? 1 / (1 + gam * dt) : 1;
        const fzn = this.forced.length ? this.zoneOf(px[i], py[i]) : -1;
        if (fzn >= 0) {
          // w strefie z narzuconą prędkością nie ruszamy osi przepływu
          if (this.forced[fzn].axis === 'y') qx[i] += dx[i] * fz;
          else qy[i] += dy[i] * fz;
        } else {
          qx[i] += dx[i] * fz;
          qy[i] += dy[i] * fz;
        }
        this.collide(i);
      }
    }

    // prędkości, lepkość XSPH, zapis pozycji
    for (let i = nB; i < n; i++) {
      vx[i] = (qx[i] - px[i]) / dt;
      vy[i] = (qy[i] - py[i]) / dt;
    }
    for (let i = nB; i < n; i++) {
      let ax = 0;
      let ay = 0;
      const base = i * maxNeighbors;
      for (let s = 0; s < nn[i]; s++) {
        const j = nbr[base + s];
        if (j < nB) continue;
        const ddx = qx[i] - qx[j];
        const ddy = qy[i] - qy[j];
        const w = poly6(ddx * ddx + ddy * ddy) / rho0;
        ax += (vx[j] - vx[i]) * w;
        ay += (vy[j] - vy[i]) * w;
      }
      dx[i] = ax;
      dy[i] = ay;
    }
    for (let i = nB; i < n; i++) {
      vx[i] += xsph * dx[i];
      vy[i] += xsph * dy[i];
      px[i] = qx[i];
      py[i] = qy[i];
      if (!(px[i] >= 0 && px[i] <= grid.w && py[i] >= 0 && py[i] <= grid.h)) this.lost++;
    }
    this.time += dt;
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
