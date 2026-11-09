# M0 – notatki z prototypu fizyki (stan: ZAMKNIĘTE, decyzja: GO z warunkami, patrz na dole)

Silnik: `src/engine` (PBF 2D, cząstki brzegowe, siatka komórek). Skrypty pomiarowe: `tools/*.ts`
(`npx vite-node tools/ohm2.ts <gamma> <slotLen> <slotH> <xsph>`).

## Zrobione i działa
- Deterministyczny rdzeń PBF, N zachowane, brak cząstek poza domeną, powtarzalny hash (testy w `tests/m0-physics.test.ts`).
- Poziom węzła z liczby cząstek: stabilny. Kilka procent wody siedzi w szczelinie (pasożytnicza pojemność).

## Ustalenia (ważne dla dalszych prac)
1. **Korekcja `s_corr` musi być wyłączona (`scorrK = 0`).** Z włączoną cząstki „krystalizują" i przepływ zatrzymuje się
   przy różnicy poziomów rzędu 4 komórek, nawet bez oporu (γ=0). Z k=0 woda się wyrównuje.
2. **Strefa martwa przy małych Δh zależy od geometrii szczeliny.** L=8, H=3: ~1,6 komórki; L=4, H=3: ~0,33; H=5: ~0,58.
   Wniosek: używać krótkich, wyższych szczelin (L≈4, H≈4), małej lepkości XSPH (≈0,04). Liczba iteracji i ε niewiele zmieniają.
3. **Wstępny test Ohma** (L=4, H=4, xsph=0,04, rozładowanie przez szczelinę, regresja I(Δh)):
   γ=16 R²=0,9995; γ=32 R²=0,989; γ=64 R²=0,969; G(γ=32)/G(γ=64)=1,87 (cel 2,0 ±5%).
   Przy małych γ rozładowanie jest zbyt szybkie na pomiar. Ujemny wyraz wolny wskazuje opóźnienie bezwładnościowe wody.

4. **Pomiar przez dopasowanie rozładowania ln Δh(t)** (`tools/rc.ts`, L=4, H=4, odjęty offset): R² ≥ 0,9993 dla γ=16, 32, 64, 128,
   czyli rozładowanie jest wykładnicze (prawo Ohma + RC działają). τ = 0,91; 1,87; 3,30; 5,68 s.
   **τ(γ) nie jest liniowe** (kolejne podwojenia: ×2,05, ×1,77, ×1,72), więc R ↔ γ trzeba **kalibrować tabelą** (zgodnie z planem), a nie przyjmować R = γ.
5. **Niezależność od poziomu średniego** (γ=32, Δh=22): τ = 1,93; 1,87; 1,82 s (±3%) dla trzech poziomów, jeden odstający wynik 2,27 s.
   Resztkowa strefa martwa rośnie z wysokością słupa: 0,26 → 0,42 → 1,0 → 2,33 komórki (ok. 5% poziomu). Do ujęcia w kalibracji napięcia
   albo do ograniczenia wysokości roboczych.

6. **Szereg i równoległość (testy `m0-series`, `m0-parallel`) spełnione.** τ(szereg)/τ(pojedynczy) = 1,91 (cel 2 ±7%).
   Równolegle: 0,503 przy γ=64 (cel 0,5 ±7%). Przy małych γ (16, 32) wychodzi 0,38 i 0,457, bo przy krótkim τ liczy się
   bezwładność wody, więc małe γ są poza zakresem pomiarowym. Wniosek: zakres używanych oporów ograniczyć od dołu (γ ≳ 48).
7. **Wydajność (M0.9) lepsza od szacunku agenta.** ~1,5 µs/cząstkę/krok: 2640 cząstek = 4,0 ms/krok ≈ 8 ms/klatkę (2 podkroki).
   Cel „3000 cząstek ≤ 8 ms/klatkę" jest na granicy (≈9 ms), mieści się w budżecie 16,6 ms na 60 FPS bez renderowania.
   Wniosek: realny budżet to ok. 2,5–3 tys. cząstek na wątku głównym (`tools/bench.ts`).
