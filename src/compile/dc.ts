/**
 * Mały solver DC (analiza węzłowa), używany WYŁĄCZNIE do rozmieszczenia naczyń na wysokościach.
 * Napięcia i prądy w grze nadal wynikają z cząstek (World), nie z tego pliku.
 */

export type DcType = 'resistor' | 'bulb' | 'switch' | 'diode' | 'led' | 'fuse' | 'inductor' | 'capacitor';

export interface DcCond {
  id: string;
  type: DcType;
  /** sieć portu 0 (anoda dla diody) */
  a: string;
  /** sieć portu 1 (katoda dla diody) */
  b: string;
  /** R [Ω], próg [V] (dioda/LED), prąd znamionowy (bezpiecznik), 1/0 (przełącznik) */
  value: number;
}

export interface DcSource {
  id?: string;
  type: 'battery' | 'supply' | 'ac';
  plus: string;
  volts: number;
}

export interface DcInput {
  /** wszystkie sieci łącznie z masą */
  nets: string[];
  gnd: string;
  conds: DcCond[];
  sources: DcSource[];
}

export interface Window {
  /** napięcie ustalone (przełączniki jak ustawione, bezpieczniki całe, AC w zerze, cewki zwarte, kondensatory rozwarte) */
  nom: number;
  /** napięcie w chwili włączenia: kondensatory rozładowane (zwarte), cewki bez prądu (rozwarte); od tego poziomu startuje woda */
  init: number;
  lo: number;
  hi: number;
}

/** opór otwartego zaworu (dioda, LED, bezpiecznik) [Ω]; zgodnie z world.ts */
export const R_VALVE = 12;
const R_SWITCH_CLOSED = 1;
const R_SHORT = 1;
/** zwarcie kondensatora w chwili włączenia (0 V na nim) */
const R_CAP_INIT = 0.001;
const GMIN = 1e-9;
const MAX_TOGGLES = 6;

interface State {
  switchClosed: Map<string, boolean>;
  diodeOn: Map<string, boolean>;
  fuseBlown: Map<string, boolean>;
  /** znak AC: +1, −1 albo 0 (nominalnie) dla kolejnych źródeł AC */
  acSign: number[];
  /** chwila włączenia: kondensator = zwarcie (0 V), cewka = rozwarcie (0 A) */
  initial?: boolean;
}

/** rozwiązuje układ równań Gx = b (eliminacja Gaussa z wyborem elementu głównego) */
function gauss(G: number[][], b: number[]): number[] {
  const n = b.length;
  const A = G.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    if (Math.abs(d) < 1e-18) continue;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = A[r][n];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = Math.abs(A[r][r]) < 1e-18 ? 0 : s / A[r][r];
  }
  return x;
}

/** napięcia sieci dla danego stanu przełączników, diod, bezpieczników i AC */
export function solveState(input: DcInput, st: State): Map<string, number> {
  const fixed = new Map<string, number>();
  fixed.set(input.gnd, 0);
  let acIdx = 0;
  for (const s of input.sources) {
    if (s.type === 'ac') fixed.set(s.plus, s.volts * (st.acSign[acIdx++] ?? 0));
    else fixed.set(s.plus, s.volts);
  }
  const unknown = input.nets.filter((n) => !fixed.has(n));
  const idx = new Map(unknown.map((n, i) => [n, i]));
  const m = unknown.length;
  const G = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const rhs = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) G[i][i] += GMIN;

  const stamp = (a: string, b: string, g: number, ieq: number) => {
    // prąd wypływający z a: g (Va − Vb) + ieq
    const ia = idx.get(a);
    const ib = idx.get(b);
    if (ia !== undefined) {
      G[ia][ia] += g;
      if (ib !== undefined) G[ia][ib] -= g;
      else rhs[ia] += g * (fixed.get(b) ?? 0);
      rhs[ia] -= ieq;
    }
    if (ib !== undefined) {
      G[ib][ib] += g;
      if (ia !== undefined) G[ib][ia] -= g;
      else rhs[ib] += g * (fixed.get(a) ?? 0);
      rhs[ib] += ieq;
    }
  };

  for (const c of input.conds) {
    switch (c.type) {
      case 'resistor':
      case 'bulb':
        stamp(c.a, c.b, 1 / Math.max(c.value, 1), 0);
        break;
      case 'switch':
        if (st.switchClosed.get(c.id) ?? c.value >= 0.5) stamp(c.a, c.b, 1 / R_SWITCH_CLOSED, 0);
        break;
      case 'diode':
      case 'led':
        if (st.diodeOn.get(c.id)) stamp(c.a, c.b, 1 / R_VALVE, -c.value / R_VALVE);
        break;
      case 'fuse':
        if (!st.fuseBlown.get(c.id)) stamp(c.a, c.b, 1 / R_VALVE, 0);
        break;
      case 'inductor':
        if (!st.initial) stamp(c.a, c.b, 1 / R_SHORT, 0);
        break;
      case 'capacitor':
        if (st.initial) stamp(c.a, c.b, 1 / R_CAP_INIT, 0);
        break; // w stanie ustalonym rozwarty
    }
  }
  const x = m ? gauss(G, rhs) : [];
  const out = new Map<string, number>();
  for (const n of input.nets) out.set(n, fixed.has(n) ? fixed.get(n)! : x[idx.get(n)!]);
  return out;
}

