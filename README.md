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
```

## Co jest w środku
- Dwa widoki tego samego obwodu: schemat (edytowalny) i świat wody. Oscyloskop pod spodem.
- Elementy: bateria, zasilacz DC, źródło AC, masa, rezystor, żarówka, przełącznik, dioda, LED, bezpiecznik, kondensator (do masy), woltomierz.
- Suwaki w panelu właściwości zmieniają opór, napięcie i bezpiecznik na żywo, bez restartu wody.
- Przykłady w menu „Przykłady…": rezystor, dzielnik napięcia, żarówka z przełącznikiem, RC, LED, bezpiecznik, obwód równoległy, prąd zmienny.
- Szczegóły techniczne i pomiary: `docs/M0-notes.md` (silnik), `docs/M1-notes.md` (kompilator i interfejs).

## Ograniczenia
Widok wody obsługuje łańcuchy węzłów (bez rozgałęzień poza połączeniami do masy). Schemat działa zawsze.
