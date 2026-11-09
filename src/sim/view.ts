import type { Seg } from '../compile/outline';
import type { CondInfo, TankInfo } from '../compile/world';

/**
 * To, co interfejs, zadania i oscyloskop czytają ze świata. Implementują to zarówno `World` (bezpośrednio, w testach),
 * jak i `SimClient` (świat żyje w Web Workerze, tu są tylko ostatnie wyniki).
 */
export interface WorldView {
  W: number;
  H: number;
  k: number;
  cal: { cellsPerVolt: number };
  outline: Seg[];
  layout: { basin: { nomY: number } };
  tanks: Map<string, TankInfo>;
  gnd: TankInfo;
  conds: CondInfo[];
  flows: { has(id: string): boolean };
  blown: Set<string>;
  time: number;
  /** pozycje cząstek płynu: indeksy [nB, n) */
  sim: { nB: number; n: number; px: Float32Array; py: Float32Array; lost: number };
  voltage(net: string): number;
  current(compId: string): number;
  power(compId: string): number;
  aperture(compId: string): number;
  setSwitch(compId: string, closed: boolean): void;
  /** true, jeśli wartość zmieniono w locie; false, jeśli trzeba przebudować świat */
  setValue(compId: string, value: number): boolean;
  resetFuse(compId: string): void;
}
