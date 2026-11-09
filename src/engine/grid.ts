/** Geometria na siatce komórek d x d. y rośnie w górę. */
export class CellGrid {
  readonly w: number;
  readonly h: number;
  /** 1 = ściana */
  readonly solid: Uint8Array;
  /** opór liniowy (strefa porowata) na komórkę [1/s] */
  readonly gamma: Float32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.solid = new Uint8Array(w * h);
    this.gamma = new Float32Array(w * h);
  }

  idx(i: number, j: number): number {
    return j * this.w + i;
  }

  isSolid(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return true;
    return this.solid[j * this.w + i] === 1;
  }

  fillSolid(i0: number, j0: number, i1: number, j1: number, v = 1): void {
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) this.solid[this.idx(i, j)] = v;
    }
  }

  setGamma(i0: number, j0: number, i1: number, j1: number, gamma: number): void {
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) this.gamma[this.idx(i, j)] = gamma;
    }
  }
}
