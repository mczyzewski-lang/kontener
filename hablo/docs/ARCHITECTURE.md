# Architektura Hablo

## 1. System

```
 iPhone / komputer (PWA, Next.js App Router, React 19)
   │  strony serwerowe + komponenty klienckie (fiszki, historie, rozmowa)
   ▼
 Next.js (Node) ── proxy.ts: odświeża sesję Supabase, przekierowuje do /login
   │  lib/session.ts: KAŻDA strona i endpoint sprawdza sesję + HABLO_ALLOWED_EMAIL
   │
   ├── lib/learning/*      silniki nauki (czysty TypeScript, testowalny)
   ├── lib/services/*      przypadki użycia (review, stories, grammar, conversation, onboarding, stats…)
   ├── lib/db/*            Db: wspólny interfejs → SupabaseDb (RLS) | LocalDb (demo/testy)
   ├── lib/ai/*            Claude: structured outputs + walidacja Zod; mock tylko dla testów
   ├── lib/elevenlabs/*    tokeny rozmów, TTS, STT (Scribe), transkrypcje, weryfikacja webhooków
   └── lib/usage.ts        szacowanie kosztów, limity dzienne/miesięczne
   │
   ├──► Supabase Postgres (RLS) + Auth (magic link / Google) + Storage (cache TTS, nagrania)
   ├──► Anthropic API (historie, ocena odpowiedzi, analiza rozmów, sprinty, tłumaczenia)
   └──► ElevenLabs (prywatny agent: WebRTC; TTS; STT; webhook po rozmowie)
```

Decyzje:
- **Jeden użytkownik, bez SaaS.** Brak organizacji, ról, płatności. Dostęp = jeden adres e-mail.
- **Treści jako dane** (`/content`), walidowane schematami i seedowane do bazy (prawdziwe klucze obce postępów).
- **Silniki jako czyste moduły** nad interfejsem `Db` — te same reguły działają z Supabase i w testach.
- **Wszystkie klucze tylko na serwerze.** Przeglądarka dostaje token rozmowy i audio z naszych endpointów.
- **Uczciwy tryb demo**: bez Supabase aplikacja nie startuje (ekran `/setup`), chyba że jawnie `HABLO_DEMO_MODE=1`;
  brak AI/ElevenLabs jest komunikowany, a oceny bez AI oznaczone jako przybliżone.

## 2. Sześć silników na wspólnym modelu ucznia

| Silnik | Pliki | Zapisuje do |
|---|---|---|
| Vocabulary | `learning/vocabulary.ts`, `learning/exercises.ts`, `services/review.ts` | `vocabulary_entries`, `vocabulary_examples` |
| Memory (FSRS) | `learning/memory.ts` | `vocabulary_progress`, `vocabulary_review_logs` |
| Story | `learning/story.ts`, `services/stories.ts` | `stories`, `story_vocabulary`, `story_attempts` |
| Grammar | `learning/grammar.ts`, `services/grammar.ts` | `grammar_progress` |
| Speaking | `services/conversation.ts`, `learning/conversation.ts`, `learning/tutor-context.ts` | `conversation_*` |
| Learning Intelligence | `learning/planner.ts`, `learning/plan-service.ts`, `learning/intelligence.ts`, `services/stats.ts` | `daily_plans`, `daily_plan_items`, `learning_tasks`, `learner_memory`, `weekly_assessments` |

Powiązania (przykłady z wymagań):
- Słowo zapomniane w rozmowie → `recordMissingWord` (lapse karty recall lub nowa karta z priorytetem) + zadanie `review_words` → pierwsza pozycja w jutrzejszych powtórkach. Słowa spoza biblioteki trafiają do niej jako słowa własne.
- Konstrukcja użyta poprawnie w rozmowie → `applyGrammarResult(source: conversation)` podnosi opanowanie; błędy → zadanie `grammar` wygrywające slot gramatyki w planie.
- Słowo kliknięte w historii → karta wcześniej (bez kary w FSRS). Słowa pominięte przy opowiadaniu → `review_words`.
- Ciekawostki o uczniu i powtarzające się błędy → `learner_memory` → zmienne dynamiczne agenta przy następnej rozmowie.

## 3. Model danych

Migracja: `supabase/migrations/20261018000000_init.sql`. Najważniejsze tabele:

