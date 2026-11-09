/** Definicje elementów (nazwy po polsku). Realizacja fizyczna jest w src/compile. */
export type ComponentType =
  | 'battery'
  | 'supply'
  | 'ground'
  | 'resistor'
  | 'bulb'
  | 'switch'
  | 'capacitor'
  | 'voltmeter';

export interface ComponentDef {
  type: ComponentType;
  label: string;
  /** liczba portów (0 = pierwszy, itd.) */
  ports: number;
  /** nazwy portów do wyświetlania */
  portNames: string[];
  defaultValue: number;
  unit: string;
  /** opis analogii wodnej (do podpowiedzi w grze) */
  water: string;
}

export const DEFS: Record<ComponentType, ComponentDef> = {
  battery: {
    type: 'battery',
    label: 'Bateria',
    ports: 2,
    portNames: ['−', '+'],
    defaultValue: 9,
    unit: 'V',
    water: 'Wysoki zbiornik z wodą. Napięcie to wysokość lustra, zbiornik się opróżnia.',
  },
  supply: {
    type: 'supply',
    label: 'Zasilacz DC',
    ports: 2,
    portNames: ['−', '+'],
    defaultValue: 9,
    unit: 'V',
    water: 'Pompa z regulatorem: utrzymuje stały poziom wody w zbiorniku, więc napięcie się nie zmienia.',
  },
  ground: {
    type: 'ground',
    label: 'Masa (GND)',
    ports: 1,
    portNames: ['GND'],
    defaultValue: 0,
    unit: '',
    water: 'Poziom odniesienia: szeroka niecka, do której spływa woda.',
  },
  resistor: {
    type: 'resistor',
    label: 'Rezystor',
    ports: 2,
    portNames: ['A', 'B'],
    defaultValue: 47,
    unit: 'Ω',
    water: 'Wąski kanał wypełniony żwirem: im węższy, tym trudniej wodzie przepłynąć.',
  },
  bulb: {
    type: 'bulb',
    label: 'Żarówka',
    ports: 2,
    portNames: ['A', 'B'],
    defaultValue: 22,
    unit: 'Ω',
    water: 'Opór, który świeci tym mocniej, im więcej mocy (napięcie × przepływ) w nim wydzielasz.',
  },
  switch: {
    type: 'switch',
    label: 'Przełącznik',
    ports: 2,
    portNames: ['A', 'B'],
    defaultValue: 1, // 1 = zwarty, 0 = rozwarty
    unit: '',
    water: 'Zastawka: otwarta przepuszcza wodę, zamknięta blokuje przepływ.',
  },
  capacitor: {
    type: 'capacitor',
    label: 'Kondensator',
    ports: 2,
    portNames: ['A', 'B'],
    defaultValue: 10,
    unit: 'µF',
    water: 'Zbiornik: ładuje się wodą, im szerszy, tym większa pojemność.',
  },
  voltmeter: {
    type: 'voltmeter',
    label: 'Woltomierz',
    ports: 1,
    portNames: ['+'],
    defaultValue: 0,
    unit: 'V',
    water: 'Rurka piezometryczna: pokazuje poziom wody w węźle względem masy.',
  },
};

export const ALL_TYPES = Object.keys(DEFS) as ComponentType[];
