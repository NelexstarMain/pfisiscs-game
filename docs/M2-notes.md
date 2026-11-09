# Etap 2: wiszące naczynia, tylko kulki, do ok. 4000 cząstek

## Co się zmieniło
- **Świat**: węzły to osobne otwarte naczynia zawieszone na wysokościach zależnych od napięcia (zasilacz najwyżej, masa najniżej),
  połączone rurami od dołu do dołu, pod wodą (naczynia połączone, więc Ohm i dzielnik działają). Basen masy jest na dole,
  elementy do masy to pionowe rury w dół do wspólnej magistrali, która wchodzi do basenu pod lustrem. Ścianki mają stałą wysokość.
  Kod: `src/compile/layout.ts` (czysta geometria), `src/compile/world.ts` (budowa i pomiary), `src/compile/outline.ts` (kontury).
- **Solver DC (`src/compile/dc.ts`)** służy WYŁĄCZNIE do rozmieszczenia naczyń (nominalne napięcie, napięcie w chwili włączenia
  i zakres w scenariuszach przełączników, diod, bezpieczników i AC). Napięcia i prądy w grze nadal wynikają z cząstek.
  Stan początkowy to chwila włączenia: kondensator rozładowany, cewka bez prądu.
- **Rysowanie**: tylko kulki i cienkie białe kontury na ciemnym tle z siatką, zero efektów wody (`src/ui/water-view.ts`).
- **Gęstość kulek**: skala `k` = komórek na wolt (1 mało, 2 średnio, 3 dużo, 4 bardzo dużo, domyślnie 4 na komputerze, 2 na wąskim ekranie).
  Opór R nie zależy od k (sprawdzone dla k=2,3,4: prąd 1,02–1,05 × V/R). Przykład z żarówką ma ok. 3400 kulek przy k=4.
- **Silnik (E1)**: pary cząstek liczone raz, jednorazowy opór i strefa na cząstkę, krok 1,75× szybszy (1,8 → ok. 1,0 µs na cząstkę na krok).
- **Web Worker (E5)**: cały `World` w workerze (`src/sim/*`), wyniki jako ramki (pozycje w `Float32Array`), tempo w nagłówku.
  Bez workera (np. gdyby go brakowało) świat działa w głównym wątku w ramach budżetu klatki. Worker jest wbudowany w plik JS
  (`?worker&inline`), więc `tools/single-file.mjs` nadal składa grę w jeden plik HTML.

## Kalibracja po zmianie geometrii
- Rura pionowa do masy przewodzi ok. 1,15 razy lepiej niż szczelina z tabeli (`SHAFT_G_FACTOR = 1.15`).
- Wzmocnienie serwa zasilacza 4 → 8, żeby napięcie trzymało się przy dużym prądzie (22 Ω: 8,6 → 8,9 V).
- Masa cewki 0,25 → 1,5 (stała czasowa RL ≈ 1,6 s przy 47 Ω, wcześniej ok. 0,26 s, czyli bezwładności nie było widać).
- Dzielnik 1:1 daje teraz stosunek ok. 0,49–0,50 (w poprzednim układzie 0,43).

## Ściana swobodnego poślizgu (`Sim.freeSlip`, domyślnie włączona)
W głębokich wąskich rurach woda zakleszczała się o ścianki jak w efekcie Janssena (tarcie statyczne podtrzymuje część ciężaru słupa).
Od cząstek brzegowych bierzemy tylko składową wzdłuż normalnej. Skutek uboczny: bez tarcia woda dłużej chlapie.

## Znane ograniczenia
- **Prąd zmienny: asymetria.** Gdy węzeł leży poniżej masy (woda płynie w górę wąską rurą), przepływ ma próg ok. 2 V i ok. 60% przewodności
  przepływu w dół (dla AC ±4 V: prąd ok. +90 mA i ok. −30 mA zamiast ±85 mA). Napięcie faluje poprawnie. Sprawdzone: więcej iteracji i wyłączenie
  tłumienia w strefie nie pomagają, pomaga częściowo ściana swobodnego poślizgu. Przyczyna to tarcie i ściśliwość PBF w głębokich wąskich rurach.
  Pomysły na później: płytszy basen i magistrala, szersze rury, korekta pomiaru napięcia.
- Tempo przy k=4 to ok. 0,6–1,0× czasu rzeczywistego (krok 3–4 ms przy 2500–3400 kulek, zależnie od przykładu i komputera).
- Węzeł wychodzący poza okno naczynia po zmianie suwakiem wymusza przebudowę świata (restart wody).
- Widok wody nadal obsługuje łańcuchy węzłów (bez rozgałęzień poza połączeniami do masy), co najwyżej dwa elementy równolegle.
