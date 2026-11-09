/** kolor potencjału: 0 V granatowy → wysokie napięcie ciepły pomarańcz */
export function voltageColor(v: number, vmax: number): string {
  const t = Math.max(0, Math.min(1, vmax > 0 ? v / vmax : 0));
  const h = 215 - 190 * t; // niebieski → pomarańczowy
  return `hsl(${h.toFixed(0)}, 80%, ${(48 + 6 * t).toFixed(0)}%)`;
}

export const COLORS = {
  bg: '#0f1720',
  panel: '#17212c',
  grid: '#1e2b38',
  ink: '#dbe6f0',
  dim: '#7b8ea1',
  wall: '#34465a',
  water: '#4aa3ff',
  accent: '#ffb347',
  select: '#7ee0a5',
  danger: '#ff6b6b',
};
