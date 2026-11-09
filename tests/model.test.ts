import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model/doc';
import { computeNets } from '../src/model/nets';

function build() {
  const d = new Doc();
  const add = (type: Parameters<Doc['makeAdd']>[0], x: number, y: number) => {
    const cmd = d.makeAdd(type, { x, y });
    d.apply(cmd);
    return (cmd as { kind: 'add'; comp: { id: string } }).comp.id;
  };
  return { d, add };
}

describe('model dokumentu', () => {
  it('sieci z przewodów: bateria + rezystor + masa', () => {
    const { d, add } = build();
    const bat = add('battery', 0, 0);
    const r = add('resistor', 4, 0);
    const g = add('ground', 8, 0);
    d.apply(d.makeWire(`${bat}:1`, `${r}:0`));
    d.apply(d.makeWire(`${r}:1`, `${g}:0`));
    d.apply(d.makeWire(`${bat}:0`, `${g}:0`));
    const nl = computeNets(d);
    expect(nl.nets.length).toBe(2); // plus oraz masa
    expect(nl.netOf.get(`${bat}:0`)).toBe(nl.netOf.get(`${g}:0`));
    expect(nl.netOf.get(`${bat}:1`)).toBe(nl.netOf.get(`${r}:0`));
    expect(nl.groundNet).toBe(nl.netOf.get(`${g}:0`));
  });

  it('stabilne ID sieci: najmniejszy klucz portu, niezależnie od kolejności przewodów', () => {
    const a = build();
    const b = build();
    for (const x of [a, b]) {
      x.add('resistor', 0, 0);
      x.add('resistor', 4, 0);
      x.add('resistor', 8, 0);
    }
    a.d.apply(a.d.makeWire('c1:1', 'c2:0'));
    a.d.apply(a.d.makeWire('c2:0', 'c3:0'));
    b.d.apply(b.d.makeWire('c2:0', 'c3:0'));
    b.d.apply(b.d.makeWire('c3:0', 'c1:1'));
    expect(computeNets(a.d).netOf.get('c3:0')).toBe(computeNets(b.d).netOf.get('c3:0'));
    expect(computeNets(a.d).netOf.get('c3:0')).toBe('c1:1');
  });

  it('undo/redo przywraca stan, usunięcie elementu cofa też jego przewody', () => {
    const { d, add } = build();
    const r1 = add('resistor', 0, 0);
    const r2 = add('resistor', 4, 0);
    d.apply(d.makeWire(`${r1}:1`, `${r2}:0`));
    d.apply({ kind: 'value', id: r1, value: 470 });
    expect(d.components.get(r1)!.value).toBe(470);
    d.apply({ kind: 'remove', id: r1 });
    expect(d.components.has(r1)).toBe(false);
    expect(d.wires.size).toBe(0);
    d.undo();
    expect(d.components.has(r1)).toBe(true);
    expect(d.wires.size).toBe(1);
    expect(d.components.get(r1)!.value).toBe(470);
    d.undo(); // cofnij zmianę wartości
    expect(d.components.get(r1)!.value).toBe(47);
    d.redo();
    expect(d.components.get(r1)!.value).toBe(470);
  });

  it('nowa komenda czyści stos redo', () => {
    const { d, add } = build();
    const r = add('resistor', 0, 0);
    d.apply({ kind: 'move', id: r, pos: { x: 1, y: 1 } });
    d.undo();
    d.apply({ kind: 'move', id: r, pos: { x: 2, y: 2 } });
    expect(d.redo()).toBe(false);
    expect(d.components.get(r)!.pos).toEqual({ x: 2, y: 2 });
  });

  it('serializacja JSON w obie strony zachowuje sieci i identyfikatory', () => {
    const { d, add } = build();
    const bat = add('battery', 0, 0);
    const g = add('ground', 4, 0);
    d.apply(d.makeWire(`${bat}:0`, `${g}:0`));
    const copy = Doc.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
    expect(computeNets(copy).netOf.get(`${bat}:0`)).toBe(computeNets(d).netOf.get(`${bat}:0`));
    const n = copy.makeAdd('resistor', { x: 0, y: 0 });
    expect((n as { comp: { id: string } }).comp.id).not.toBe(bat);
  });

  it('odrzuca zły port i przewód do siebie', () => {
    const { d, add } = build();
    const r = add('resistor', 0, 0);
    expect(() => d.apply(d.makeWire(`${r}:0`, `${r}:5`))).toThrow();
    expect(() => d.apply(d.makeWire(`${r}:0`, `${r}:0`))).toThrow();
  });

  it('zdarzenia: widoki dostają powiadomienia o komendach', () => {
    const { d, add } = build();
    const seen: string[] = [];
    d.subscribe((c) => seen.push(c.kind));
    const r = add('resistor', 0, 0);
    d.apply({ kind: 'value', id: r, value: 10 });
    d.undo();
    expect(seen).toEqual(['add', 'value', 'value']);
  });
});
