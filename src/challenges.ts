import type { WorldView } from './sim/view';
import { make } from './examples';
import type { Doc } from './model/doc';
import { computeNets } from './model/nets';
import type { DocData } from './model/types';

export interface Ctx {
  world: WorldView;
  doc: Doc;
  /** czas symulacji od początku zadania [s] */
  time: number;
}

export interface Challenge {
  id: string;
  title: string;
  text: string;
  hint: string;
  /** obwód początkowy (elementy mogą być nieposłączone) */
  start: DocData;
  /** ile sekund warunek musi być spełniony nieprzerwanie */
  hold: number;
  /** czy warunek jest teraz spełniony; mem to pamięć zadania (np. liczniki) */
  goal(ctx: Ctx, mem: Record<string, number>): boolean;
}

const firstOf = (doc: Doc, type: string) => [...doc.components.values()].find((c) => c.type === type);

export const CHALLENGES: Challenge[] = [
  {
    id: 'light',
    title: '1. Zaświeć żarówkę',
    text: 'Połącz przewodami zasilacz, żarówkę i masę tak, żeby przez żarówkę popłynęła woda (prąd powyżej 120 mA).',
    hint: 'Plus zasilacza do żarówki, drugi koniec żarówki do masy, a minus zasilacza też do masy. Kliknij port, potem drugi port.',
    start: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'bulb', x: 14, y: 6, value: 22 },
        { type: 'ground', x: 18, y: 10 },
      ],
      [],
    ),
    hold: 3,
    goal: ({ world, doc }) => {
      const b = firstOf(doc, 'bulb');
      return !!b && world.current(b.id) > 0.12;
    },
  },
  {
    id: 'half',
    title: '2. Podziel napięcie na pół',
    text: 'Zbuduj dzielnik: dwa rezystory w szeregu między plusem a masą. Napięcie w środku ma wynosić od 4 do 5 V (połowa z 9 V).',
    hint: 'Rezystor 1 od plusa do węzła środkowego, rezystor 2 od węzła do masy. Jednakowe wartości dają połowę. Dołóż woltomierz do węzła.',
    start: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'resistor', x: 12, y: 6, value: 47 },
        { type: 'resistor', x: 16, y: 6, rot: 90, value: 100 },
        { type: 'ground', x: 16, y: 12 },
        { type: 'voltmeter', x: 20, y: 6 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[3, 1], [4, 0]],
        [[5, 0], [2, 1]],
      ],
    ),
    hold: 4,
    goal: ({ world, doc }) => {
      const nl = computeNets(doc);
      const plus = firstOf(doc, 'supply');
      if (!plus) return false;
      const plusNet = nl.netOf.get(`${plus.id}:1`);
      return [...world.tanks.keys()].some((n) => n !== world.gnd.net && n !== plusNet && world.voltage(n) > 4 && world.voltage(n) < 5);
    },
  },
  {
    id: 'fuse',
    title: '3. Uratuj bezpiecznik',
    text: 'Bezpiecznik 0,1 A pęka, bo żarówka pobiera za dużo. Spraw, żeby żarówka świeciła (powyżej 80 mA), a bezpiecznik wytrzymał 8 s.',
    hint: 'Zwiększ opór żarówki suwakiem, zmniejsz napięcie zasilacza albo wybierz mocniejszy bezpiecznik. Zmiana bezpiecznika wymienia go na nowy.',
    start: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'fuse', x: 12, y: 6, value: 0.1 },
        { type: 'bulb', x: 20, y: 6, value: 22 },
        { type: 'ground', x: 24, y: 10 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[3, 1], [4, 0]],
      ],
    ),
    hold: 8,
    goal: ({ world, doc }) => {
      const b = firstOf(doc, 'bulb');
      const f = firstOf(doc, 'fuse');
      return !!b && !!f && world.current(b.id) > 0.08 && !world.blown.has(f.id);
    },
  },
  {
    id: 'cap',
    title: '4. Napełnij zbiornik (kondensator)',
    text: 'Kondensator to zbiornik, który ładuje się powoli przez rezystor. Doprowadź napięcie na nim do 8 V (przyspiesz symulację albo zmniejsz rezystor).',
    hint: 'Im mniejszy rezystor, tym szybciej woda napływa. Prędkość ×8 w górnym pasku też pomaga.',
    start: make(
      [
        { type: 'supply', x: 4, y: 6 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'resistor', x: 12, y: 6, value: 120 },
        { type: 'capacitor', x: 16, y: 6, rot: 90, value: 10 },
        { type: 'ground', x: 16, y: 12 },
        { type: 'voltmeter', x: 20, y: 6 },
      ],
      [
        [[0, 0], [1, 0]],
        [[0, 1], [2, 0]],
        [[2, 1], [3, 0]],
        [[3, 1], [4, 0]],
        [[5, 0], [2, 1]],
      ],
    ),
    hold: 1,
    goal: ({ world }) => [...world.tanks.keys()].some((n) => n !== world.gnd.net && n !== 'c1:1' && world.voltage(n) >= 8),
  },
  {
    id: 'valve',
    title: '5. Zawór zwrotny w prądzie zmiennym',
    text: 'Źródło AC pcha wodę raz w jedną, raz w drugą stronę. Połącz je z rezystorem i diodą LED tak, żeby LED świeciła, ale prąd nigdy nie płynął wstecz (przez 12 s).',
    hint: 'Anoda (A) diody musi być od strony źródła, katoda (K) w stronę masy. Rezystor chroni LED.',
    start: make(
      [
        { type: 'ac', x: 4, y: 6, value: 5 },
        { type: 'ground', x: 4, y: 10 },
        { type: 'resistor', x: 14, y: 6, value: 47 },
        { type: 'led', x: 22, y: 6 },
        { type: 'ground', x: 26, y: 10 },
      ],
      [],
    ),
    hold: 0,
    goal: ({ world, doc, time }, mem) => {
      const l = firstOf(doc, 'led');
      if (!l) return false;
      const i = world.current(l.id);
      mem.maxI = Math.max(mem.maxI ?? 0, i);
      mem.minI = Math.min(mem.minI ?? 0, i);
      mem.t0 = mem.t0 ?? time;
      return time - mem.t0 > 12 && mem.maxI > 0.05 && mem.minI > -0.02;
    },
  },
];
