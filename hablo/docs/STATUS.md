# Stan implementacji

Data: 2026-10-18.

## Gotowe i przetestowane

**Etap 1 — MVP end‑to‑end:** wszystkie elementy.
- Prywatne logowanie (magic link + Google przez Supabase), ograniczenie do jednego e-maila na trzech poziomach (trigger w bazie, serwer, RLS).
- Onboarding: poziom, test słów (5 pasm częstotliwości) i 3 wypowiedzi głosem/tekstem albo pominięcie, czas, motywacja, sytuacje, zainteresowania → pierwszy plan.
- Ekran Dziś, lekcja dnia, podsumowanie dnia.
- **360 słów + 58 zwrotów** z rankingiem z korpusu (wymaganie: 200), z tłumaczeniami, przykładami, kolokacjami, formami, tematami i powiązaną gramatyką.
- Fiszki: wszystkie 8 typów ćwiczeń, odpowiedzi głosem (ElevenLabs Scribe / rozpoznawanie przeglądarki) lub tekstem, ocena znaczeniowa przez Claude.
- FSRS z trzema niezależnymi kompetencjami i regułami uczciwości; dziennik prób.
- Historie: 6 historii startowych z ręcznie napisanymi wariantami + generowanie przez Claude z walidacją; 6 etapów; historie powracające; pałac pamięci (sceny AI + własne skojarzenia).
- Gramatyka: 11 etapów z wyjaśnieniami, przykładami, ćwiczeniami, mini‑rozmowami i odblokowywaniem po przećwiczeniu.
- 13 scenariuszy rozmów, 3 tryby + test tygodniowy + praktyka gramatyki; integracja ElevenLabs (prywatny agent, token WebRTC, zmienne dynamiczne, napisy, tłumaczenie po dotknięciu, przyciski pomocy, wyciszenie, ponowne połączenie, obsługa braku sieci); tryb tekstowy jako jawny fallback.
- Raport po rozmowie i analiza wpływająca na powtórki, gramatykę, pamięć ucznia i plan.
- Automatyczny plan dnia (Quick/Standard/Deep), stała kolejka, adaptacja do zaległości i skuteczności.

**Z etapów 2–3 również zrobione:** test tygodniowy z raportem, analiza błędów między modułami, recurring stories, Personal Sprint, North Star w Postępach, wykres 30 dni, kontrola kosztów z limitami, eksport JSON/CSV, usuwanie danych, retencja transkrypcji i nagrań, PWA (manifest, ikony, service worker, ekran offline).

Weryfikacja: `npm run check` (typecheck, lint, walidacja treści, 48 testów jednostkowych), `npm run build`, 9 scenariuszy e2e Playwright — wszystko przechodzi.

## Czego nie dało się zweryfikować w tym środowisku

- **Żywe usługi.** Środowisko budowy nie miało kluczy ani dostępu sieciowego do `api.elevenlabs.io` i Supabase. Endpointy ElevenLabs i kształty danych zostały wzięte z oficjalnych SDK (`@elevenlabs/react` 1.18, `@elevenlabs/client`, `@elevenlabs/elevenlabs-js` 2.73), a integracja Claude z oficjalnego SDK — ale pierwsza prawdziwa rozmowa głosowa, migracja na Twoim projekcie Supabase i logowanie odbędą się dopiero po podłączeniu kluczy. Pierwsze uruchomienie warto zrobić lokalnie (`npm run dev`) i przejść: logowanie → onboarding → jedna fiszka głosowa → krótka rozmowa.
- **iPhone Safari.** Kod uwzględnia Safari (MediaRecorder `audio/mp4`, jawna prośba o mikrofon, PWA), ale testy e2e działają na Chromium z widokiem iPhone’a — nie na fizycznym urządzeniu.
- Ścieżka webhooka z prawdziwym podpisem ElevenLabs (logika podpisu jest przetestowana jednostkowo, zgodnie z implementacją SDK).

## Kolejne kroki

1. **Podłączenie usług** (docs/SETUP.md) i test na iPhonie.
2. **Słownictwo 360 → 1000 → 5000.** Ranking dla kolejnych partii daje już `scripts/build-vocabulary.ts`; brakuje autorskich tłumaczeń i przykładów. Zalecany proces: kandydaci z korpusu → szkic z Claude → walidacja schematem → przegląd człowieka → `npm run content:build && npm run db:seed`. Nie generować list z pamięci modelu.
3. Audio wymowy dla całej biblioteki z góry (dziś: generowane i cache’owane przy pierwszym odtworzeniu).
4. Kolejne scenariusze (urzędy, bank, mechanik, wizyta u znajomych) i więcej historii startowych.
5. Kalibracja: po 2–3 tygodniach realnych danych przejrzeć progi (stabilność 7 dni, limity nowych słów, wagi mastery) i — przy ~1000 powtórek — rozważyć optymalizację parametrów FSRS na własnej historii.
6. Push notifications (iOS 16.4+ PWA) z przypomnieniem o powtórkach.
