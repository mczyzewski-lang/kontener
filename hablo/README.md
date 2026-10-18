# Hablo — prywatny nauczyciel hiszpańskiego

Aplikacja webowa (PWA) dla jednej osoby: codzienny, adaptacyjny program nauki hiszpańskiego z Hiszpanii,
nastawiony na **prawdziwą komunikację**, nie testy.

- **Słownictwo** — najczęstsze słowa z korpusu mowy potocznej (OpenSubtitles), 3 osobne kompetencje: słuch, przypominanie, mówienie.
- **Pamięć (FSRS)** — osobny harmonogram dla każdej kompetencji, uczciwe liczenie powtórek (podpowiedź ≠ opanowanie).
- **Historie** — słuchanie, czytanie z tłumaczeniem po dotknięciu, pytania, opowiadanie bez tekstu, własna historia; historie wracają w nowych wersjach.
- **Gramatyka** — 11 etapów, krótkie wyjaśnienia, ćwiczenia głosowe, mini‑rozmowy; etapy otwierają się dopiero po przećwiczeniu.
- **Rozmowy głosowe (ElevenLabs)** — nauczycielka i postacie w 13 sytuacjach z życia, 3 tryby, raport po rozmowie.
- **Inteligentny plan dnia** — jedna kolejka zadań, budowana raz dziennie z prawdziwych postępów; test tygodniowy; sprint osobisty.

North Star: **minuty samodzielnej, zrozumiałej rozmowy po hiszpańsku** (widoczne w Postępach).

## Szybki start

```bash
cd hablo
npm install
cp .env.example .env.local     # uzupełnij klucze — instrukcja: docs/SETUP.md
npm run dev
```

Podgląd bez żadnych kluczy (wyraźnie oznaczony tryb demonstracyjny, dane w pliku lokalnym, bez logowania):

```bash
HABLO_DEMO_MODE=1 npm run dev
```

W trybie demo nie ma rozmów głosowych ani AI — aplikacja mówi to wprost i nigdy nie udaje integracji.

## Polecenia

| Polecenie | Co robi |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run check` | typecheck + lint + walidacja treści + testy jednostkowe |
| `npm test` | testy jednostkowe (Vitest) |
| `npm run test:e2e` | testy end‑to‑end (Playwright, tryb demo + testowe AI) |
| `npm run db:seed` | wgrywa treści (słowa, gramatyka, scenariusze) do Supabase |
| `npm run elevenlabs:agent` | tworzy/aktualizuje prywatnego agenta ElevenLabs przez API |
| `npm run content:build` | przelicza ranking słownictwa z korpusu i źródeł w `content/vocabulary/source` |
| `npm run content:validate` | walidacja struktury i powiązań treści |

## Dokumentacja

- [docs/SETUP.md](docs/SETUP.md) — Supabase, logowanie, ElevenLabs, Claude, Vercel, iPhone
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architektura, model danych, design system, ścieżki, integracja głosowa, logika nauki
- [docs/THOUGHTS.md](docs/THOUGHTS.md) — „Moje myśli”: prywatna biblioteka myśli, format importu, wybór myśli na ekran główny
- [docs/STATUS.md](docs/STATUS.md) — stan implementacji, ograniczenia i kolejne kroki
- [content/README.md](content/README.md) — źródła treści, licencje i jak rozszerzać bibliotekę słów
