import { describe, expect, it } from 'vitest';
import { compile } from '../src/compile/world';
import { EXAMPLES } from '../src/examples';
import { Doc } from '../src/model/doc';
import { SimHost } from '../src/sim/host';

describe('SimHost (logika workera, bez Web Workera)', () => {
  it('buduje świat i daje ramki zgodne z World liczonym bezpośrednio', () => {
    const data = JSON.parse(JSON.stringify(EXAMPLES.divider.data));
    const host = new SimHost();
    const info = host.build(1, data, 1);
    expect(typeof info).not.toBe('string');
    const d = new Doc();
    d.load(JSON.parse(JSON.stringify(EXAMPLES.divider.data)));
    const direct = compile(d, { k: 1 });
    // ta sama liczba kroków po obu stronach, więc wyniki muszą być identyczne (determinizm)
    for (let i = 0; i < 240; i++) direct.step();
    let done = 0;
    while (done < 240) done += host.advance(0.01, 1000).steps;
    expect(done).toBe(240);
    const f = host.frame(done, 0)!;
    expect(f.n).toBe(direct.sim.fluidCount);
    expect(f.time).toBeCloseTo(direct.time, 9);
    const net = (info as { tanks: { net: string }[] }).tanks[0].net;
    const idx = (info as { tanks: { net: string }[] }).tanks.findIndex((t) => t.net === net);
    expect(f.volts[idx]).toBeCloseTo(direct.voltage(net), 6);
    expect(f.pos[0]).toBeCloseTo(direct.sim.px[direct.sim.nB], 6);
  }, 60_000);

  it('błąd kompilacji wraca jako komunikat po polsku', () => {
    const host = new SimHost();
    const d = new Doc();
    d.apply(d.makeAdd('resistor', { x: 0, y: 0 })); // brak masy
    const r = host.build(2, d.toJSON(), 1);
    expect(typeof r).toBe('string');
    expect(r as string).toContain('masę');
  });

  it('komendy: przełącznik w locie, wartość rezystora bez przebudowy, nieobsługiwana wartość żąda przebudowy', () => {
    const host = new SimHost();
    host.build(3, JSON.parse(JSON.stringify(EXAMPLES.bulb.data)), 1);
    expect(host.command('setSwitch', 'c3', 1)).toBe(false);
    expect(host.command('setValue', 'c4', 30)).toBe(false); // żarówka: zmiana na żywo
    // zasilacz z 9 na 0 V zmienia potencjały tak, że wychodzą poza okno naczyń: potrzebna przebudowa
    expect(host.command('setValue', 'c1', 0)).toBe(true);
    // pauza: advance nic nie robi
    host.running = false;
    expect(host.advance(0.1, 100).steps).toBe(0);
  }, 60_000);
});
