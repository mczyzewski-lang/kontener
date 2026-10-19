# Konfiguracja Hablo

Wszystkie klucze są czytane ze zmiennych środowiskowych (lista: `.env.example`). Klucze API nigdy nie trafiają do przeglądarki —
przeglądarka dostaje tylko krótkotrwałe tokeny rozmów i pliki audio z naszych endpointów.

## 0. Najprościej: Railway + PostgreSQL (bez Supabase)

Zamiast Supabase możesz użyć zwykłej bazy PostgreSQL. Aplikacja sama tworzy tabele i wgrywa treści przy pierwszym
uruchomieniu, a logujesz się swoim e-mailem i hasłem z konfiguracji.

1. W projekcie Railway: **+ New → Database → PostgreSQL**.
2. W serwisie z aplikacją, *Settings*:
   - *Source → Branch*: gałąź z Hablo,
   - **Root Directory: `hablo`** (w głównym katalogu repozytorium jest inny projekt),
   - *Build Command*: `npm run build`, *Start Command*: `npm start`,
   - *Networking → Generate Domain*.
3. *Variables* w serwisie z aplikacją:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   HABLO_ALLOWED_EMAIL=twoj@email.pl
   HABLO_PASSWORD=długie-unikalne-hasło
   ANTHROPIC_API_KEY=...
   ELEVENLABS_API_KEY=...            (i pozostałe ELEVENLABS_* — sekcja 3)
   ```
   `${{Postgres.DATABASE_URL}}` to odwołanie Railway do bazy (jeśli serwis bazy ma inną nazwę, użyj jej zamiast `Postgres`).
4. **Deploy.** W logach zobaczysz `[hablo] applied database migrations: 001_init.sql`. Wejdź na adres, zaloguj się e-mailem
   i hasłem, przejdź onboarding.

Bezpieczeństwo w tym trybie: logowanie sprawdza na serwerze e-mail i hasło (z limitem prób), sesja to podpisane ciasteczko
HttpOnly ważne 60 dni, każde żądanie jest weryfikowane po stronie serwera. Zmiana hasła wylogowuje wszystkie urządzenia.
Cache audio wymowy jest w tabeli `blobs` w tej samej bazie. Pozostałe sekcje tej instrukcji dotyczą Supabase —
w trybie PostgreSQL pomiń sekcję 1 i 4; Claude i ElevenLabs (sekcje 2–3) konfigurujesz tak samo.

## 1. Supabase (baza danych i logowanie)

1. Utwórz projekt na <https://supabase.com> (region UE, np. Frankfurt).
2. **Schemat:** w *SQL Editor* wklej i uruchom `supabase/migrations/20261018000000_init.sql`
   (albo z Supabase CLI: `supabase link --project-ref <ref>` → `supabase db push`).
   Migracja tworzy tabele, Row Level Security, kosze Storage (`tts-cache`, `recordings`) i trigger, który blokuje rejestrację
   każdego adresu spoza listy `private.allowed_emails`.
3. **Twój adres na liście dozwolonych** — w SQL Editor:
   ```sql
   insert into private.allowed_emails (email) values ('twoj@email.pl') on conflict do nothing;
   ```
   (`npm run db:seed` też próbuje to zrobić, jeśli ustawisz `HABLO_ALLOWED_EMAIL`.)
4. **Klucze:** *Project Settings → API* → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon/publishable),
   `SUPABASE_SERVICE_ROLE_KEY` (service role — tylko serwer).
5. **Treści:** `npm run db:seed` (z ustawionymi zmiennymi). Bez tego aplikacja zaseeduje treści sama przy pierwszym wejściu,
   o ile jest `SUPABASE_SERVICE_ROLE_KEY`.
6. **Auth → URL Configuration:** *Site URL* = adres aplikacji; *Redirect URLs* dodaj `https://TWOJA-DOMENA/api/auth/confirm`
   (i `http://localhost:3000/api/auth/confirm` do pracy lokalnej).
7. **Auth → Providers:**
   - *Email* (magic link) — włączone domyślnie.
   - *Google* (opcjonalnie) — utwórz OAuth Client w Google Cloud Console, redirect URI z panelu Supabase, wklej Client ID/Secret.
8. Ustaw `HABLO_ALLOWED_EMAIL=twoj@email.pl`.

Ochrona jest trójwarstwowa: (1) trigger w bazie blokuje rejestrację innych adresów, (2) serwer przy każdym żądaniu sprawdza,
czy e-mail sesji to `HABLO_ALLOWED_EMAIL` (inaczej wylogowuje), (3) RLS ogranicza każdy wiersz do `auth.uid()`.
Opcjonalnie po pierwszym logowaniu wyłącz *Allow new users to sign up* w *Auth → Settings*.

## 2. Claude API

