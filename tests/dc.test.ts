import { describe, expect, it } from 'vitest';
import { dcWindows, solveNominal, type DcInput } from '../src/compile/dc';

const base = (conds: DcInput['conds'], sources: DcInput['sources'] = [{ type: 'supply', plus: 'P', volts: 9 }]): DcInput => ({
  nets: ['G', 'P', 'M', 'N'],
  gnd: 'G',
  conds,
  sources,
});

describe('solver DC do rozmieszczania naczyń', () => {
  it('dzielnik 47/47 daje połowę, 22/47 daje 9·47/69', () => {
    const a = solveNominal(base([{ id: 'r1', type: 'resistor', a: 'P', b: 'M', value: 47 }, { id: 'r2', type: 'resistor', a: 'M', b: 'G', value: 47 }]));
    expect(a.get('M')!).toBeCloseTo(4.5, 3);
    const b = solveNominal(base([{ id: 'r1', type: 'resistor', a: 'P', b: 'M', value: 22 }, { id: 'r2', type: 'resistor', a: 'M', b: 'G', value: 47 }]));
    expect(b.get('M')!).toBeCloseTo((9 * 47) / 69, 3);
  });

  it('równolegle: dwa rezystory do masy nie zmieniają napięcia węzła zasilanego', () => {
    const v = solveNominal(base([{ id: 'r1', type: 'resistor', a: 'P', b: 'G', value: 47 }, { id: 'r2', type: 'resistor', a: 'P', b: 'G', value: 100 }]));
    expect(v.get('P')!).toBeCloseTo(9, 6);
  });

  it('rozwarty przełącznik: węzeł za nim ma 0 V, a okno obejmuje 0 do wartości przy zwarciu', () => {
    const input = base([
      { id: 's', type: 'switch', a: 'P', b: 'M', value: 0 },
      { id: 'r', type: 'resistor', a: 'M', b: 'G', value: 47 },
    ]);
    expect(solveNominal(input).get('M')!).toBeCloseTo(0, 3);
    const w = dcWindows(input).get('M')!;
    expect(w.lo).toBeCloseTo(0, 3);
    expect(w.hi).toBeGreaterThan(8);
  });

  it('dioda: przewodzi w kierunku A→K, blokuje w odwrotnym', () => {
    const fwd = solveNominal(base([{ id: 'd', type: 'diode', a: 'P', b: 'M', value: 0.7 }, { id: 'r', type: 'resistor', a: 'M', b: 'G', value: 47 }]));
    // I = (9 − 0,7)/(12 + 47), V(M) = I·47
    expect(fwd.get('M')!).toBeCloseTo(((9 - 0.7) / 59) * 47, 2);
    const rev = solveNominal(base([{ id: 'd', type: 'diode', a: 'M', b: 'P', value: 0.7 }, { id: 'r', type: 'resistor', a: 'M', b: 'G', value: 47 }]));
    expect(rev.get('M')!).toBeCloseTo(0, 3);
  });

  it('AC: okno symetryczne wokół zera, nominalnie 0', () => {
    const w = dcWindows(base([{ id: 'r', type: 'resistor', a: 'P', b: 'G', value: 47 }], [{ type: 'ac', plus: 'P', volts: 4 }])).get('P')!;
    expect(w.nom).toBeCloseTo(0, 6);
    expect(w.lo).toBeCloseTo(-4, 6);
    expect(w.hi).toBeCloseTo(4, 6);
  });

  it('bateria: okno sięga do 0 V (pełne rozładowanie), cewka to zwarcie, kondensator rozwarty', () => {
    const w = dcWindows(base([{ id: 'l', type: 'inductor', a: 'P', b: 'M', value: 1 }, { id: 'c', type: 'capacitor', a: 'M', b: 'N', value: 10 }], [{ type: 'battery', plus: 'P', volts: 9 }]));
    expect(w.get('P')!.lo).toBe(0);
    expect(w.get('P')!.hi).toBeCloseTo(9, 6);
    expect(w.get('M')!.nom).toBeCloseTo(9, 2); // cewka zwiera P z M
    expect(w.get('N')!.nom).toBeCloseTo(0, 3); // kondensator rozwarty, N wisi na gmin
  });
});
