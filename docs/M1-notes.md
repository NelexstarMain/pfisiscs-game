# M1 – notatki (kompilator obwodu do świata cząstek)

## Zrobione
- `src/model`: dokument (komponenty, przewody), sieci z union-find o stabilnych ID, komendy z undo/redo, JSON, zdarzenia dla widoków.
- `src/compile/world.ts`: kompilator `Doc -> World`. Zbiorniki-kolumny dla sieci, szczeliny w ścianach między sąsiednimi kolumnami,
  szyby do kolektora GND pod całym układem (zbiornik GND jest ostatnią kolumną), serwo zasilacza DC, pomiary napięcia (z liczby cząstek,
  EMA 0,1 s) i prądu (średnia prędkość w strefie, EMA 0,25 s), przełącznik (zmiana γ w locie), kondensator do masy (szerszy zbiornik).
- Elementy w M1: bateria, zasilacz DC, masa, rezystor, żarówka, przełącznik, kondensator do masy, woltomierz.
- Testy: Ohm dla R = 22, 47, 100, 220 Ω (±12–18%), dzielnik 47/47 (±0,08), przełącznik rozwarty/zwarty.

## Ograniczenia widoku wody (M1)
- Obsługiwane są układy, w których elementy między węzłami nie-GND tworzą łańcuchy (ścieżki). Rozgałęzienia wymagają tuneli pod podłogą (później).
  Kompilator zgłasza wtedy `CompileError` z komunikatem po polsku, a widok schematu dalej działa.
- Co najwyżej dwa elementy równolegle między tymi samymi sąsiednimi węzłami.
- Minus źródła musi być na masie. Kondensator tylko do masy (pływający wymaga `FlowZone`, M3).
- Zasilacz DC utrzymuje napięcie serwem, bateria (zbiornik) się rozładowuje.

## Kalibracja (patrz `src/compile/calibration.ts`)
1 V = 1 komórka wysokości, 1 A = 50 cząstek/s, GND na poziomie 12. Szyb pionowy ma współczynnik 0,87 względem szczeliny poziomej.
