# M0 – notatki z prototypu fizyki (stan: w toku, część progów spełniona, bramka go/no-go jeszcze nie przeszła)

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

## Następne kroki
- Pomiar w stanie ustalonym (stały Δh utrzymywany przez dolewanie), zamiast przejściowego rozładowania.
- Wygładzanie I (EMA) i okno ≥ 0,5 s zgodnie z planem, potem progi M0.3–M0.8.
- Benchmark wydajności (3000 cząstek) i spiki: strefa wymuszona (cewka), `Piston1D`.
- Plan B (WCSPH/Tait) rozważyć dopiero, jeśli ±5% nie da się osiągnąć w PBF.
