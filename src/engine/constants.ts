// Jednostka długości d = 1 (odstęp między cząstkami). Wszystkie wartości do potwierdzenia w M0.
export const PARAMS = {
  /** promień jądra */
  h: 2.1,
  /** przyspieszenie grawitacyjne [d/s^2] */
  g: 100,
  /** krok fizyki [s] */
  dt: 1 / 240,
  /** iteracje solvera gęstości */
  iterations: 4,
  /** relaksacja w mianowniku lambda */
  epsilon: 5,
  /** korekcja naprężenia rozciągającego (s_corr) */
  scorrK: 0,
  scorrDq: 0.25,
  /** lepkość XSPH */
  xsph: 0.04,
  /** maks. cząstek na sąsiedztwo */
  maxNeighbors: 64,
} as const;

/** Skala jednostek elektrycznych (do potwierdzenia w M0). */
export const SCALE = {
  /** 1 A = tyle cząstek na sekundę */
  particlesPerAmpere: 50,
};
