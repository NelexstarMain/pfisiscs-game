# M0 – notatki z prototypu fizyki (stan: w toku, bramka go/no-go jeszcze nie przeszła)

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

## Następne kroki
- Pomiar w stanie ustalonym (stały Δh utrzymywany przez dolewanie), zamiast przejściowego rozładowania.
- Wygładzanie I (EMA) i okno ≥ 0,5 s zgodnie z planem, potem progi M0.3–M0.8.
- Benchmark wydajności (3000 cząstek) i spiki: strefa wymuszona (cewka), `Piston1D`.
- Plan B (WCSPH/Tait) rozważyć dopiero, jeśli ±5% nie da się osiągnąć w PBF.