1. Klucz z <https://console.anthropic.com> → `ANTHROPIC_API_KEY`.
2. Domyślny model: `claude-opus-5-5` (zmiana: `ANTHROPIC_MODEL`). Żądania mają włączony serwerowy fallback przy odmowie
   (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
3. Claude generuje historie, ocenia odpowiedzi zdaniowe (znaczenie, nie dosłowność), analizuje rozmowy, planuje sprinty.
   Każda odpowiedź jest walidowana schematem (Zod) przed zapisem; wygenerowane treści są zapisywane, nie generowane ponownie.

## 3. ElevenLabs (rozmowy, wymowa, rozpoznawanie mowy)

1. Klucz API: *Settings → API Keys* → `ELEVENLABS_API_KEY` (uprawnienia: Agents, Text to Speech, Speech to Text).
2. **Głosy:** w *Voice Library* wybierz głos żeński i męski z akcentem z Hiszpanii (filtr: Spanish → Spain / Castilian).
   Skopiuj ich *Voice ID* → `ELEVENLABS_VOICE_ID_FEMALE`, `ELEVENLABS_VOICE_ID_MALE` (dodaj je do „My Voices”).
3. **Agent (programowo):**
   ```bash
   ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID_FEMALE=... npm run elevenlabs:agent
   ```
   Skrypt tworzy prywatnego agenta (`enable_auth: true` — bez tokenu z naszego backendu nie da się z nim połączyć),
   z promptem nauczycielki, zmiennymi dynamicznymi i zezwoleniem na nadpisanie głosu/tempa/pierwszej wiadomości.
   Wypisze `ELEVENLABS_AGENT_ID=...` — dodaj do środowiska. Ponowne uruchomienie z ustawionym `ELEVENLABS_AGENT_ID`
   aktualizuje prompt. Konfiguracja do ręcznego wglądu: `docs/elevenlabs-agent.json` (`npm run elevenlabs:agent -- --print`).
   - Model LLM agenta: domyślnie `claude-opus-5-5`; dla mniejszych opóźnień w rozmowie możesz ustawić szybszy
     (`ELEVENLABS_AGENT_LLM=claude-sonnet-5-5`).
   - Nagrania: domyślnie agent ich nie przechowuje. Jeśli chcesz odsłuchiwać rozmowy, ustaw `ELEVENLABS_RECORD_VOICE=1`
     przy tworzeniu agenta **i** włącz „Zapisuj nagrania” w Ustawieniach Hablo (z własnym czasem przechowywania).
4. **Webhook po rozmowie (zalecany):** w ElevenLabs *Agents → Settings → Webhooks* dodaj *post-call transcription*
   na `https://TWOJA-DOMENA/api/elevenlabs/webhook`, skopiuj sekret → `ELEVENLABS_WEBHOOK_SECRET`.
   Webhook jest weryfikowany podpisem HMAC (`ElevenLabs-Signature`) i dokańcza analizę, gdy przeglądarka zamknęła się
   przed zakończeniem rozmowy. Wymaga `SUPABASE_SERVICE_ROLE_KEY`.
5. **Koszty:** limity dzienne/miesięczne i dzienny limit minut ustawisz w *Ustawieniach*. Szacunki opierają się na cenach
   z `.env.example` (`ELEVENLABS_COST_*`) — dopasuj je do swojego planu.

### Przepływ rozmowy

Twoje konto → Hablo (serwer sprawdza sesję i e-mail) → `POST /api/conversation/start` buduje kontekst ucznia
(poziom, znane słowa, słowa do powtórki, gramatyka, pamięć) i pobiera **token WebRTC** dla prywatnego agenta
(`GET /v1/convai/conversation/token`; awaryjnie signed URL WebSocket) → przeglądarka łączy się przez `@elevenlabs/react`
ze zmiennymi dynamicznymi → rozmowa → `POST /api/conversation/{id}/finish` pobiera oficjalną transkrypcję
(`GET /v1/convai/conversations/{id}`) → analiza Claude → aktualizacja powtórek, gramatyki, pamięci i jutrzejszego planu.

## 4. Hosting (Vercel)

1. *New Project* → importuj repozytorium, **Root Directory: `hablo`** (framework: Next.js).
2. Dodaj zmienne środowiskowe z `.env.example` (Production + Preview).
3. Deploy. Następnie uzupełnij w Supabase *Site URL* / *Redirect URLs* adresem produkcyjnym.
4. Nie ustawiaj `HABLO_DEMO_MODE` na publicznym adresie — tryb demo nie ma logowania.

Inny hosting: dowolny serwer Node ≥ 20.9 (`npm run build && npm start`). W trybie demo dane są w pliku, więc na
platformach z efemerycznym dyskiem (Vercel) tryb demo nie zachowa postępów — to tylko podgląd.

## 5. iPhone

Otwórz adres w Safari → *Udostępnij* → *Do ekranu początkowego*. Przy pierwszej rozmowie Safari zapyta o mikrofon
(jeśli odmówisz: *Ustawienia → Safari → Mikrofon*). Najlepiej rozmawiać w słuchawkach.

## 6. Testy

```bash
npm run check        # typecheck, lint, walidacja treści, testy jednostkowe
npm run test:e2e     # Playwright (uruchamia aplikację w trybie demo z testowym AI)
```
Na maszynie bez preinstalowanego Chromium: `npx playwright install chromium` i ustaw `PLAYWRIGHT_CHROMIUM_PATH` lub `CI=1`.
