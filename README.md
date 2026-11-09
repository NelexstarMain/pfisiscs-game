# Elektrownia wodna

Gra, w której elektryka i elektronika to woda w bajkowym świecie: napięcie to wysokość na niebie, prąd to płynąca woda,
a spadek napięcia na elemencie to wodospad. Wszystko wynika z silnika cząstek (bez solvera obwodów).
Gra ma uczyć intuicji, nie dokładności (pomiary zgadzają się z teorią w granicach kilkunastu procent).

## Uruchomienie

```bash
npm install
npm run dev      # gra w przeglądarce
npm test         # testy fizyki i kompilatora
npm run build    # wersja produkcyjna w dist/
node tools/single-file.mjs gra.html   # po buildzie: cała gra w jednym pliku HTML
```

## Co jest w środku
- Dwa widoki tego samego obwodu: schemat (edytowalny) i świat wody (tylko kulki i cienkie kontury, naczynia wiszą na wysokości napięcia). Oscyloskop pod spodem.
- Gęstość kulek do wyboru (do ok. 4000), symulacja działa w Web Workerze.
- Elementy: bateria, zasilacz DC, źródło AC, masa, rezystor, żarówka, przełącznik, dioda, LED, bezpiecznik, kondensator (do masy albo pływający), cewka, woltomierz.
- Suwaki w panelu właściwości zmieniają opór, napięcie i bezpiecznik na żywo, bez restartu wody.
- Pięć zadań w menu „Zadania…” (żarówka, dzielnik, bezpiecznik, kondensator, dioda w prądzie zmiennym) z podpowiedziami i zapamiętanym postępem.
- Przykłady w menu „Przykłady…": rezystor, dzielnik napięcia, żarówka z przełącznikiem, RC, LED, bezpiecznik, obwód równoległy, prąd zmienny, cewka (RL), kondensator blokujący stały prąd i przepuszczający zmienny.
- Szczegóły techniczne i pomiary: `docs/M0-notes.md` (silnik), `docs/M1-notes.md` (kompilator i interfejs), `docs/M2-notes.md` (wiszące naczynia, gęstość kulek, worker).

## Ograniczenia
Widok wody obsługuje łańcuchy węzłów (bez rozgałęzień poza połączeniami do masy). Schemat działa zawsze.
