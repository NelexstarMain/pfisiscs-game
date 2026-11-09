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

/** punkty (γ, G) posortowane rosnąco po γ */
const TABLE: [number, number][] = [
  [8, 11.0],
  [16, 6.2],
  [32, 2.55],
  [64, 1.29],
  [128, 0.708],
  [256, 0.337],
  [512, 0.182],
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

/** γ dla rezystancji R [Ω]: G = particlesPerAmpere / (R · cellsPerVolt) */
export function gammaForResistance(R: number): number {
  const G = CAL.particlesPerAmpere / (Math.max(R, 1e-6) * CAL.cellsPerVolt);
  return gammaForConductance(G);
}

/** rezystancja [Ω] realizowana przez γ (odwrotność gammaForResistance w zakresie tabeli) */
export function resistanceForGamma(gamma: number): number {
  const first = TABLE[0];
  const last = TABLE[TABLE.length - 1];
  if (gamma <= first[0]) return CAL.particlesPerAmpere / first[1];
  if (gamma >= last[0]) return CAL.particlesPerAmpere / last[1];
  for (let i = 0; i < TABLE.length - 1; i++) {
    const [g0, c0] = TABLE[i];
    const [g1, c1] = TABLE[i + 1];
    if (gamma >= g0 && gamma <= g1) {
      const t = (Math.log(gamma) - Math.log(g0)) / (Math.log(g1) - Math.log(g0));
      const G = Math.exp(Math.log(c0) + t * (Math.log(c1) - Math.log(c0)));
      return CAL.particlesPerAmpere / G;
    }
  }
  return CAL.particlesPerAmpere / last[1];
}

/** zakres rezystancji wspieranych przez symulację [Ω] */
export const R_MIN = CAL.particlesPerAmpere / TABLE[0][1];
export const R_MAX = CAL.particlesPerAmpere / TABLE[TABLE.length - 1][1];

/**
 * Szyb pionowy do masy daje o ok. 10–15% niższy zmierzony prąd niż wynika z V/R przy tym samym γ
 * (pomiar: tools/circuit.ts, prąd w strefie vs V/R dla R = 22…220 Ω). Korygujemy rezystancję przed przeliczeniem na γ.
 */
export const SHAFT_G_FACTOR = 0.87;