- `profiles`, `learning_preferences` — konto, preferencje, limity kosztów, retencja.
- `vocabulary_entries` (słowa **i** zwroty: `kind`; `owner_id` = słowa własne) + widok `phrases`; `vocabulary_examples`.
- `vocabulary_progress` — **jedna karta FSRS na (użytkownik, słowo, kompetencja)**: `listening | recall | speaking`; liczniki poprawnych/błędnych/z podpowiedzią, `spontaneous_uses`, `known_claimed`, `priority_boost`.
- `vocabulary_review_logs` — każda próba z flagą `scheduled` (czy wpłynęła na harmonogram) i `assisted`. Pozwala przeliczyć statystyki od zera.
- `word_associations` — pałac pamięci (sceny AI i własne).
- `grammar_topics` (treść w JSONB), `grammar_progress` (status, mastery 0–1, użycia/błędy w rozmowach).
- `stories` (ciało historii w JSONB, wariant, `parent_story_id`, `next_retell_at`), `story_vocabulary`, `story_attempts`.
- `conversation_scenarios`, `conversation_sessions` (tryb, kanał, id rozmowy ElevenLabs, liczniki pomocy), `conversation_turns` (z `assisted`), `conversation_feedback` (źródło analizy: ai/basic/test — można ponowić analizę z zapisanej transkrypcji).
- `learning_tasks` (zaległe zadania z analiz) → `daily_plans` (unikalny dzień) → `daily_plan_items`.
- `sprints`, `weekly_assessments`, `learner_memory`, `learning_events` (aktywność, minuty), `api_usage_logs`.

Integralność: klucze złożone i unikalne (brak duplikatów kart, planów, feedbacku), kaskady przy usuwaniu, RLS `user_id = auth.uid()` na każdej tabeli użytkownika, treści tylko do odczytu.

## 4. Logika nauki

### Pamięć (FSRS, `ts-fsrs`)
- Retencja docelowa 0.9, maks. interwał 365 dni, kroki krótkoterminowe; ocena z wyniku: błąd → Again, z podpowiedzią/drobny błąd/wolno → Hard, szybko i pewnie (karta w Review) → Easy, inaczej Good.
- **Reguły uczciwości:** błędna odpowiedź zawsze się liczy; poprawna na karcie, która nie jest „due”, nie przesuwa harmonogramu (zwykła ekspozycja); mówienie z podpowiedzią nie planuje karty speaking; w rozmowie liczy się tylko użycie spontaniczne (nie echo wypowiedzi tutora, nie zaraz po podpowiedzi); deklaracja „znam” tworzy karty do weryfikacji, a nie opanowanie.
- **Kompetencje:** utrwalona = stan Review i stabilność ≥ 7 dni; speaking utrwalone = ≥ 2 spontaniczne użycia albo stabilność ≥ 7 dni.
- **Opanowane słowo** = słuch utrwalony **i** przypominanie utrwalone **i** jakiekolwiek samodzielne użycie w mowie.
- Karta speaking pojawia się dopiero, gdy przypominanie wejdzie w stan Review.

### Plan dnia (`planner.ts`, czysta funkcja)
- Warianty: Quick 10 / Standard 30 (5 powtórki, 7 nowe, 5 historia/gramatyka, 10 rozmowa, 3 feedback) / Deep 45.
- Powtórki najpierw (~18 s/kartę); nadwyżka zabiera czas nowym słowom. Limit nowych słów adaptacyjny: zaległości > 15/30/60 → mniej/zero; skuteczność 7 dni < 70% → wolniej, > 90% → szybciej.
- Slot historia/gramatyka: gramatyka, gdy konstrukcja sypie się w rozmowach; inaczej powracająca historia, inaczej naprzemiennie.
- Rozmowa: scenariusze ze sprintu, potem z wybranych sytuacji, najdawniej ćwiczone; tryb zależny od poziomu.
- Test tygodniowy: raz w tygodniu, po ≥ 3 aktywnych dniach.
- Plan jest zapisywany raz na dzień (`unique(user_id, plan_date)`) — odświeżenie strony nie zmienia kolejki. Wariant można zmienić tylko przed rozpoczęciem.

### Gramatyka
Mastery = średnia krocząca wyników (0.2; z rozmów 0.1). „Przećwiczone” ≥ 0.6 po ≥ 6 próbach; „opanowane” ≥ 0.85, ≥ 12 prób i ≥ 3 poprawne użycia w rozmowach. Następny etap otwiera się, gdy poprzedni jest przećwiczony. Ćwiczenia dobierane do poziomu opanowania.