/** prąd diody od anody do katody w danym rozwiązaniu */
function diodeCurrent(c: DcCond, v: Map<string, number>): number {
  return ((v.get(c.a) ?? 0) - (v.get(c.b) ?? 0) - c.value) / R_VALVE;
}

/** stan nominalny: przełączniki jak ustawione, bezpieczniki całe, AC w zerze, diody z iteracji */
export function solveNominal(input: DcInput, initial = false): Map<string, number> {
  const diodes = input.conds.filter((c) => c.type === 'diode' || c.type === 'led');
  const st: State = {
    switchClosed: new Map(),
    diodeOn: new Map(diodes.map((d) => [d.id, true])),
    fuseBlown: new Map(),
    acSign: [],
    initial,
  };
  let v = solveState(input, st);
  for (let it = 0; it < 8; it++) {
    let changed = false;
    for (const d of diodes) {
      const on = st.diodeOn.get(d.id)!;
      if (on && diodeCurrent(d, v) < -1e-9) {
        st.diodeOn.set(d.id, false);
        changed = true;
      } else if (!on && (v.get(d.a) ?? 0) - (v.get(d.b) ?? 0) > d.value + 1e-9) {
        st.diodeOn.set(d.id, true);
        changed = true;
      }
    }
    if (!changed) break;
    v = solveState(input, st);
  }
  return v;
}

/** zakresy napięć sieci w scenariuszach pracy (do wyznaczenia wysokości ścianek naczyń) */
export function dcWindows(input: DcInput): Map<string, Window> {
  const nominal = solveNominal(input);
  const initial = solveNominal(input, true);
  const win = new Map<string, Window>();
  for (const n of input.nets) {
    const v = nominal.get(n) ?? 0;
    const v0 = initial.get(n) ?? 0;
    win.set(n, { nom: v, init: v0, lo: Math.min(v, v0), hi: Math.max(v, v0) });
  }
  const upd = (v: Map<string, number>) => {
    for (const [n, x] of v) {
      const w = win.get(n)!;
      w.lo = Math.min(w.lo, x);
      w.hi = Math.max(w.hi, x);
    }
  };
  type Toggle = { kind: 'switch' | 'diode' | 'fuse' | 'ac'; id: string; n: number };
  const toggles: Toggle[] = [];
  for (const c of input.conds) {
    if (c.type === 'switch') toggles.push({ kind: 'switch', id: c.id, n: 2 });
    else if (c.type === 'diode' || c.type === 'led') toggles.push({ kind: 'diode', id: c.id, n: 2 });
    else if (c.type === 'fuse') toggles.push({ kind: 'fuse', id: c.id, n: 2 });
  }
  const acs = input.sources.filter((s) => s.type === 'ac');
  acs.forEach((_, i) => toggles.push({ kind: 'ac', id: String(i), n: 2 }));
  const use = toggles.slice(0, MAX_TOGGLES);
  const combos = 1 << use.length;
  for (let mask = 0; mask < combos; mask++) {
    const st: State = { switchClosed: new Map(), diodeOn: new Map(), fuseBlown: new Map(), acSign: acs.map(() => 0) };
    for (const c of input.conds) {
      if (c.type === 'diode' || c.type === 'led') st.diodeOn.set(c.id, true);
    }
    use.forEach((t, bit) => {
      const on = (mask >> bit) & 1;
      if (t.kind === 'switch') st.switchClosed.set(t.id, on === 1);
      else if (t.kind === 'diode') st.diodeOn.set(t.id, on === 1);
      else if (t.kind === 'fuse') st.fuseBlown.set(t.id, on === 1);
      else st.acSign[Number(t.id)] = on ? 1 : -1;
    });
    upd(solveState(input, st));
    upd(solveState(input, { ...st, initial: true }));
  }
  // bateria to skończony zbiornik: okno sięga do pełnego rozładowania (0 V)
  for (const s of input.sources) {
    if (s.type === 'battery') {
      const w = win.get(s.plus)!;
      w.lo = Math.min(w.lo, 0);
    }
  }
  return win;
}
