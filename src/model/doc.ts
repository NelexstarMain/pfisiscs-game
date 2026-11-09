import { DEFS, type ComponentType } from '../components/defs';
import { portComp, portIndex, portKey, type Component, type DocData, type PortKey, type Vec, type Wire } from './types';

export type Command =
  | { kind: 'add'; comp: Component }
  | { kind: 'remove'; id: string }
  | { kind: 'wire'; wire: Wire }
  | { kind: 'unwire'; id: string }
  | { kind: 'value'; id: string; value: number }
  | { kind: 'move'; id: string; pos: Vec }
  | { kind: 'rotate'; id: string; rot: Component['rot'] }
  | { kind: 'batch'; cmds: Command[] };

type Listener = (cmd: Command) => void;

/** Dokument obwodu: jedyne źródło prawdy dla obu widoków. Zmiany tylko przez apply(). */
export class Doc {
  components = new Map<string, Component>();
  wires = new Map<string, Wire>();
  private nextId = 1;
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  newId(prefix: string): string {
    return `${prefix}${this.nextId++}`;
  }

  /** Buduje komendę dodania elementu (z domyślną wartością) */
  makeAdd(type: ComponentType, pos: Vec, rot: Component['rot'] = 0): Command {
    const def = DEFS[type];
    return { kind: 'add', comp: { id: this.newId('c'), type, value: def.defaultValue, pos, rot } };
  }

  makeWire(a: PortKey, b: PortKey): Command {
    return { kind: 'wire', wire: { id: this.newId('w'), a, b } };
  }

  /** Wykonuje komendę i zapisuje odwrotną na stosie undo */
  apply(cmd: Command): void {
    const inv = this.exec(cmd);
    this.undoStack.push(inv);
    this.redoStack = [];
    this.emit(cmd);
  }

  undo(): boolean {
    const inv = this.undoStack.pop();
    if (!inv) return false;
    const redo = this.exec(inv);
    this.redoStack.push(redo);
    this.emit(inv);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    const inv = this.exec(cmd);
    this.undoStack.push(inv);
    this.emit(cmd);
    return true;
  }

  private emit(cmd: Command) {
    for (const l of this.listeners) l(cmd);
  }

  /** Wykonuje komendę bez historii i zwraca komendę odwrotną. */
  private exec(cmd: Command): Command {
    switch (cmd.kind) {
      case 'add': {
        if (this.components.has(cmd.comp.id)) throw new Error(`Element ${cmd.comp.id} już istnieje`);
        this.components.set(cmd.comp.id, { ...cmd.comp, pos: { ...cmd.comp.pos } });
        return { kind: 'remove', id: cmd.comp.id };
      }
      case 'remove': {
        const c = this.components.get(cmd.id);
        if (!c) throw new Error(`Brak elementu ${cmd.id}`);
        // usuń też przewody podłączone do portów elementu; odwrotność przywraca wszystko
        const removedWires = [...this.wires.values()].filter((w) => portComp(w.a) === cmd.id || portComp(w.b) === cmd.id);
        for (const w of removedWires) this.wires.delete(w.id);
        this.components.delete(cmd.id);
        return {
          kind: 'batch',
          cmds: [{ kind: 'add', comp: c }, ...removedWires.map((w) => ({ kind: 'wire', wire: w }) as Command)],
        };
      }
      case 'wire': {
        const { a, b } = cmd.wire;
        this.checkPort(a);
        this.checkPort(b);
        if (a === b) throw new Error('Przewód łączy port z samym sobą');
        this.wires.set(cmd.wire.id, { ...cmd.wire });
        return { kind: 'unwire', id: cmd.wire.id };
      }
      case 'unwire': {
        const w = this.wires.get(cmd.id);
        if (!w) throw new Error(`Brak przewodu ${cmd.id}`);
        this.wires.delete(cmd.id);
        return { kind: 'wire', wire: w };
      }
      case 'value': {
        const c = this.mustGet(cmd.id);
        const old = c.value;
        c.value = cmd.value;
        return { kind: 'value', id: cmd.id, value: old };
      }
      case 'move': {
        const c = this.mustGet(cmd.id);
        const old = c.pos;
        c.pos = { ...cmd.pos };
        return { kind: 'move', id: cmd.id, pos: old };
      }
      case 'rotate': {
        const c = this.mustGet(cmd.id);
        const old = c.rot;
        c.rot = cmd.rot;
        return { kind: 'rotate', id: cmd.id, rot: old };
      }
      case 'batch': {
        const invs = cmd.cmds.map((c) => this.exec(c));
        return { kind: 'batch', cmds: invs.reverse() };
      }
    }
  }

  private mustGet(id: string): Component {
    const c = this.components.get(id);
    if (!c) throw new Error(`Brak elementu ${id}`);
    return c;
  }

  private checkPort(k: PortKey) {
    const c = this.components.get(portComp(k));
    if (!c) throw new Error(`Brak elementu dla portu ${k}`);
    const idx = portIndex(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= DEFS[c.type].ports) throw new Error(`Zły port ${k}`);
  }

  allPorts(): PortKey[] {
    const out: PortKey[] = [];
    for (const c of this.components.values()) for (let i = 0; i < DEFS[c.type].ports; i++) out.push(portKey(c.id, i));
    return out;
  }

  toJSON(): DocData {
    return {
      version: 1,
      components: [...this.components.values()].map((c) => ({ ...c, pos: { ...c.pos } })),
      wires: [...this.wires.values()].map((w) => ({ ...w })),
      nextId: this.nextId,
    };
  }

  static fromJSON(data: DocData): Doc {
    if (data.version !== 1) throw new Error(`Nieznana wersja dokumentu: ${String(data.version)}`);
    const d = new Doc();
    for (const c of data.components) d.components.set(c.id, { ...c, pos: { ...c.pos } });
    for (const w of data.wires) {
      d.checkPort(w.a);
      d.checkPort(w.b);
      d.wires.set(w.id, { ...w });
    }
    d.nextId = data.nextId;
    return d;
  }
}