### Historie
Słowa docelowe: świeżo poznane i zaległe. Wygenerowana historia przechodzi walidację (schemat, obecność słów docelowych, glosariusz zgodny z tekstem, długość zdań); przy porażce — jedna poprawka, potem zapis z adnotacją. Powroty po 3/7/14/30 dniach w wersjach: przeszłość → rozszerzenie → inna perspektywa → przyszłość.

### North Star
Minuty samodzielnej, zrozumiałej rozmowy = czas rozmowy × udział wypowiedzi bez pomocy × (rozumienie + płynność)/10 z analizy AI (0.5 i oznaczenie „przybliżone”, gdy brak analizy AI).

## 5. Integracja ElevenLabs

- Prywatny agent (`enable_auth`), konfiguracja i prompt w `scripts/elevenlabs/agent-config.ts`, tworzenie przez API.
- Kontekst sesji przez **dynamic variables**: persona, reguły trybu, cele, znane słowa, słowa do powtórki, gramatyka, pamięć ucznia, typowe błędy, tempo, polityka podpowiedzi. Nadpisania: pierwsza wiadomość, język, głos postaci i tempo.
- Połączenie: token WebRTC (`conversationToken`), fallback: signed URL WebSocket. Klient: `@elevenlabs/react` (`ConversationProvider` + `useConversation`).
- Przyciski „Podpowiedź / Powtórz wolniej / Nie rozumiem / Tłumaczenie” wysyłają komunikaty sterujące `[ACCIÓN: …]` (`sendUserMessage`); prompt agenta je rozumie, a transkrypcja zapisuje je jako akcje, nie jako mowę ucznia.
- Odporność: jawna prośba o mikrofon z instrukcją dla Safari, wykrywanie braku sieci, ponowne połączenie tym samym sesją Hablo (nowy token + kontekst ostatnich wypowiedzi), zakończenie z lokalną transkrypcją, gdy oficjalna jest niedostępna; webhook po rozmowie dokańcza analizę.
- Wymowa nie jest oceniana na podstawie transkrypcji (raport mówi to wprost; co najwyżej „możliwy problem z wymową”).

## 6. Design system

Tokeny w `src/app/globals.css` (`@theme`): tło `#fafaf8`, tekst `#1a1a19`, jeden akcent **terakota `#c2452d`**, kolory statusu tylko dla wyników. Bez gradientów i maskotek. Typografia systemowa (SF Pro na iPhonie), hiszpański tekst czytany krojem szeryfowym (New York / Georgia). Prymitywy w stylu shadcn/ui w `src/components/ui`. Mobile‑first: dolny pasek z centralnym przyciskiem „Mów”, główne akcje w zasięgu kciuka, ekrany ćwiczeń pełnoekranowe (grupa `(focus)`), animacje 200–260 ms z obsługą `prefers-reduced-motion`.

## 7. Ścieżki użytkownika

1. Logowanie (magic link/Google) → onboarding (poziom, test słów i 3 wypowiedzi albo pominięcie, czas, motywacja, sytuacje) → pierwszy plan.
2. Dziś → „Zacznij lekcję” → kolejne pozycje planu (powtórki → nowe słowa → historia/gramatyka → rozmowa → podsumowanie). Każda odpowiedź zapisuje się od razu; przerwanie i powrót kontynuuje od miejsca przerwania.
3. Mów → tryb / sytuacja → rozmowa głosowa → raport (podsumowanie, błędy, poprawne wersje, brakujące słowa, mocne strony, następne ćwiczenie).
4. Postępy → trzy kompetencje, North Star, wykres 30 dni, gramatyka, testy tygodniowe, problemy i kierunek.

## 8. Testy

- Jednostkowe (Vitest, `tests/unit`): FSRS i reguły uczciwości, limity nowych słów, planer (determinizm, zaległości, test tygodniowy, zadania z rozmów), trwałość planu, przerwanie/kontynuacja, dopasowanie odpowiedzi, leksykon, ograniczenie do jednego konta (także odrzucenie poprawnej sesji innego użytkownika), podpis webhooka, obsługa błędów ElevenLabs, walidacja treści AI, analiza rozmowy → model ucznia.
- End‑to‑end (Playwright, `tests/e2e`): onboarding z testem, stabilność planu, nowe słowa z przerwaniem i wznowieniem, słownictwo, pełna historia, lekcja gramatyki, rozmowa (tryb tekstowy, testowe AI) → raport → słowo w powtórkach, postępy/eksport, odrzucanie niepodpisanych webhooków.
