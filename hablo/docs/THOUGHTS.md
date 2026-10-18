# Moje myśli

Prywatna biblioteka Twoich myśli i pytań refleksyjnych. Ma przypominać o tym, co dla Ciebie ważne, a nie być kolejnym systemem samodoskonalenia. Dlatego nie ma tu streaków, punktów, celów ani powiadomień.

## Co robi

- **Biblioteka** (`/thoughts`): wyszukiwanie (bez względu na polskie znaki), filtry (ulubione, wyróżnione, ukryte), kategoria, moment, edycja, ukrywanie i dodawanie własnych wpisów.
- **Pytania refleksyjne** są zwinięte. Pojawiają się dopiero po kliknięciu „Pytania refleksyjne” i nigdy nie trafiają na ekran główny.
- **Ekran Dziś** pokazuje najwyżej jedną myśl:
  - Moment dobierany jest z pory dnia w Twojej strefie czasowej:
    - dni robocze 4–12 → *poranek*;
    - dni robocze 15–20 → *koniec pracy*;
    - pozostałe godziny i weekend → *odpoczynek*.
  - Moment można zmienić jednym dotknięciem: poranek, koniec pracy, nowy pomysł, napięcie, rodzina, odpoczynek, wyjazd.
  - Myśl jest stała w ciągu dnia.
  - Ulubione i wyróżnione pojawiają się częściej.
  - Myśl pokazana w ostatnich 14 dniach jest pomijana, jeśli jest inna do wyboru.
  - Gdy żadna myśl nie pasuje do momentu, nic nie jest pokazywane.
- **Odsłuch**: ElevenLabs, głos `ELEVENLABS_VOICE_ID_NARRATOR` (domyślnie głos żeński), wolniejsze tempo i wysoka stabilność. Bez kluczy działa głos przeglądarki `pl-PL`, oznaczony jako zastępczy.

## Prywatność

Treść biblioteki **nie jest częścią repozytorium**. Trafia wyłącznie do Twojej bazy (Supabase z RLS: wiersze widoczne tylko dla Twojego konta). W trybie demo trafia do lokalnego pliku `.data/`. Eksport i usuwanie danych w Ustawieniach obejmują też myśli.

## Import i aktualizacje

*Moje myśli → Import biblioteki (JSON)*. Import można powtarzać, na przykład gdy masz nowszą wersję pliku:

- wpisy rozpoznawane są po `id` (a bez `id` — po treści);
- **wpis, który edytowałeś w aplikacji, zostaje w Twojej wersji**;
- ulubione i ukryte są zawsze Twoje — import ich nie zmienia;
- kategorie, których nazwę zmieniłeś, zachowują Twoją nazwę;
- import niczego nie usuwa.

### Format

Klucze mogą być angielskie albo polskie. Pola, których aplikacja nie zna, są zachowywane w metadanych wpisu.

```json
{
  "kategorie": [
    { "id": "spokoj", "nazwa": "Spokój", "opis": "O zwalnianiu" }
  ],
  "myśli": [
    {
      "id": "m001",
      "tekst": "Nie muszę dziś wszystkiego.",
      "kategoria": "spokoj",
      "konteksty": ["poranek", "napięcie"],
      "wyróżniona": true,
      "źródło": "notatki 2024"
    }
  ],
  "pytania": [
    { "id": "p01", "tekst": "Co dziś było naprawdę ważne?", "kategoria": "spokoj" }
  ]
}
```

Akceptowane warianty:

- **Struktura pliku:**
  - lista samych myśli (`[...]`);
  - kategorie z zagnieżdżonymi myślami: `{ "nazwa": "...", "myśli": [...], "pytania": [...] }`.
- **Nazwy pól:**
  - treść: `text`/`tekst`/`treść`;
  - kontekst: `contexts`/`konteksty`/`kontekst`;
  - wyróżnienie: `featured`/`wyróżniona`/`highlighted`.
- **Konteksty:**
  - lista albo tekst rozdzielony przecinkami;
  - wielkość liter i polskie znaki nie mają znaczenia.
  - Nieznane konteksty są zachowywane w metadanych (`unknown_contexts`) i pokazywane w raporcie importu.