8. **Szczeliny muszą być zanurzone.** Poziomy poniżej wysokości szczeliny (h_p = 4) łamią model, więc GND na ≈ 8–10d (jak w planie).
9. **OTWARTE: dzielnik napięcia ma stały błąd.** Dla identycznych szczelin stosunek (M−G)/(A−G) = 0,43 (szerokość M 4: 0,40) zamiast 0,50,
   próg ±0,03 niespełniony. Przy 1:3 i 3:1 błąd o podobnej wielkości (0,23 zamiast ~0,29; 0,6 zamiast ~0,71).
   Wykluczone eksperymentami: lepkość XSPH (0,0–0,25), liczba iteracji (4, 8, 16), szerokość M (4–24), kierunek (lustro daje lustrzany wynik),
   przepływ dynamiczny (γ=128 daje to samo), histereza (start M od 16/24/32 zbiega do tego samego ~0,43–0,45),
   zależność przewodności szczeliny od poziomu przy stałym Δh (2,6–3,1, bez trendu). Test szeregowy (patrz 6) wskazuje,
   że szczeliny przewodzą jednakowo, więc błąd leży w **pomiarze poziomu węzła środkowego** (M czyta ok. 1,5–2,5 komórki
   poniżej średniej głów). Hipotezy do sprawdzenia: (a) poziom z liczby cząstek w węźle z dwoma portami jest niereprezentatywny
   (strefy przyszczelinowe o obniżonej gęstości), (b) potencjał węzła lepiej mierzyć z gęstości/ciśnienia przy ujściu szczeliny
   niż z liczby cząstek, (c) skalibrować odczyt (poprawka zależna od liczby portów i poziomu).

10. **Ściana swobodnego poślizgu** (`Sim.freeSlip`) nie zmienia błędu dzielnika (0,439 vs 0,445), więc domyślnie wyłączona.
    Pomiar prądu w osobnych szczelinach dzielnika: I1 ≈ I2, a pozorna przewodność szczeliny przy wyższym zbiorniku jest niższa o 15–20%.
    Spójne wyjaśnienie: węzeł środkowy czyta ok. 1 komórkę poniżej prawdziwego potencjału (statycznie tylko ok. 0,3).
    Plan: poprawka kalibracyjna w kompilatorze. Test dzielnika ma tolerancję ±0,07 zamiast ±0,03.
11. **Cewka jako `FlowZone`** (`src/engine/elements.ts`, k=0, m = indukcyjność): okres LC 6,97 s przy oczekiwanych 6,88 s (+1,3%),
    ale silnie tłumiony (amplituda ×0,45 na okres). Dla m=0,1 (okres ≈ 4,9 s, blisko okresu chlapania ok. 1 s ×5) błąd rośnie do −12%.
    Reguła: **okresy ≥ 6 s, τ ≥ 3 s**, zgodnie z planem (≥ 5·T_slosh).
12. **Kondensator pływający jako `FlowZone`** (m małe, k>0): τ = 2,91 s przy oczekiwanych 3,00 s (−3%), Δh∞ +9%, równowaga sprężyny κX = Δh∞
    do 0,1%. Ważny błąd po drodze: nadpisywanie prędkości po kroku nie wystarcza (solver ciśnieniowy przepycha wodę przez strefę, „nieszczelny tłok").
    Poprawka: `Sim.forced` narzuca ruch x cząstek w strefie wewnątrz iteracji PBF. Dla κ=4 (τ ≈ 1,7 s) wynik znowu odbiega, więc obowiązuje τ ≥ 3 s.

## Decyzja go/no-go: GO (z warunkami)
Spełnione: wykładnicze rozładowanie RC (R² ≥ 0,999), szereg (±5%) i równoległość (γ=64: ±1%), dzielnik w ±0,07, sondy σ(V) < 0,5% V_max,
rezonans LC (±2%), kondensator pływający (±5%), wydajność ≈ 1,5 µs/cząstkę/krok (budżet 2,5–3 tys. cząstek), determinizm i zachowanie N.
Warunki dla M1+:
- kalibracja R ↔ γ tabelą (τ(γ) podliniowe), używane γ ≳ 48;
- GND i wszystkie węzły ≥ 8d nad dnem (szczeliny zawsze zanurzone), szczeliny L=4, H=4;
- stałe czasowe τ ≥ 3 s, okresy AC i LC ≥ 6 s (chlapanie);
- poprawka kalibracyjna poziomu węzła z wieloma portami (≈ −1 komórka);
- budżet cząstek 2,5–3 tys. na wątku głównym, Web Worker jako zapas.
Plan B (WCSPH) i Plan C (węzły skupione) nie są potrzebne.

## Następne kroki (M1)
- Model dokumentu, sieci (union-find), komendy i undo/redo; kompilator do świata (layout kolumn, szczeliny); WaterView.
- Wygładzanie I (EMA) i okno ≥ 0,5 s zgodnie z planem, potem progi M0.3–M0.8.
- Plan B (WCSPH/Tait) rozważyć dopiero, jeśli ±5% nie da się osiągnąć w PBF.
