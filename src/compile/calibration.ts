/**
 * Kalibracja jednostek elektrycznych. Wartości z pomiarów M0 (docs/M0-notes.md):
 * przewodność szczeliny G = C_szereg/τ [komórki²/s na komórkę różnicy poziomów] dla oporu strefy γ.
 * Szczelina L=4, H=4, zbiorniki szerokości 12 (tools/rc.ts; γ ≥ 256 z przebiegów 140 s). G ≈ 90/γ dla γ ≥ 32.
 * Pomiary po zmianie silnika: opór strefy tłumi też przemieszczenie z korekcji ciśnienia (brak podłogi przecieku).
 * γ=8 jest ekstrapolacją.
 */
export const CAL = {
  /** 1 A = tyle cząstek na sekundę (komórki²/s) */
  particlesPerAmpere: 50,
  /** 1 V = tyle komórek wysokości */
  cellsPerVolt: 1,
  /** poziom GND nad dnem zbiorników [komórki], szczeliny zawsze zanurzone */
  groundLevel: 12,
};

/** punkty (γ, G) szczeliny poziomej, posortowane rosnąco po γ (G ≈ 88/γ dla γ ≥ 16) */
const TABLE: [number, number][] = [
  [8, 9.5],
  [16, 6.2],
  [32, 2.65],
  [64, 1.34],
  [128, 0.69],
  [256, 0.34],
  [512, 0.17],
  [1024, 0.085],
];

/** γ potrzebne, żeby szczelina miała przewodność G (interpolacja log-log, monotoniczna) */
export function gammaForConductance(G: number): number {
  const first = TABLE[0];
  const last = TABLE[TABLE.length - 1];
  if (G >= first[1]) return first[0];
  if (G <= last[1]) return last[0];
  for (let i = 0; i < TABLE.length - 1; i++) {
    const [g0, c0] = TABLE[i];
    const [g1, c1] = TABLE[i + 1];
    if (G <= c0 && G >= c1) {
      const t = (Math.log(G) - Math.log(c0)) / (Math.log(c1) - Math.log(c0));
      return Math.exp(Math.log(g0) + t * (Math.log(g1) - Math.log(g0)));
    }
  }
  return last[0];
}

/**
 * Pomiary prawdziwej przewodności szybu pionowego (tools/gsweep.ts, przepływ netto serwa): G·γ ≈ 77 ± 3 dla γ ≥ 24,
 * czyli R_eff ≈ 0,65·γ Ω. Szczelina pozioma ma G·γ ≈ 88 (tools/rc.ts), więc szyb przewodzi o ok. 12% gorzej.
 */
export const SHAFT_G_FACTOR = 0.88;

/** Estymator prądu (średnia prędkość w strefie × przekrój) zaniża o ok. 8% względem przepływu netto serwa. */
export const ZONE_FLOW_BIAS = 0.92;

/** γ dla rezystancji R [Ω]: G = particlesPerAmpere / (R · cellsPerVolt) */
export function gammaForResistance(R: number): number {
  const G = CAL.particlesPerAmpere / (Math.max(R, 1e-6) * CAL.cellsPerVolt);
  return gammaForConductance(G);
}

/** Zakres rezystancji [Ω] realizowanych w symulacji (dolna granica: opór wlotu/wylotu szybu przy małych γ). */
export const R_MIN = 7;
export const R_MAX = 330;
