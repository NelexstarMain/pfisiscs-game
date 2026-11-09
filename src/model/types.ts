import type { ComponentType } from '../components/defs';

export interface Vec {
  x: number;
  y: number;
}

export interface Component {
  id: string;
  type: ComponentType;
  /** wartość główna (R, V, C...) */
  value: number;
  /** pozycja w widoku schematu (siatka) */
  pos: Vec;
  rot: 0 | 90 | 180 | 270;
}

/** Port to para (id komponentu, indeks portu), zapisywany jako "id:indeks" */
export type PortKey = string;
export const portKey = (id: string, index: number): PortKey => `${id}:${index}`;
export const portComp = (k: PortKey): string => k.slice(0, k.lastIndexOf(':'));
export const portIndex = (k: PortKey): number => Number(k.slice(k.lastIndexOf(':') + 1));

export interface Wire {
  id: string;
  a: PortKey;
  b: PortKey;
}

export interface DocData {
  version: 1;
  components: Component[];
  wires: Wire[];
  nextId: number;
}
