import type { Doc } from './doc';
import { portComp, type PortKey } from './types';

export interface Net {
  /** stabilne ID: najmniejszy klucz portu (porównanie leksykograficzne) */
  id: string;
  ports: PortKey[];
}

export interface NetList {
  nets: Net[];
  /** port -> id sieci */
  netOf: Map<PortKey, string>;
  /** id sieci masy (jeśli jest element GND), inaczej null */
  groundNet: string | null;
}

/** Sieci z przewodów (union-find). Każdy port należy do dokładnie jednej sieci. */
export function computeNets(doc: Doc): NetList {
  const parent = new Map<PortKey, PortKey>();
  const find = (x: PortKey): PortKey => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const p of doc.allPorts()) parent.set(p, p);
  for (const w of doc.wires.values()) {
    const ra = find(w.a);
    const rb = find(w.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  // wszystkie symbole masy to ta sama sieć
  let firstGnd: PortKey | null = null;
  for (const c of doc.components.values()) {
    if (c.type !== 'ground') continue;
    const k = `${c.id}:0`;
    if (firstGnd === null) firstGnd = k;
    else {
      const ra = find(firstGnd);
      const rb = find(k);
      if (ra !== rb) parent.set(ra, rb);
    }
  }
  const groups = new Map<PortKey, PortKey[]>();
  for (const p of parent.keys()) {
    const r = find(p);
    const list = groups.get(r) ?? [];
    list.push(p);
    groups.set(r, list);
  }
  const nets: Net[] = [];
  const netOf = new Map<PortKey, string>();
  for (const ports of groups.values()) {
    ports.sort();
    const id = ports[0];
    nets.push({ id, ports });
    for (const p of ports) netOf.set(p, id);
  }
  nets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let groundNet: string | null = null;
  for (const c of doc.components.values()) {
    if (c.type === 'ground') {
      const g = netOf.get(`${c.id}:0`)!;
      if (groundNet === null || g < groundNet) groundNet = g;
    }
  }
  return { nets, netOf, groundNet };
}

export { portComp };
