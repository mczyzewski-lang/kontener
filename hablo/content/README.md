# Treści edukacyjne

Treści są danymi, oddzielonymi od kodu. Walidacja: `npm run content:validate` (schematy w `src/lib/content/schemas.ts`).

| Ścieżka | Zawartość |
|---|---|
| `vocabulary/source/*.txt` | Autorskie wpisy: lemat, część mowy, polskie znaczenia, przykłady (es=pl), kolokacje, formy, tematy, gramatyka, uwagi (np. różnice Hiszpania / Ameryka Łacińska). Format opisany w nagłówku plików. |
| `vocabulary/vocabulary.json` | Wynik `npm run content:build` — wpisy z rankingiem częstotliwości i poziomem (1–5 co 1000 słów). Nie edytować ręcznie. |
| `corpus/opensubtitles2018_es_50k.txt` | Lista częstości form wyrazowych. |
| `grammar/topics.json` | 11 etapów gramatyki: wyjaśnienia, przykłady, ćwiczenia, mini‑rozmowy, wskazówki dla agenta. |
| `scenarios/scenarios.json` | 13 scenariuszy rozmów: postać, persona, pierwsza wypowiedź, cele, kluczowe zwroty. |
| `stories/seed-stories.json` | Historie startowe z wariantami (przeszłość, inna perspektywa). |

## Źródła i licencje

- **Częstotliwość:** [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave), lista hiszpańska z korpusu
  OpenSubtitles 2018 — napisy filmowe przybliżają język mówiony. Treść list: CC‑BY‑SA 4.0; kod: MIT.
  Korpus zawiera też napisy z Ameryki Łacińskiej, dlatego wpisy mają uwagi o wariantach (coche/carro, móvil/celular, coger).
- **Lematyzacja przy budowie rankingu:** [lemmatization-lists](https://github.com/michmech/lemmatization-lists) (Michal Měchura), ODbL.
  Pobierana do `.cache/` tylko podczas `content:build`, nie jest częścią aplikacji.
- **Tłumaczenia, przykłady, kolokacje, gramatyka, scenariusze i historie** — opracowane dla Hablo (hiszpański z Hiszpanii).

## Jak liczony jest ranking

Dla każdego lematu sumowane są częstości jego form (formy niejednoznaczne dzielone równo; wpis może wykluczyć mylącą formę
tokenem `-forma`, np. `comer` wyklucza `como`). Ranking to pozycja lematu wśród wszystkich lematów korpusu, a nie numer na
liście kuratorskiej. Poziom = ⌈ranking/1000⌉.

## Dodawanie słów

1. Dopisz linie do `vocabulary/source/0X-*.txt` (najlepiej kolejnymi pasmami z rankingu korpusu).
2. `npm run content:build && npm run content:validate`
3. `npm run db:seed` (upsert — nie rusza postępów).
