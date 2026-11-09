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

## UI (M1)
Edytor schematu (paleta, przeciąganie, przewody, obrót, undo/redo, dwuklik na przełączniku), widok wody z polem potencjału,
panel właściwości, przykłady (rezystor, dzielnik, żarówka z przełącznikiem, RC), zapis/odczyt JSON. Uruchomienie: `npm run dev`.
Gra ma uczyć intuicji, nie dokładności: kalibracja jest na poziomie ok. ±6%, więcej nie trzeba.

## Styl wizualny (bajkowy)
Widok wody: niebo ze słońcem i chmurami, drewniane koryta i tamy (rosną z poziomem wody), wyspa unosząca się na niebie z podziemnym
kolektorem, woda z falą, tabliczki z opisami. Spadek napięcia na elemencie to **wodospad** przez tamę, tym szerszy, im większy prąd,
z podpisem „−x V". Zamknięta tama (otwarty przełącznik, przepalony bezpiecznik) stoi sucha. Wysokość w niebie = napięcie (linijka po lewej).

## Zawory (M3, część)
Dioda, LED (próg napięcia, jasność od mocy) i bezpiecznik (pęka po ~0,6 s przekroczenia prądu): `World.valves` zmienia γ strefy w locie.

## Źródło AC i oscyloskop
Źródło AC to serwo, którego poziom docelowy faluje sinusoidalnie (okres 10 s, amplituda ≤ 6 V, żeby szczeliny zostały zanurzone).
Oscyloskop (`src/ui/scope.ts`) rysuje napięcia węzłów z woltomierzami (albo wszystkich węzłów) z ostatnich 30 s.
Przykłady: dwie żarówki równolegle (dwa szyby do masy), prąd zmienny.

## Cewka i kondensator pływający (w grze)
Oba to `FlowZone` (src/engine/elements.ts): strefa z narzuconą prędkością, której przepływ I rządzi `m·dI/dt = Δh − k·X − c·I`.
Cewka (k=0, masa ∝ indukcyjność) i kondensator między dwoma węzłami (małe m, sprężyna k, tłumienie c=2) działają na szczelinach
(sąsiednie węzły) i szybach (do masy, oś pionowa). Kondensator do masy nadal jest po prostu szerszym zbiornikiem.
Ograniczenie fizyczne: okresy ≥ 6 s i stałe czasowe ≥ 3 s, bo woda chlapie (patrz M0).

## Kalibracja (patrz `src/compile/calibration.ts`)
Mierzone prawdziwym przepływem netto serwa (`tools/gsweep.ts`, `tools/truth.ts`): szyb G·γ ≈ 77, szczelina G·γ ≈ 88,
estymator prądu w strefie zaniża o 8% (korekta ZONE_FLOW_BIAS). Zakres rezystorów 15…330 Ω (poniżej opór wlotu/wylotu zaburza wynik, zwłaszcza przy niskim napięciu).
1 V = 1 komórka wysokości, 1 A = 50 cząstek/s, GND na poziomie 12. Szyb pionowy ma współczynnik 0,87 względem szczeliny poziomej.
