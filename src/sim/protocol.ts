import type { Seg } from '../compile/outline';
import type { CondInfo, TankInfo } from '../compile/world';
import type { DocData } from '../model/types';

/** statyczne informacje o zbudowanym świecie (wysyłane raz po budowie) */
export interface StaticInfo {
  W: number;
  H: number;
  k: number;
  cellsPerVolt: number;
  outline: Seg[];
  /** naczynia razem z basenem masy; kolejność jak w tablicy `volts` ramki */
  tanks: TankInfo[];
  gndNet: string;
  /** kolejność jak w tablicach `currents` i `apertures` ramki */
  conds: CondInfo[];
  flowIds: string[];
  /** elementy, których wartość można zmienić w locie (suwak), bez przebudowy */
  liveIds: string[];
  basinNomY: number;
  nFluid: number;
}

export type ToWorker =
  | { type: 'build'; id: number; doc: DocData; k: number }
  | { type: 'run'; running: boolean; speed: number }
  | { type: 'cmd'; cmd: 'setSwitch' | 'setValue' | 'resetFuse'; id: string; value?: number }
  /** zwrot bufora pozycji do ponownego użycia */
  | { type: 'ack'; buf: Float32Array };

export interface Frame {
  id: number;
  time: number;
  n: number;
  /** x0,y0,x1,y1,… cząstek płynu */
  pos: Float32Array;
  volts: Float32Array;
  currents: Float32Array;
  apertures: Float32Array;
  blown: string[];
  lost: number;
  /** średni czas jednego kroku fizyki w tej ramce [ms] */
  stepMs: number;
  steps: number;
}

export type FromWorker =
  | { type: 'built'; id: number; info: StaticInfo }
  | { type: 'error'; id: number; message: string }
  | ({ type: 'frame' } & Frame)
  | { type: 'needRebuild' };
