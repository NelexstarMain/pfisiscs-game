import { describe, expect, it } from 'vitest';
import { buildLayout, type Layout, type LayoutInput, type Rect } from '../src/compile/layout';
import { cavityOutline } from '../src/compile/outline';

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInput(seed: number, k: number): LayoutInput {
  const r = rng(seed);
  const n = 1 + Math.floor(r() * 5);
  const order = Array.from({ length: n }, (_, i) => `N${i}`);
  const win = new Map(
    order.map((net) => {
      const nom = r() * 9;
      return [net, { nom, lo: Math.max(-4, nom - r() * 4), hi: nom + r() * 4 }];
    }),
  );
  const slots: LayoutInput['slots'] = [];
  for (let i = 0; i < n - 1; i++) {
    const c = 1 + Math.floor(r() * 2);
    for (let s = 0; s < c; s++) slots.push({ id: `s${i}_${s}`, netA: order[i], netB: order[i + 1] });
  }
  const shafts: LayoutInput['shafts'] = [];
  order.forEach((net, i) => {
    const c = Math.floor(r() * 4);
    for (let j = 0; j < c; j++) shafts.push({ id: `g${i}_${j}`, net });
  });
  return { k, order, win, width: new Map(order.map((net) => [net, 6 * k])), slots, shafts, basinWidth: 14 * k };
}

const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);

/** rasteryzuje jamy; zwraca właściciela każdej komórki (0 = ściana) */
function raster(l: Layout) {
  const owner = new Int32Array(l.W * l.H);
  const names: string[] = ['ściana'];
  const adj = new Set<string>();
  const put = (r: Rect, name: string) => {
    let id = names.indexOf(name);
    if (id < 0) id = names.push(name) - 1;
    expect(r.x0).toBeGreaterThanOrEqual(0);
    expect(r.y0).toBeGreaterThanOrEqual(0);
    expect(r.x1).toBeLessThanOrEqual(l.W);
    expect(r.y1).toBeLessThanOrEqual(l.H);
    for (let j = r.y0; j < r.y1; j++) {
      for (let i = r.x0; i < r.x1; i++) {
        const cur = owner[j * l.W + i];
        if (cur !== 0 && cur !== id) throw new Error(`komórka (${i},${j}) należy do ${names[cur]} i ${names[id]}`);
        owner[j * l.W + i] = id;
      }
    }
  };
  const allow = (a: string, b: string) => {
    adj.add(`${a}|${b}`);
    adj.add(`${b}|${a}`);
  };
  for (const v of l.vessels) put(v.rect, `V:${v.net}`);
  put(l.basin.rect, 'basin');
  if (l.bus) {
    put(l.bus, 'bus');
    allow('bus', 'basin');
  }
  for (const p of l.pipes) {
    for (const c of p.cavity) put(c, `P:${p.id}`);
    if (p.axis === 'x') {
      allow(`P:${p.id}`, `V:${p.left}`);
      allow(`P:${p.id}`, `V:${p.right}`);
    } else {
      allow(`P:${p.id}`, `V:${p.net}`);
      allow(`P:${p.id}`, 'bus');
    }
  }
  return { owner, names, adj };
}

describe('układ naczyń i rur', () => {
  for (const k of [1, 2, 3]) {
    it(`k=${k}: losowe obwody bez scalania wody i ze ściankami ≥ 2`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const inp = randomInput(seed * 7 + k, k);
        const l = buildLayout(inp);
        const { owner, names, adj } = raster(l); // rzuca wyjątek, gdy dwie jamy dzielą komórkę
        // odstęp ≥ 3 komórek (ścianka ≥ 2) między jamami, które nie mają się łączyć
        for (let j = 0; j < l.H; j++) {
          for (let i = 0; i < l.W; i++) {
            const o = owner[j * l.W + i];
            if (!o) continue;
            for (let dj = -2; dj <= 2; dj++) {
              for (let di = -2; di <= 2; di++) {
                const ii = i + di;
                const jj = j + dj;
                if (ii < 0 || jj < 0 || ii >= l.W || jj >= l.H) continue;
                const p = owner[jj * l.W + ii];
                if (!p || p === o) continue;
                expect(adj.has(`${names[o]}|${names[p]}`), `seed ${seed}: ${names[o]} za blisko ${names[p]} przy (${i},${j})`).toBe(true);
              }
            }
          }
        }
        // strefa oporowa leży w jamie rury
        for (const p of l.pipes) {
          const z = p.zone;
          for (let j = z.y0; j < z.y1; j++) for (let i = z.x0; i < z.x1; i++) expect(owner[j * l.W + i], `strefa ${p.id}`).toBe(names.indexOf(`P:${p.id}`));
        }
        // porty pod nominalnym lustrem: górna krawędź najwyższej rury przy naczyniu leży ≥ 3 + k poniżej lustra
        for (const v of l.vessels) {
          let top = -Infinity;
          for (const p of l.pipes) {
            if (p.axis !== 'x') continue;
            for (const c of p.cavity) if (c.x0 === v.rect.x1 || c.x1 === v.rect.x0) top = Math.max(top, c.y1);
          }
          if (Number.isFinite(top)) expect(v.nomY - top, `port przy ${v.net}`).toBeGreaterThanOrEqual(3 + k);
        }
        expect(l.vessels.every((v) => area(v.rect) > 0)).toBe(true);
      }
    });
  }

  it('wysokości ścianek zależą tylko od okna napięć (stałe w czasie)', () => {
    const inp = randomInput(5, 2);
    expect(JSON.stringify(buildLayout(inp))).toBe(JSON.stringify(buildLayout(inp)));
  });

  it('naczynie o wyższym napięciu wisi wyżej (dno wyżej)', () => {
    const inp: LayoutInput = {
      k: 2,
      order: ['H', 'L'],
      win: new Map([
        ['H', { nom: 9, lo: 9, hi: 9 }],
        ['L', { nom: 3, lo: 3, hi: 3 }],
      ]),
      width: new Map([
        ['H', 12],
        ['L', 12],
      ]),
      slots: [{ id: 'r', netA: 'H', netB: 'L' }],
      shafts: [{ id: 'g', net: 'L' }],
      basinWidth: 28,
    };
    const l = buildLayout(inp);
    const H = l.vessels.find((v) => v.net === 'H')!;
    const L = l.vessels.find((v) => v.net === 'L')!;
    expect(H.floorY).toBeGreaterThan(L.floorY + 8);
    expect(H.nomY - l.basin.nomY).toBe(18); // 9 V · 2 komórki
    expect(L.nomY - l.basin.nomY).toBe(6);
  });
});

describe('kontur jam', () => {
  it('prostokąt: 4 scalone krawędzie; kieszeń powietrza zdejmuje krawędź górną', () => {
    const w = 8;
    const h = 8;
    const m = new Uint8Array(w * h);
    for (let j = 2; j < 5; j++) for (let i = 2; i < 6; i++) m[j * w + i] = 1;
    expect(cavityOutline(m, w, h)).toHaveLength(4);
    for (let j = 5; j < 7; j++) for (let i = 2; i < 6; i++) m[j * w + i] = 2; // powietrze nad naczyniem
    const segs = cavityOutline(m, w, h);
    expect(segs).toHaveLength(3); // lewa, prawa, dolna
    expect(segs.some((s) => s[1] === 5 && s[3] === 5)).toBe(false);
  });
});
