/** Kontur jamy: krawędzie między komórkami „jama" (1) a ścianą (0); powietrze (2) nie ma krawędzi. */
export type Seg = [number, number, number, number];

export function cavityOutline(mask: Uint8Array, w: number, h: number): Seg[] {
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : mask[j * w + i]);
  const out: Seg[] = [];
  // krawędzie poziome (y = j lub j+1), scalane wzdłuż x
  for (const dir of [-1, 1]) {
    for (let j = 0; j < h; j++) {
      let start = -1;
      for (let i = 0; i <= w; i++) {
        const edge = i < w && at(i, j) === 1 && at(i, j + dir) === 0;
        if (edge && start < 0) start = i;
        if (!edge && start >= 0) {
          const y = dir === -1 ? j : j + 1;
          out.push([start, y, i, y]);
          start = -1;
        }
      }
    }
  }
  // krawędzie pionowe, scalane wzdłuż y
  for (const dir of [-1, 1]) {
    for (let i = 0; i < w; i++) {
      let start = -1;
      for (let j = 0; j <= h; j++) {
        const edge = j < h && at(i, j) === 1 && at(i + dir, j) === 0;
        if (edge && start < 0) start = j;
        if (!edge && start >= 0) {
          const x = dir === -1 ? i : i + 1;
          out.push([x, start, x, j]);
          start = -1;
        }
      }
    }
  }
  return out;
}
