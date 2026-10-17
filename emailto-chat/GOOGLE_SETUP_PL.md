# emailto.chat — konfiguracja Google Cloud, Gmail API, Vercel i publiczny launch

Przewodnik krok po kroku dla właściciela **emailto.chat** (https://emailto.chat), czyli klienta Gmaila zorganizowanego wokół osób, a nie wątków (Next.js 16 na Vercel, PostgreSQL przez Prisma, Gmail API).

Zakładam, że **nigdy wcześniej nie korzystałeś z Google Cloud Console**. Nazwy elementów interfejsu zostawiam po angielsku, **pogrubione** albo w „cudzysłowie”, dokładnie tak jak wyświetla je Google lub Vercel.

> **Status weryfikacji źródeł (stan na 2026-10-17).** Instrukcję przygotowano na podstawie oficjalnej dokumentacji Google i Vercel, ale strony dokumentacji nie były otwierane bezpośrednio — fakty sprawdzano przez wyniki wyszukiwania cytujące te strony. Linki do źródeł są podane w treści; przed ważnymi krokami (szczególnie weryfikacja OAuth i CASA) otwórz podlinkowaną stronę i potwierdź szczegóły. Elementy, których nie udało się potwierdzić, mają adnotację **⚠ Niezweryfikowane**. Google i Vercel często zmieniają interfejs — jeśli przycisk nazywa się inaczej, szukaj najbliższego odpowiednika.

---

## Spis treści

0. [Szybki start lokalny (15 minut)](#0-szybki-start-lokalny-15-minut)
1. [A. Google Cloud: projekt, Gmail API, ekran zgody, OAuth](#a-google-cloud)
2. [B. Synchronizacja Gmail przez Pub/Sub (OPCJONALNE)](#b-synchronizacja-gmail-pubsub--opcjonalne)
3. [C. Wdrożenie na Vercel](#c-wdrożenie-na-vercel)
4. [D. Publiczny launch i weryfikacja Google](#d-publiczny-launch-i-weryfikacja-google)
5. [Najczęstsze problemy](#najczęstsze-problemy)
6. [Lista kontrolna na koniec](#lista-kontrolna-na-koniec)

---

## 0. Szybki start lokalny (15 minut)

Najkrótsza droga do uruchomienia aplikacji na własnym komputerze z własną skrzynką Gmail. Każdy krok jest opisany szczegółowo w części A.

1. Wejdź na https://console.cloud.google.com i zaloguj się kontem Google.
2. Utwórz projekt `emailto-chat` (patrz [A2–A3](#a2-nowy-projekt)).
3. Włącz **Gmail API** (patrz [A4](#a4-włączenie-gmail-api)).
4. **Google Auth Platform** → **Get started**: nazwa aplikacji, e-mail wsparcia, **Audience = External**, dane kontaktowe, akceptacja polityki (patrz [A5–A6](#a5-google-auth-platform--branding-ekran-zgody)).
5. **Audience** → **Test users** → **Add users** → dodaj **swój** adres Gmail (patrz [A7](#a7-test-users-użytkownicy-testowi)).
6. **Clients** → **Create client** → **Web application**:
   - origin: `http://localhost:3000`
   - redirect: `http://localhost:3000/api/auth/google/callback`

   Skopiuj **Client ID** i **Client secret** i pobierz plik JSON (patrz [A8–A11](#a8-oauth-client-id-typu-web-application)).
7. **Data Access** → dodaj zakresy `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `https://www.googleapis.com/auth/gmail.modify` (patrz [A12](#a12-zakresy-scopes-w-data-access)).
8. Uruchom lokalnego Postgresa:
   ```bash
   docker run -d --name emailto-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
   ```
9. W katalogu `emailto-chat/` utwórz plik `.env` (pełny przykład w [A13](#a13-zmienne-środowiskowe-plik-env-dla-localhost)).
10. Zainstaluj zależności, zastosuj migracje i uruchom serwer:
    ```bash
    cd emailto-chat
    npm install
    npx prisma migrate deploy
    npm run dev
    ```
11. Otwórz http://localhost:3000 → zaloguj się → **Connect Gmail** → na ekranie „Google hasn't verified this app” kliknij **Continue** → `/app` pokazuje listę osób.

**Jak sprawdzić, że się udało:**
- `/app/settings` pokazuje Twój adres Gmail i status synchronizacji.
- `http://localhost:3000/api/sync` (GET, będąc zalogowanym) zwraca JSON ze statusem synchronizacji.

Pub/Sub **nie jest potrzebny** do lokalnego startu. Bez niego aplikacja:
- pobiera pocztę przy otwarciu,
- odpytuje Gmaila mniej więcej co 45 s, dopóki jest otwarta (`POST /api/sync`),
- korzysta z Gmail History API.

---

## A. Google Cloud

### A1. Adres

- Konsola: **https://console.cloud.google.com**
- Konfiguracja OAuth (dawniej „OAuth consent screen”) nazywa się dziś **Google Auth Platform**. Wejście bezpośrednie: https://console.cloud.google.com/auth/overview. W lewym menu są sekcje **Overview**, **Branding**, **Audience**, **Clients**, **Data Access**, **Verification Center**. Opis sekcji jest w pomocy Google: [Google Auth Platform](https://support.google.com/cloud/answer/15544987), [Manage App Branding](https://support.google.com/cloud/answer/15549049), [Manage App Audience](https://support.google.com/cloud/answer/15549945).

Przy pierwszym wejściu Google może poprosić o akceptację **Terms of Service** Google Cloud i wybór kraju. Zaznacz akceptację i kliknij **Agree and continue**. **Do samej konfiguracji OAuth i Gmail API karta płatnicza nie jest potrzebna.** Pub/Sub w małej skali mieści się zwykle w darmowym limicie, ale aktualny cennik sprawdź na https://cloud.google.com/pubsub/pricing.

**Jak sprawdzić:** na górze ekranu widzisz pasek z napisem „Google Cloud” i przycisk wyboru projektu (np. „Select a project”).

### A2. Nowy projekt

1. Na górnym pasku kliknij selektor projektu (napis **Select a project** albo nazwa bieżącego projektu).
2. W oknie dialogowym kliknij **New project** (prawy górny róg).
3. Wypełnij formularz:
   - **Project name**: `emailto-chat`
   - **Organization / Location**: zostaw „No organization”, jeśli używasz prywatnego konta Gmail. Przy koncie Google Workspace możesz wybrać swoją organizację.
4. Kliknij **Create**. Po kilku sekundach pojawi się powiadomienie (ikona dzwonka). Kliknij **Select project**.

Alternatywa przez CLI:
```bash
gcloud projects create emailto-chat --name="emailto-chat"
gcloud config set project emailto-chat
```

**Jak sprawdzić:** selektor projektu na górze pokazuje `emailto-chat`.

### A3. Nazwa projektu i Project ID

- **Project name** to etykieta i można ją później zmienić.
- **Project ID** to globalnie unikalny identyfikator. **Nie da się go zmienić po utworzeniu.** Widać go pod polem nazwy w formularzu („Project ID: emailto-chat”, link **Edit**).
- Proponuję Project ID `emailto-chat`. Jeśli jest zajęty (identyfikatory są unikalne w całym Google Cloud), Google zaproponuje np. `emailto-chat-472913`. Możesz też wpisać własny, np. `emailto-chat-prod`.
- Project ID pojawia się w nazwie tematu Pub/Sub (`projects/<project-id>/topics/gmail-push`). **Zapisz go.**

**Jak sprawdzić:** **☰ menu** → **IAM & Admin** → **Settings** pokazuje **Project name**, **Project ID** i **Project number**.

### A4. Włączenie Gmail API

1. Wejdź na https://console.cloud.google.com/apis/library/gmail.googleapis.com. Możesz też przejść przez **☰** → **APIs & Services** → **Library**, wpisać „Gmail API” i kliknąć kafelek **Gmail API**.
2. Kliknij niebieski przycisk **Enable**.

CLI:
```bash
gcloud services enable gmail.googleapis.com
```

**Jak sprawdzić:** po włączeniu zobaczysz stronę **API/Service details** z przyciskiem **Disable API**. Gmail API widać też na liście **APIs & Services** → **Enabled APIs & services**.

### A5. Google Auth Platform — Branding (ekran zgody)

Ekran zgody to okno, które Google pokazuje użytkownikowi, kiedy aplikacja prosi o dostęp do jego danych.

1. Wejdź na https://console.cloud.google.com/auth/overview. Jeśli platforma nie jest jeszcze skonfigurowana, zobaczysz komunikat „Google Auth Platform not configured yet” i przycisk **Get started**. Kliknij go.
2. Kreator ma cztery kroki:
   1. **App Information**:
      - **App name**: `emailto.chat`. Nazwa nie może zawierać słowa „Google” ani „Gmail” jako części marki.
      - **User support email**: Twój adres (lista rozwijana pokazuje Twoje konto oraz grupy Google, którymi zarządzasz).
      - Kliknij **Next**.
   2. **Audience**: **External** (patrz A6) → **Next**.
   3. **Contact Information**: adres e-mail dewelopera, na który Google wysyła powiadomienia o projekcie → **Next**.
   4. **Finish**: zaznacz zgodę na **Google API Services: User Data Policy** → **Continue** → **Create**.
3. Przejdź do **Branding** (https://console.cloud.google.com/auth/branding) i uzupełnij pozostałe pola:
   - **App logo**. **Na start NIE wgrywaj logo.** Według [Manage App Branding](https://support.google.com/cloud/answer/15549049) logo i nazwa wyświetlają się na ekranie zgody dopiero po weryfikacji, a wgranie logo w aplikacji produkcyjnej uruchamia proces weryfikacji marki. Logo dodasz na etapie D. Wymagania: plik poniżej 1 MB, format JPG, PNG lub BMP, najlepiej kwadrat 120×120 px, bez znaków towarowych Google.
   - **App domain**:
     - **Application home page**: `https://emailto.chat`
     - **Application privacy policy link**: `https://emailto.chat/privacy`
     - **Application terms of service link**: `https://emailto.chat/terms`
   - **Authorized domains**: kliknij **Add domain** i wpisz `emailto.chat` (sama domena, bez `https://` i bez ścieżki). **Nie dodawaj `localhost`**, bo nie jest potrzebny i nie jest akceptowany. Adresy localhost działają w kliencie OAuth bez tego wpisu.
   - **Developer contact information**: Twój e-mail.
4. Kliknij **Save**.

**Jak sprawdzić:** **Branding** pokazuje zapisane dane. W **Overview** nie ma ostrzeżenia o brakującej konfiguracji.

> Domena w **Authorized domains** musi docelowo być zweryfikowana w Google Search Console przez osobę, która jest właścicielem lub edytorem projektu. Szczegóły w [D6](#d6-weryfikacja-domeny-google-search-console). Do pracy w trybie Testing nie jest to wymagane.

### A6. External + Testing

- **User type = External** oznacza, że aplikacja jest dostępna dla dowolnego konta Google, w tym prywatnych @gmail.com.
- **Internal** jest dostępne tylko w organizacji Google Workspace i obejmuje wyłącznie użytkowników tej organizacji. Nie pasuje do publicznej aplikacji.
- **Publishing status = Testing** to stan domyślny po utworzeniu. Widać go w **Audience** jako napis „Publishing status: Testing” z przyciskiem **Publish app**.

W trybie Testing ([Manage App Audience](https://support.google.com/cloud/answer/15549945)):
- Aplikacji mogą używać tylko konta z listy **Test users** (maksymalnie **100**).
- Test users widzą ostrzeżenie „Google hasn't verified this app” i mogą je pominąć.
- **Refresh tokeny wygasają po 7 dniach**, bo prosimy o zakres spoza name/email/profile (szczegóły w [D3](#d3-refresh-tokeny-w-testing-wygasają-po-7-dniach)).

**Jak sprawdzić:** **Audience** → sekcja **Publishing status** pokazuje „Testing”, a **User type** pokazuje „External”.

### A7. Test users (użytkownicy testowi)

1. **Audience** (https://console.cloud.google.com/auth/audience) → sekcja **Test users** → **+ Add users**.
2. Wpisz adresy Gmail, które będą testować aplikację (na początek swój) → **Save**.

Limit to 100 test users ([Manage App Audience](https://support.google.com/cloud/answer/15549945)). Konto spoza listy dostanie błąd `access_denied` (patrz A14).

**Jak sprawdzić:** adres jest widoczny w tabeli **Test users**.

### A8. OAuth Client ID typu Web application

1. **Clients** (https://console.cloud.google.com/auth/clients) → **+ Create client**.
2. **Application type**: **Web application**.
3. **Name**: np. `emailto.chat web`. Nazwa jest widoczna tylko w konsoli.
4. Uzupełnij A9 i A10 (te same pola w tym samym formularzu), potem kliknij **Create**.

CLI: tworzenia klientów OAuth „Web application” nie da się w praktyce zrobić przez `gcloud` (dostępne polecenia `gcloud iam oauth-clients` dotyczą Workforce Identity Federation, a nie zwykłych klientów aplikacji). **⚠ Niezweryfikowane**, czy to się zmieniło. Użyj konsoli.

### A9. Authorized JavaScript origins

W formularzu klienta, sekcja **Authorized JavaScript origins** → **+ Add URI**:
```
http://localhost:3000
https://emailto.chat
```
Origin to tylko schemat, host i port, bez ścieżki i bez końcowego `/`.

> Przepływ w emailto.chat jest serwerowy (Authorization Code + PKCE na serwerze), więc origins nie są ściśle wymagane. Wpisz je jednak, bo nie szkodzą, a ułatwiają ewentualne przyszłe użycie Google Identity Services w przeglądarce.

### A10. Authorized redirect URIs

Sekcja **Authorized redirect URIs** → **+ Add URI**:
```
http://localhost:3000/api/auth/google/callback
https://emailto.chat/api/auth/google/callback
```
Adres musi się zgadzać **co do znaku**: schemat, host, port, ścieżka, brak końcowego `/`. `https://www.emailto.chat/...` to **inny** adres. Jeśli aplikacja działa pod `www`, dodaj go osobno albo (lepiej) przekieruj `www` na domenę główną (patrz C2).

Kliknij **Create**. Google wyświetla notatkę, że zmiany ustawień klienta mogą zacząć działać dopiero po kilku minutach (czasem dłużej). Jeśli od razu po zmianie widzisz `redirect_uri_mismatch`, odczekaj 5 minut.

**Jak sprawdzić:** **Clients** → kliknij nazwę klienta i porównaj listę URI.

### A11. Gdzie znaleźć Client ID i Client Secret

- Zaraz po kliknięciu **Create** pojawia się okno **OAuth client created** z **Client ID** (format `123456789-abc....apps.googleusercontent.com`) i **Client secret** (zwykle zaczyna się od `GOCSPX-`).
- **Od razu kliknij Download JSON** i zapisz plik w bezpiecznym miejscu, np. w menedżerze haseł. **Nie commituj go do repozytorium.**
- **⚠ Do potwierdzenia:** w nowym interfejsie Google Auth Platform pełny sekret może być widoczny **tylko raz, przy tworzeniu**. Później w szczegółach klienta widać tylko jego fragment. Nie udało mi się tego potwierdzić w oficjalnej dokumentacji, ale tak opisują to aktualne instrukcje zewnętrzne. Jeśli zgubisz sekret: **Clients** → Twój klient → sekcja **Client secrets** → **Add secret** (nowy sekret), zaktualizuj `GOOGLE_CLIENT_SECRET`, a potem wyłącz lub usuń stary (**Disable** / **Delete**).
- **Client ID** jest zawsze widoczny na liście **Clients**.

**Jak sprawdzić:** w pobranym JSON jest klucz `"web"`, a w nim `client_id`, `client_secret`, `redirect_uris`.

### A12. Zakresy (scopes) w Data Access

1. **Data Access** (https://console.cloud.google.com/auth/scopes) → **Add or remove scopes**.
2. W panelu po prawej zaznacz z listy albo wpisz w polu **Manually add scopes** (na dole panelu) i kliknij **Add to table**:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/gmail.modify`

   Jeśli `gmail.modify` nie pojawia się na liście, upewnij się, że Gmail API jest włączone (A4).
3. Kliknij **Update**, potem **Save**.

Konsola pogrupuje zakresy w tabele **non-sensitive scopes**, **sensitive scopes** i **restricted scopes**. `gmail.modify` trafi do **restricted**.

**Dlaczego takie zakresy:**

| Zakres | Klasyfikacja | Po co |
|---|---|---|
| `openid`, `email`, `profile` | non-sensitive | Logowanie: identyfikator, adres i imię użytkownika |
| `https://www.googleapis.com/auth/gmail.modify` | **restricted** ([lista restricted scopes](https://support.google.com/cloud/answer/13464325)) | Cała funkcjonalność klienta poczty |

Aplikacja prosi o te zakresy **w dwóch krokach**, co jest zgodne z zaleceniem „incremental authorization”:
1. **Logowanie** prosi tylko o `openid email profile`.
2. **Connect Gmail** to osobna zgoda wyłącznie na `gmail.modify`, z `include_granted_scopes=true`. Zob. [OAuth 2.0 for Web Server Apps](https://developers.google.com/identity/protocols/oauth2/web-server) i [granular permissions](https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions).

**Co obejmuje `gmail.modify`.** Oficjalny opis zakresu ([Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)) to „Read, compose, and send emails from your Gmail account”: wszystkie operacje odczytu i zapisu **oprócz natychmiastowego, trwałego usuwania** wiadomości z pominięciem kosza. W praktyce emailto.chat korzysta z:
- odczytu wiadomości i wątków: `users.messages.get/list`, `users.threads.get/list`,
- wysyłania: `users.messages.send`,
- wersji roboczych: `users.drafts.create/update/delete/send`,
- zmiany etykiet, czyli przeczytane/nieprzeczytane (`UNREAD`), gwiazdka (`STARRED`) i archiwizacja (zdjęcie `INBOX`): `users.messages.modify`, `users.threads.modify`,
- przenoszenia do kosza i z kosza: `messages.trash/untrash`,
- historii zmian: `users.history.list`,
- powiadomień push: `users.watch` / `users.stop`,
- załączników: `users.messages.attachments.get`,
- adresów nadawcy: `users.settings.sendAs.list` (tylko odczyt).

**Czego `gmail.modify` NIE robi:**
- trwałego usuwania (`users.messages.delete`, `users.messages.batchDelete`, `users.threads.delete`), które wymaga `https://mail.google.com/`,
- zmian ustawień skrzynki (filtry, przekierowania, tworzenie aliasów `sendAs`), które wymagają `gmail.settings.basic` / `gmail.settings.sharing`,
- dostępu przez IMAP/SMTP/POP.

Świadomie **nie prosimy o `https://mail.google.com/`** (pełny dostęp). Google zaleca prosić o najwęższy zakres, który wystarcza, a `mail.google.com` należy wybierać tylko wtedy, gdy aplikacja musi trwale kasować wiadomości z pominięciem kosza ([Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)).

> ⚠ Przypisanie konkretnych metod do zakresów sprawdzałem w źródłach pośrednich (strony referencyjne metod Gmail API mają sekcję „Authorization scopes”). Przed złożeniem wniosku o weryfikację zajrzyj do referencji każdej używanej metody: https://developers.google.com/workspace/gmail/api/reference/rest.

**Konsekwencje tego, że `gmail.modify` jest restricted** (rozwinięte w części D):
- W trybie Testing wszystko działa dla test users (do 100 osób) bez weryfikacji, ale tokeny wygasają co 7 dni.
- Publiczna aplikacja wymaga **weryfikacji OAuth dla restricted scopes**: polityka prywatności, uzasadnienie zakresu, film demo i weryfikacja domeny.
- Wymagana jest też **coroczna ocena bezpieczeństwa CASA** wykonywana przez autoryzowane laboratorium i płatna przez Ciebie.
- Bez weryfikacji aplikacja „In production” pokazuje ekran „unverified app” i ma **dożywotni limit 100 nowych użytkowników** ([Manage App Audience](https://support.google.com/cloud/answer/15549945)).

### A13. Zmienne środowiskowe (plik `.env` dla localhost)

Utwórz `emailto-chat/.env`. Plik **nie może trafić do gita**, więc sprawdź, czy `.env` jest w `.gitignore`.

Wygeneruj sekrety:
```bash
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
openssl rand -base64 48   # SESSION_SECRET
openssl rand -hex 32      # CRON_SECRET
```

Przykładowy `.env`:
```dotenv
# --- Aplikacja ---
APP_URL=http://localhost:3000

# --- Baza danych (lokalny Docker z kroku 0) ---
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres?schema=public

# --- Google OAuth (z kroku A11) ---
GOOGLE_CLIENT_ID=<twoj-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<twoj-client-secret>

# --- Sekrety aplikacji ---
TOKEN_ENCRYPTION_KEY=wklej_wynik_openssl_rand_base64_32
SESSION_SECRET=wklej_wynik_openssl_rand_base64_48
CRON_SECRET=wklej_wynik_openssl_rand_hex_32

# --- Opcjonalne: Pub/Sub (część B; lokalnie zwykle puste) ---
# GMAIL_PUBSUB_TOPIC=projects/emailto-chat/topics/gmail-push
# PUBSUB_SERVICE_ACCOUNT_EMAIL=gmail-push-invoker@emailto-chat.iam.gserviceaccount.com
# PUBSUB_AUDIENCE=https://emailto.chat/api/webhooks/gmail
# PUBSUB_VERIFICATION_TOKEN=wklej_wynik_openssl_rand_hex_32

# --- Opcjonalne: limity ---
# MAX_BACKFILL_THREADS=1500
# MAX_UPLOAD_MB=20
```

Uwagi:
- **`TOKEN_ENCRYPTION_KEY`** szyfruje tokeny Google w bazie. **Nie zmieniaj go po uruchomieniu produkcji**, bo zapisane tokeny staną się nieczytelne i użytkownicy będą musieli ponownie połączyć Gmaila.
- **`SESSION_SECRET`**: jego zmiana wyloguje wszystkich użytkowników.
- **Lokalnie i produkcyjnie używaj RÓŻNYCH wartości sekretów.**

### A14. Jak sprawdzić połączenie

1. `npm run dev` → otwórz http://localhost:3000 → **Zaloguj się przez Google**. Pierwszy ekran zgody dotyczy samego logowania (imię, e-mail).
2. W aplikacji kliknij **Connect Gmail**. Ponieważ aplikacja jest w trybie Testing, Google pokaże ostrzeżenie **„Google hasn't verified this app”**. Jako test user kliknij **Continue**. W starszym wariancie tego ekranu trzeba kliknąć **Advanced** → **Go to emailto.chat (unsafe)**.
3. Na ekranie zgody na dostęp do Gmaila **zaznacz checkbox** przy uprawnieniu Gmaila, jeśli jest widoczny, i kliknij **Continue**.

   Przy prośbie o jeden zakres spoza logowania Google zwykle nie pokazuje osobnych checkboxów ([granular permissions](https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions)). Mogą się jednak pojawić przy łączeniu kilku zakresów. Aplikacja zawsze sprawdza pole `scope` w odpowiedzi tokenowej.
4. Po powrocie powinieneś trafić do `/app` z listą osób. Pierwsza synchronizacja jest progresywna, więc lista się dopełnia.

**Jak sprawdzić, że się udało:**
- `/app/settings` pokazuje połączony adres Gmail i status synchronizacji.
- `GET /api/sync` (w zalogowanej przeglądarce: http://localhost:3000/api/sync) zwraca JSON ze statusem.
- Na https://myaccount.google.com/connections (lista „Third-party apps & services”) widać `emailto.chat` z dostępem do Gmaila.

**Typowe błędy w tym kroku:**

| Komunikat | Przyczyna | Naprawa |
|---|---|---|
| `Error 400: redirect_uri_mismatch` | URI w żądaniu ≠ URI w **Authorized redirect URIs** | Porównaj co do znaku (http/https, port, `www`, końcowy `/`). Sprawdź, czy `APP_URL` w `.env` jest poprawne. Odczekaj kilka minut po zmianie. |
| `Error 403: access_denied`, „emailto.chat has not completed the Google verification process” | Konto nie jest na liście **Test users** | **Audience** → **Test users** → **Add users** |
| `Error 401: invalid_client` / „The OAuth client was not found” | Zły `GOOGLE_CLIENT_ID` lub `GOOGLE_CLIENT_SECRET` (literówka, spacja, sekret z innego klienta, klient usunięty, sekret wyłączony) | Skopiuj ponownie. Jeśli sekret zgubiony, dodaj nowy (A11). Zrestartuj `npm run dev`. |
| Logowanie działa, ale aplikacja mówi, że brak dostępu do Gmaila | Użytkownik odznaczył checkbox Gmaila albo anulował drugi ekran | Kliknij **Connect Gmail** ponownie i zaznacz uprawnienie. Aplikacja sprawdza zakresy w odpowiedzi tokenowej. |
| `invalid_grant` po ~7 dniach | Wygasł refresh token w trybie Testing (D3) | Połącz Gmaila ponownie. Docelowo rozwiązuje to publikacja i weryfikacja. |
| „Gmail API has not been used in project … or it is disabled” | Gmail API nie jest włączone w **tym** projekcie | A4 (i sprawdź, czy klient OAuth jest w tym samym projekcie) |

---

## B. Synchronizacja Gmail (Pub/Sub) — OPCJONALNE

> **Do startu lokalnego i pierwszego wdrożenia NIE potrzebujesz Pub/Sub.** Bez niego aplikacja synchronizuje się:
> - przy otwarciu,
> - co około 45 s, dopóki jest otwarta (polling `POST /api/sync` z Gmail History API),
> - raz dziennie przez Vercel Cron.
>
> Pub/Sub to etap produkcyjny dla aktualizacji „prawie w czasie rzeczywistym”, gdy aplikacja jest zamknięta.
> Push wymaga **publicznego adresu HTTPS**, więc na `localhost` nie zadziała bez tunelu (np. ngrok czy Cloudflare Tunnel). Ten rozdział zakłada produkcję pod `https://emailto.chat`.

Oficjalny przewodnik: [Gmail API — Push Notifications](https://developers.google.com/workspace/gmail/api/guides/push).

Jak to działa: Gmail publikuje do Twojego tematu Pub/Sub informację „coś się zmieniło w skrzynce X” (`emailAddress` + `historyId`). Pub/Sub wysyła ją jako `POST` na `https://emailto.chat/api/webhooks/gmail`. Aplikacja weryfikuje nadawcę, a potem wywołuje `users.history.list` i pobiera zmiany.

### B1. Konfiguracja Pub/Sub (włączenie API)

1. https://console.cloud.google.com/apis/library/pubsub.googleapis.com → **Enable**.

CLI:
```bash
gcloud config set project emailto-chat
gcloud services enable pubsub.googleapis.com
```

**Jak sprawdzić:** w **☰** → **Pub/Sub** → **Topics** widzisz pustą listę z przyciskiem **Create topic**, bez komunikatu o wyłączonym API.

### B2. Temat (topic)

1. **☰** → **Pub/Sub** → **Topics** → **+ Create topic**.
2. **Topic ID**: `gmail-push`.
3. Odznacz **Add a default subscription**, bo subskrypcję typu push utworzymy ręcznie w B4. Pozostałe opcje zostaw domyślne → **Create**.

Pełna nazwa tematu to `projects/<project-id>/topics/gmail-push`. Ustaw ją jako `GMAIL_PUBSUB_TOPIC`.

CLI:
```bash
gcloud pubsub topics create gmail-push
```

**Jak sprawdzić:** `gcloud pubsub topics list` pokazuje `projects/emailto-chat/topics/gmail-push`.

### B3. Uprawnienie publikacji dla Gmaila

Gmail publikuje powiadomienia jako konto systemowe **`gmail-api-push@system.gserviceaccount.com`**. Musi ono mieć rolę **Pub/Sub Publisher** (`roles/pubsub.publisher`) **na temacie** ([Push Notifications — Grant publish rights](https://developers.google.com/workspace/gmail/api/guides/push)).

1. **Pub/Sub** → **Topics** → kliknij `gmail-push`. Możesz też zaznaczyć checkbox tematu i otworzyć panel **Permissions** po prawej (**Show info panel**).
2. **Add principal**:
   - **New principals**: `gmail-api-push@system.gserviceaccount.com`
   - **Role**: **Pub/Sub** → **Pub/Sub Publisher**
   - Kliknij **Save**.

CLI:
```bash
gcloud pubsub topics add-iam-policy-binding gmail-push \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

> Jeśli projekt należy do organizacji Google Workspace z polityką **Domain restricted sharing** (`iam.allowedPolicyMemberDomains`), dodanie konta spoza domeny może zostać zablokowane. Wtedy administrator organizacji musi dodać wyjątek dla tego projektu. Prywatnego projektu bez organizacji to nie dotyczy.

**Jak sprawdzić:**
```bash
gcloud pubsub topics get-iam-policy gmail-push
```
Wynik powinien zawierać `gmail-api-push@system.gserviceaccount.com` z `roles/pubsub.publisher`.

### B4. Subskrypcja push z uwierzytelnieniem

**1. Konto serwisowe do podpisywania żądań push.** Pub/Sub dołącza do każdego żądania token OIDC (JWT) podpisany przez Google. Token ma pole `email` równe temu kontu i `aud` równe audience. Aplikacja sprawdza oba pola, dzięki czemu wie, że `POST` naprawdę przyszedł z Twojej subskrypcji ([Authenticate push subscriptions](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions)).

- **☰** → **IAM & Admin** → **Service Accounts** → **+ Create service account**.
- **Service account name**: `gmail-push-invoker` → **Create and continue**.
- Rola nie jest potrzebna. Kliknij **Continue** → **Done**.
- Zapisz e-mail konta, np. `gmail-push-invoker@emailto-chat.iam.gserviceaccount.com`. To będzie `PUBSUB_SERVICE_ACCOUNT_EMAIL`.
- **Nie twórz kluczy JSON** dla tego konta, bo nie są potrzebne.

```bash
gcloud iam service-accounts create gmail-push-invoker --display-name="Gmail push invoker"
```

Uprawnienia pomocnicze ([Authenticate push subscriptions](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions)):
- Osoba tworząca subskrypcję potrzebuje `iam.serviceAccounts.actAs` na tym koncie. Właściciel projektu ma je domyślnie.
- Agent usługi Pub/Sub (`service-<PROJECT_NUMBER>@gcp-sa-pubsub.iam.gserviceaccount.com`) musi mieć prawo tworzenia tokenów dla tego konta (rola **Service Account Token Creator**, `roles/iam.serviceAccountTokenCreator`). **⚠ Niezweryfikowane:** według mojej wiedzy w projektach utworzonych po kwietniu 2021 jest to nadane domyślnie, ale nie potwierdziłem tego w aktualnej dokumentacji. Jeśli push zwraca błędy autoryzacji tokenu, nadaj tę rolę:
  ```bash
  PROJECT_NUMBER=$(gcloud projects describe emailto-chat --format='value(projectNumber)')
  gcloud iam service-accounts add-iam-policy-binding \
    gmail-push-invoker@emailto-chat.iam.gserviceaccount.com \
    --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountTokenCreator"
  ```

**2. Subskrypcja.**

- **Pub/Sub** → **Subscriptions** → **+ Create subscription**:
  - **Subscription ID**: `gmail-push-sub`
  - **Select a Cloud Pub/Sub topic**: `projects/emailto-chat/topics/gmail-push`
  - **Delivery type**: **Push**
  - **Endpoint URL**: `https://emailto.chat/api/webhooks/gmail`. Jeśli używasz dodatkowego sekretu, dopisz go: `https://emailto.chat/api/webhooks/gmail?token=<PUBSUB_VERIFICATION_TOKEN>`.
  - Zaznacz **Enable authentication**:
    - **Service account**: `gmail-push-invoker@…`
    - **Audience**: `https://emailto.chat/api/webhooks/gmail`, czyli **dokładnie** wartość `PUBSUB_AUDIENCE`.
    - **Ważne:** jeśli zostawisz Audience puste, Pub/Sub użyje całego URL endpointu, **razem z `?token=...`**. Wtedy `aud` nie zgodzi się z domyślnym `PUBSUB_AUDIENCE` i aplikacja odrzuci żądanie.
  - **Expiration period**: **Never expire**. Domyślnie nieużywana subskrypcja wygasa po 31 dniach bezczynności.
  - **Acknowledgement deadline**: `30` sekund (domyślnie 10 s, maksymalnie 600 s). Dla push to czas, w jakim endpoint musi odpowiedzieć kodem 2xx. Aplikacja powinna szybko potwierdzić (200/204) i przetwarzać zmiany sprawnie.
  - **Message retention duration**: domyślnie 7 dni, może tak zostać.
  - **Retry policy**: **Retry after exponential backoff delay**, minimum `10` s, maksimum `600` s. Przy błędzie (kod spoza 2xx albo timeout) Pub/Sub ponawia dostarczenie.
  - **Dead lettering**: niepotrzebne na start.
- Kliknij **Create**.

CLI (całość):
```bash
gcloud pubsub subscriptions create gmail-push-sub \
  --topic=gmail-push \
  --push-endpoint="https://emailto.chat/api/webhooks/gmail?token=${PUBSUB_VERIFICATION_TOKEN}" \
  --push-auth-service-account="gmail-push-invoker@emailto-chat.iam.gserviceaccount.com" \
  --push-auth-token-audience="https://emailto.chat/api/webhooks/gmail" \
  --ack-deadline=30 \
  --min-retry-delay=10s --max-retry-delay=600s \
  --expiration-period=never
```
Jeśli nie używasz `?token=`, usuń tę część z `--push-endpoint`.

Format żądania, które otrzyma aplikacja ([Push Notifications](https://developers.google.com/workspace/gmail/api/guides/push)):
```json
{
  "message": {
    "data": "<base64 z {\"emailAddress\":\"user@gmail.com\",\"historyId\":\"1234567\"}>",
    "messageId": "…",
    "publishTime": "…"
  },
  "subscription": "projects/emailto-chat/subscriptions/gmail-push-sub"
}
```
Nagłówek: `Authorization: Bearer <JWT od Google>`.

Zmienne w Vercel (C6):
```dotenv
GMAIL_PUBSUB_TOPIC=projects/emailto-chat/topics/gmail-push
PUBSUB_SERVICE_ACCOUNT_EMAIL=gmail-push-invoker@emailto-chat.iam.gserviceaccount.com
PUBSUB_AUDIENCE=https://emailto.chat/api/webhooks/gmail
PUBSUB_VERIFICATION_TOKEN=<openssl rand -hex 32>   # opcjonalnie
```

**Jak sprawdzić:**
- `gcloud pubsub subscriptions describe gmail-push-sub` pokazuje `pushConfig.pushEndpoint`, `oidcToken.serviceAccountEmail` i `oidcToken.audience`.
- W konsoli: **Subscriptions** → `gmail-push-sub` → zakładka **Metrics** (po pierwszych wiadomościach).

### B5. Odnowienie `watch` (7 dni)

- Aplikacja wywołuje `users.watch` z `topicName = GMAIL_PUBSUB_TOPIC` dla każdego połączonego konta. Odpowiedź zawiera `historyId` i `expiration` ([users.watch](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch)).
- Google: watch trzeba odnawiać **co najmniej raz na 7 dni**, a zalecane jest **raz dziennie**. Gdy watch wygaśnie, powiadomienia po prostu przestają przychodzić, bez żadnego błędu ([Push Notifications — Renewing mailbox watch](https://developers.google.com/workspace/gmail/api/guides/push)).
- W emailto.chat robi to **Vercel Cron `GET /api/cron/sync` raz dziennie** (C7). Oprócz odnowienia `watch` cron wykonuje też synchronizację przyrostową.
- Ręczne wywołanie (np. po zmianie konfiguracji), tylko na produkcji:
  ```bash
  curl -i -H "Authorization: Bearer $CRON_SECRET" https://emailto.chat/api/cron/sync
  ```
- Pierwsze udane `users.watch` od razu publikuje jedno powiadomienie do tematu, co jest wygodnym testem.
- `historyId` jest zwykle ważny co najmniej tydzień, ale może wygasnąć szybciej. Wtedy `history.list` zwraca 404, a aplikacja musi zrobić pełną ponowną synchronizację ([users.history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)).

### B6. Test nowej wiadomości

1. Upewnij się, że w Vercel ustawiono `GMAIL_PUBSUB_TOPIC` i pozostałe zmienne z B4 i że **zrobiłeś redeploy** (zmiany zmiennych działają dopiero w nowym deploymencie).
2. Wywołaj cron ręcznie (curl z B5) albo poczekaj na dzienny, żeby zarejestrować `watch`.
3. **Zamknij** kartę emailto.chat, żeby polling nie maskował wyniku.
4. Z innego konta, np. z telefonu, wyślij sobie e-mail.
5. **Vercel** → projekt → **Logs**: w ciągu kilku sekund powinien pojawić się `POST /api/webhooks/gmail` z kodem `200` lub `204`.
6. Otwórz https://emailto.chat/app. Rozmowa z nadawcą powinna już mieć nową wiadomość na górze.
7. W Google Cloud: **Pub/Sub** → **Subscriptions** → `gmail-push-sub` → **Metrics**, wykres „Push requests” lub „Delivery” z kodami odpowiedzi.

**Diagnostyka:**
- **401/403 w logach Vercel**: niezgodne `aud` (Audience ≠ `PUBSUB_AUDIENCE`), inny e-mail konta serwisowego albo zły `?token=`.
- **Brak żądań w ogóle**: brak roli Publisher dla `gmail-api-push@…` (B3), watch niezarejestrowany albo wygasły (B5), zła nazwa tematu w `GMAIL_PUBSUB_TOPIC`.
- **Żądania trafiają na `www`** albo dostają **3xx**: endpoint musi być dokładnie `https://emailto.chat/...`, bez przekierowań.

---

## C. Wdrożenie na Vercel

### C1. Import z GitHuba, Root Directory

1. https://vercel.com → **Sign Up / Log In** (najprościej **Continue with GitHub**).
2. **Add New…** → **Project** → **Import Git Repository**. Jeśli Vercel nie widzi repozytorium, kliknij **Adjust GitHub App Permissions** / **Configure GitHub App** i nadaj dostęp do `mczyzewski-lang/kontener`.
3. Przy `kontener` kliknij **Import**.
4. Na ekranie **Configure Project**:
   - **Root Directory** → **Edit** → wybierz `emailto-chat` → **Continue**. To kluczowe, bo kod aplikacji jest w podkatalogu.
   - **Framework Preset**: **Next.js** (wykrywane automatycznie).
   - **Build and Output Settings** → **Build Command** → włącz **Override** i wpisz:
     ```
     npx prisma migrate deploy && npm run build
     ```
     `npm run build` to `prisma generate && next build`. Dopisanie `prisma migrate deploy` stosuje migracje przy każdym deployu (C5).
   - **Environment Variables**: możesz je dodać od razu (C6) albo później.
5. Kliknij **Deploy**.

Później te ustawienia są w **Project** → **Settings** → **Build and Deployment** (Root Directory, Build Command, wersja Node.js). **⚠** Starsze wersje panelu miały je w zakładce **General**. Nazwa sekcji mogła się zmienić.

**Jak sprawdzić:** deployment ma status **Ready**, a adres `https://<projekt>.vercel.app` otwiera stronę główną. Pierwszy deploy może się nie udać, jeśli brakuje `DATABASE_URL`. To normalne: dodaj zmienne (C5, C6) i kliknij **Redeploy**.

### C2. Domena emailto.chat

1. **Project** → **Settings** → **Domains** → **Add Domain** → wpisz `emailto.chat` → **Add**.
2. Vercel zaproponuje dodanie również `www.emailto.chat` z przekierowaniem. Wybierz wariant, w którym **`emailto.chat` jest główną domeną**, a **`www.emailto.chat` przekierowuje** (308) na `emailto.chat`. Redirect URI OAuth i endpoint Pub/Sub są na domenie bez `www`.
3. Vercel pokaże rekordy DNS do ustawienia u Twojego rejestratora domeny. Według dokumentacji ([Set up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain)) wyglądają mniej więcej tak:

   | Typ | Nazwa (Host) | Wartość |
   |---|---|---|
   | `A` | `@` (apex, `emailto.chat`) | wartość pokazana na karcie domeny; ogólna wartość to `76.76.21.21`, nowsze projekty mogą dostać inny adres z puli, np. `216.198.79.1` |
   | `CNAME` | `www` | wartość z karty domeny, np. `cname.vercel-dns.com` lub adres w formacie `xxxx.vercel-dns-0xx.com` |

   **Zawsze używaj dokładnie tych wartości, które Vercel wyświetla na karcie domeny** (albo `vercel domains inspect emailto.chat`). Vercel zmienia przydział adresów, a opisane wyżej wartości są przykładowe ([A records](https://vercel.com/kb/guide/a-record-and-caa-with-vercel)).
4. Alternatywa: zmień **nameservery** domeny na Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). Wtedy Vercel sam zarządza rekordami. Pamiętaj, że rekordy poczty (MX) i weryfikacji (TXT) musisz wtedy dodać w Vercel.
5. Usuń u rejestratora stare rekordy `A` / `AAAA` dla `@` i `www`, które wskazują gdzie indziej (np. stronę parkingową rejestratora).

**Jak sprawdzić:**
- Karta domeny w Vercel pokazuje **Valid Configuration** (zielone) dla obu domen.
- `dig +short emailto.chat` zwraca adres podany przez Vercel.
- `curl -I https://www.emailto.chat` zwraca `308` z `location: https://emailto.chat/`.

Propagacja DNS trwa zwykle od kilku minut do kilku godzin.

### C3. HTTPS

HTTPS jest **automatyczny**: Vercel wystawia i odnawia certyfikat (Let's Encrypt), gdy DNS wskazuje na Vercel. Nic nie musisz klikać. Jeśli w DNS masz rekordy **CAA**, muszą zezwalać na `letsencrypt.org` ([A record and CAA with Vercel](https://vercel.com/kb/guide/a-record-and-caa-with-vercel)).

**Jak sprawdzić:** https://emailto.chat ma kłódkę w przeglądarce, a `curl -I http://emailto.chat` przekierowuje na `https://`.

### C4. Produkcyjny redirect URI

W Google Cloud → **Google Auth Platform** → **Clients** → Twój klient upewnij się, że są wpisane:
- **Authorized JavaScript origins**: `https://emailto.chat`
- **Authorized redirect URIs**: `https://emailto.chat/api/auth/google/callback`

Kliknij **Save**. W Vercel `APP_URL=https://emailto.chat`, bez końcowego `/`.

Możesz używać **tego samego** klienta dla localhost i produkcji (oba URI na liście). Jeśli wolisz oddzielić środowiska, utwórz drugi klient. Oba klienty w tym samym projekcie dzielą ekran zgody i status weryfikacji.

> Preview deploymenty Vercel (`*.vercel.app`) **nie zadziałają** z logowaniem Google. Ich adres jest zmienny i nie można go dodać na stałe jako redirect URI, a domena `vercel.app` nie jest Twoją zweryfikowaną domeną. Testuj OAuth lokalnie albo na produkcji.

### C5. Baza danych + migracje

**Wybór Postgresa.** Możesz użyć dowolnego hostowanego PostgreSQL. Najprościej przez Vercel Marketplace: **Project** → **Storage** (lub **Integrations**) → **Browse Marketplace** / **Create Database** → np. **Neon** lub **Supabase**. Marketplace oferuje też **Prisma Postgres**. Integracja tworzy bazę i **automatycznie dodaje zmienne środowiskowe** do projektu. **⚠** Nazwy zmiennych zależą od dostawcy: Neon zwykle dodaje `DATABASE_URL`, inni mogą dodawać np. `POSTGRES_URL` / `POSTGRES_PRISMA_URL`. Sprawdź w **Settings** → **Environment Variables**, co zostało dodane, i upewnij się, że istnieje **`DATABASE_URL`** (skopiuj wartość, jeśli trzeba). Region bazy ustaw jak najbliżej regionu funkcji Vercel.

**Pooling połączeń (ważne w serverless).** Funkcje Vercel otwierają wiele krótkich połączeń, więc aplikacja powinna używać **adresu z poolerem**:
- **Neon**: host z sufiksem `-pooler`.
- **Supabase**: „Transaction pooler”, port `6543`, z dopiskiem `?pgbouncer=true` dla Prisma ([Prisma + PgBouncer](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer), [Supabase + Prisma](https://supabase.com/docs/guides/database/prisma)).

**Migracje** (`prisma migrate deploy`) powinny iść przez **połączenie bezpośrednie**, bez poolera w trybie transakcyjnego PgBouncera. W przeciwnym razie mogą pojawić się błędy typu „prepared statement already exists” albo problemy z blokadą migracji. Dwie opcje:
- **Najprościej:** uruchom migracje ręcznie z komputera, podając bezpośredni URL tylko dla tego polecenia:
  ```bash
  cd emailto-chat
  DATABASE_URL="postgresql://…direct-host…/db?sslmode=require" npx prisma migrate deploy
  ```
  Jeśli używasz tej opcji, zostaw w Vercel zwykły Build Command (`npm run build`).
- **Automatycznie przy każdym deployu:** Build Command `npx prisma migrate deploy && npm run build` (C1). Wymaga, żeby `DATABASE_URL` w czasie builda pozwalał na migracje. Neon od PgBouncera 1.22 obsługuje prepared statements, ale i tak zaleca połączenie bezpośrednie do migracji. Docelowo rozważ dodanie w `schema.prisma` pola `directUrl = env("DIRECT_URL")` i osobnej zmiennej `DIRECT_URL`. **To zmiana w kodzie, której ten przewodnik nie wprowadza.**

**Jak sprawdzić:**
- W logach builda Vercel (**Deployments** → deployment → **Building**) widać `All migrations have been successfully applied.` albo `No pending migrations to apply.`.
- Lokalnie możesz uruchomić `DATABASE_URL="…" npx prisma migrate status`.

### C6. Sekrety (Environment Variables)

**Project** → **Settings** → **Environment Variables** → **Add New** (albo **Add Environment Variable**). Dla każdej zmiennej:
- **Key** / **Value**,
- **Environments**: zaznacz **Production**. Preview lub Development tylko, jeśli ich używasz.
- Dla sekretów możesz zaznaczyć **Sensitive**: wartość nie będzie już widoczna w panelu, tylko nadpisywalna ([Environment variables](https://vercel.com/docs/environment-variables)).
- Możesz też wkleić cały blok `KEY=VALUE` z pliku `.env` naraz. Formularz rozpoznaje wiele linii.

Produkcyjny zestaw:
```dotenv
APP_URL=https://emailto.chat
DATABASE_URL=postgresql://…pooled…            # z Neon/Supabase
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…
TOKEN_ENCRYPTION_KEY=<NOWE openssl rand -base64 32>
SESSION_SECRET=<NOWE openssl rand -base64 48>
CRON_SECRET=<NOWE openssl rand -hex 32>
MAX_UPLOAD_MB=4
# opcjonalnie (część B):
GMAIL_PUBSUB_TOPIC=projects/emailto-chat/topics/gmail-push
PUBSUB_SERVICE_ACCOUNT_EMAIL=gmail-push-invoker@emailto-chat.iam.gserviceaccount.com
PUBSUB_AUDIENCE=https://emailto.chat/api/webhooks/gmail
PUBSUB_VERIFICATION_TOKEN=<openssl rand -hex 32>
MAX_BACKFILL_THREADS=1500
```

- **`MAX_UPLOAD_MB=4` na Vercel.** Maksymalny rozmiar ciała żądania i odpowiedzi funkcji Vercel to **4,5 MB**. Większe żądanie kończy się błędem `413 FUNCTION_PAYLOAD_TOO_LARGE`. Limit jest stały, niezależny od planu i nie da się go zmienić w konfiguracji ([Vercel Functions limitations](https://vercel.com/docs/functions/limitations), [How to bypass the body size limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)). Base64 i nagłówki multipart zwiększają rozmiar, stąd zapas: 4 MB na sam plik.
- **Po każdej zmianie zmiennych zrób Redeploy:** **Deployments** → menu **⋯** przy ostatnim deploymencie → **Redeploy**. Zmienne są wczytywane przy deployu.

**Jak sprawdzić:** lista zmiennych zawiera wszystkie klucze dla **Production**. Po redeployu logowanie działa (C8).

### C7. Uruchomienie synchronizacji

Aplikacja ma trzy mechanizmy:

1. **Polling w przeglądarce** działa automatycznie bez konfiguracji. Przy otwarciu i co około 45 s klient wywołuje `POST /api/sync`, a serwer pobiera zmiany przez Gmail History API.
2. **Vercel Cron** służy do odnawiania `watch` i synchronizacji w tle. W `emailto-chat/vercel.json`:
   ```json
   {
     "crons": [
       { "path": "/api/cron/sync", "schedule": "0 5 * * *" }
     ]
   }
   ```
   - Limity planów ([Cron jobs — usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), aktualizacja 2026-01-28):
     - **Hobby**: maksymalnie **raz dziennie**, precyzja godzinowa. Zadanie na 5:00 UTC uruchomi się między 5:00 a 5:59. Wyrażenie częstsze niż raz dziennie **zablokuje deploy**.
     - **Pro**: nawet co minutę.
     - Oba plany: do 100 zadań cron na projekt.
   - Harmonogram jest w **UTC**.
   - **Uwierzytelnienie:** gdy w projekcie istnieje zmienna `CRON_SECRET`, Vercel **automatycznie** wysyła ją przy wywołaniu crona w nagłówku `Authorization: Bearer <CRON_SECRET>` ([Managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)). Endpoint odrzuca żądania bez poprawnego nagłówka.
   - **⚠ Do sprawdzenia w dokumentacji:** według mojej wiedzy cron działa tylko dla **deploymentu produkcyjnego** (nie dla Preview) i **nie podąża za przekierowaniami** (3xx). Nie potwierdziłem obu punktów w aktualnej wersji dokumentacji.
   - Podgląd: **Project** → **Settings** → **Cron Jobs**. Jest tam lista zadań, przycisk **Run** do ręcznego uruchomienia i link do logów.
3. **Pub/Sub** (opcjonalnie, część B) daje powiadomienia prawie w czasie rzeczywistym. Ustaw zmienne z B4 i zrób redeploy. Pierwszy cron (albo ręczne **Run**) zarejestruje `watch`.

**Jak sprawdzić:**
- **Settings** → **Cron Jobs** → **Run** przy `/api/cron/sync` → w **Logs** wpis `GET /api/cron/sync 200`.
- Ręcznie: `curl -i -H "Authorization: Bearer $CRON_SECRET" https://emailto.chat/api/cron/sync` zwraca 200. Bez nagłówka powinno być 401.

### C8. Test działającej aplikacji (checklista)

- [ ] https://emailto.chat ładuje stronę główną, a https://www.emailto.chat przekierowuje na nią.
- [ ] https://emailto.chat/privacy i https://emailto.chat/terms działają bez logowania.
- [ ] https://emailto.chat/demo działa.
- [ ] Logowanie przez Google działa: brak `redirect_uri_mismatch`, a konto jest na liście Test users.
- [ ] **Connect Gmail** → ostrzeżenie „unverified” → **Continue** → zgoda → powrót do `/app`.
- [ ] `/app` pokazuje listę osób, która dopełnia się w trakcie pierwszej synchronizacji.
- [ ] `/app/settings` pokazuje połączony adres i status synchronizacji.
- [ ] `GET https://emailto.chat/api/sync` (w zalogowanej przeglądarce) zwraca JSON ze statusem.
- [ ] Odpowiedź wysłana z aplikacji pojawia się w Gmailu w folderze „Wysłane” / „Sent”.
- [ ] Oznaczenie jako przeczytane, gwiazdka i archiwizacja w aplikacji są widoczne w Gmailu.
- [ ] Załącznik poniżej 4 MB wysyła się poprawnie, a większy daje czytelny komunikat zamiast błędu 413.
- [ ] Nowa wiadomość od kogoś pojawia się w ciągu około 45 s przy otwartej aplikacji, a z Pub/Sub w ciągu kilku sekund.
- [ ] **Settings** → **Cron Jobs** → **Run** zwraca 200.
- [ ] W **Logs** Vercel nie ma błędów 5xx.

---

## D. Publiczny launch i weryfikacja Google

### D1. Testing → In production

**Google Auth Platform** → **Audience** → sekcja **Publishing status** → **Publish app** → potwierdź w oknie dialogowym.

**Co się zmienia** ([Manage App Audience](https://support.google.com/cloud/answer/15549945)):
- Aplikacja przestaje być ograniczona do listy Test users.
- Refresh tokeny przestają wygasać po 7 dniach.
- **Dopóki restricted scope nie zostanie zatwierdzony w weryfikacji**, użytkownicy widzą ekran „Google hasn't verified this app”, a liczba **nowych** użytkowników jest ograniczona do **100 przez cały czas życia projektu**. Tego limitu nie da się zresetować. Ograniczenie znika dopiero po zatwierdzeniu zakresów.

**Zalecenie:** kliknij **Publish app** dopiero wtedy, gdy masz gotowe wszystkie materiały do weryfikacji (D4–D8). Weryfikację uruchamiasz w **Verification Center** (https://console.cloud.google.com/auth/verification). Google wymaga najpierw **opublikowanego brandingu** (weryfikacja marki), a dopiero potem weryfikacji dostępu do danych, czyli zakresów ([Manage App Branding](https://support.google.com/cloud/answer/15549049), [Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)). **Back to testing** cofa publikację.

### D2. Limit 100 test users

Potwierdzone: w trybie Testing można dodać **maksymalnie 100 test users** ([Manage App Audience](https://support.google.com/cloud/answer/15549945)). Usunięcie użytkownika z listy zwalnia miejsce, ale ten użytkownik traci dostęp. Tryb Testing nadaje się do zamkniętej bety. Publiczny launch wymaga D1 + weryfikacji.

### D3. Refresh tokeny w Testing wygasają po 7 dniach

Dokładna reguła ([Using OAuth 2.0 — Refresh token expiration](https://developers.google.com/identity/protocols/oauth2), [Manage App Audience](https://support.google.com/cloud/answer/15549945)):
- Aplikacja z **User type = External** i **Publishing status = Testing** dostaje refresh tokeny ważne **7 dni**.
- **Wyjątek:** reguła **nie** obowiązuje, jeśli aplikacja prosi wyłącznie o podzbiór zakresów name, email i profile (`openid`, `userinfo.email`, `userinfo.profile`).
- emailto.chat prosi o `gmail.modify`, więc **reguła obowiązuje**. Po tygodniu użytkownik zobaczy błąd `invalid_grant` i musi ponownie kliknąć **Connect Gmail**.
- Po przejściu do „In production” tokeny wygasają tylko z typowych przyczyn: cofnięcie dostępu przez użytkownika, około 6 miesięcy nieużywania, zmiana hasła (przy zakresach Gmaila) albo przekroczenie limitu liczby tokenów na klienta i konto.

### D4. Privacy Policy — wymagania Google

Wymagania z [Verification requirements](https://support.google.com/cloud/answer/13464321) i [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy):
- Polityka jest **na tej samej, zweryfikowanej domenie** co strona główna (`https://emailto.chat/privacy`).
- Link na ekranie zgody (**Branding** → **Application privacy policy link**) jest **identyczny** z linkiem na stronie głównej.
- Polityka opisuje, **jak aplikacja uzyskuje dostęp do danych Google użytkownika, jak je wykorzystuje, przechowuje i udostępnia**. Dla emailto.chat konkretnie:
  - które dane z Gmaila trafiają na serwer i do bazy (np. metadane, nagłówki, fragmenty treści, identyfikatory wątków),
  - jak długo są przechowywane,
  - że tokeny są szyfrowane,
  - jak usunąć konto i dane oraz jak cofnąć dostęp (https://myaccount.google.com/connections),
  - że dane nie są sprzedawane ani używane do reklam,
  - które podmioty przetwarzają dane (Vercel, dostawca bazy).
- Praktyki muszą być zgodne z **Limited Use requirements**. Najważniejsze zasady:
  - dane wykorzystywane wyłącznie do funkcji widocznych dla użytkownika,
  - brak transferu poza wyjątkami,
  - **brak reklam**, także spersonalizowanych,
  - **ludzie nie czytają danych** bez wyraźnej zgody użytkownika (wyjątki: bezpieczeństwo, prawo, dane zagregowane i zanonimizowane),
  - zasady obejmują też dane zagregowane, zanonimizowane i pochodne.
- **Oświadczenie Limited Use.** Google oczekuje jawnej deklaracji zgodności z Limited Use, umieszczonej w aplikacji lub na stronie, np. w polityce prywatności podlinkowanej ze strony głównej. Powszechnie stosowane brzmienie, które warto umieścić **dosłownie po angielsku** w `/privacy` (i np. w stopce strony głównej):

  > *emailto.chat's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.*

  **⚠ Niezweryfikowane:** nie znalazłem w aktualnej oficjalnej dokumentacji Google tego zdania jako **obowiązkowego, dosłownego** wzoru. Google podaje podobne brzmienie jako przykład i dopuszcza różne sformułowania, pod warunkiem że deklaracja jest jednoznaczna i widoczna. To zdanie jest standardem branżowym i zostało przyjęte w wielu zweryfikowanych aplikacjach. Samo zdanie nie wystarczy, jeśli reszta polityki mu przeczy.
- Wersja polska strony jest w porządku, ale **recenzent Google czyta po angielsku**. Strona `/privacy` powinna mieć wersję angielską, a Limited Use zdecydowanie po angielsku.

**Strona główna** (`/`) musi ([Verification requirements](https://support.google.com/cloud/answer/13464321)):
- być na zweryfikowanej domenie,
- jasno identyfikować aplikację i opisywać, co robi (np. „emailto.chat turns your Gmail into person-first conversations…”),
- **nie może być samą stroną logowania**,
- zawierać widoczny link do Privacy Policy, identyczny z tym na ekranie zgody.

Dobrą praktyką jest też link do Terms.

### D5. Terms of Service

Google nie wymaga Terms do weryfikacji restricted scopes w takim stopniu jak Privacy Policy, ale pole **Application terms of service link** istnieje w **Branding** i warto je wypełnić: `https://emailto.chat/terms`. Strona musi być publiczna i na tej samej domenie. Treść regulaminu ustal z prawnikiem. Ten przewodnik jej nie obejmuje.

### D6. Weryfikacja domeny (Google Search Console)

Każda domena w **Authorized domains** (czyli `emailto.chat`) musi być zweryfikowana w Google Search Console przez konto, które jest **Owner** lub **Editor** projektu Google Cloud ([Verification requirements](https://support.google.com/cloud/answer/13464321)).

1. Wejdź na https://search.google.com/search-console, zalogowany **tym samym kontem**, które jest właścicielem projektu w Google Cloud.
2. **Add property** (lista rozwijana w lewym górnym rogu) → wybierz typ **Domain** (lewa kolumna) → wpisz `emailto.chat` → **Continue**.
3. Search Console pokaże rekord **TXT**, np. `google-site-verification=AbCdEf…`. Skopiuj go.
4. U rejestratora domeny (albo w Vercel DNS, jeśli używasz nameserverów Vercel: **Domains** → `emailto.chat` → **DNS Records** → **Add**) dodaj rekord:
   - **Type**: `TXT`
   - **Name/Host**: `@` (apex)
   - **Value**: skopiowany ciąg
   - **TTL**: domyślny
5. Wróć do Search Console → **Verify**. Jeśli nie działa, odczekaj (propagacja do 24 h) i spróbuj ponownie.
6. W Google Cloud: **Google Auth Platform** → **Branding** → **Authorized domains**. Domena powinna być widoczna bez ostrzeżeń. Przy weryfikacji Google sprawdzi, czy domena jest zweryfikowana przez członka projektu.

**Jak sprawdzić:** Search Console pokazuje `emailto.chat` z ikoną „Verified owner”. Z linii poleceń: `dig +short TXT emailto.chat` zwraca rekord `google-site-verification=…`.

Nie usuwaj rekordu TXT po weryfikacji, bo Google sprawdza go okresowo.

### D7. Uzasadnienie scopes (justification)

**Ocena: czy węższe zakresy by wystarczyły?** Uczciwa analiza:

| Funkcja emailto.chat | Najwęższy zakres, który ją obsługuje |
|---|---|
| Czytanie wiadomości, wątków, załączników, historii | `gmail.readonly` (**restricted**) |
| Wysyłanie odpowiedzi | `gmail.send` (sensitive) |
| Wersje robocze (create/update/send) | `gmail.compose` (**restricted**) |
| Oznacz jako przeczytane/nieprzeczytane, gwiazdka, archiwizuj (`messages.modify` / `threads.modify`) | **`gmail.modify`** (lub pełny `mail.google.com`); żaden z powyższych tego nie obejmuje |
| `users.watch` (push) | `gmail.readonly` lub `gmail.modify` |

Wnioski:
- **Zestaw `gmail.readonly` + `gmail.send` + `gmail.compose` NIE wystarcza.** Żaden z tych zakresów nie pozwala zmieniać etykiet wiadomości (UNREAD, STARRED, INBOX), czyli „przeczytane”, „gwiazdka” i „archiwizuj”. To podstawowe funkcje skrzynki. (`gmail.labels` pozwala zarządzać definicjami etykiet, ale **nie** ich przypisaniem do wiadomości.)
- Nawet gdyby zrezygnować z tych funkcji, `gmail.readonly` i `gmail.compose` **i tak są restricted**. Węższy zestaw nie zwolniłby z weryfikacji ani z CASA, a dawałby trzy zakresy do uzasadnienia zamiast jednego.
- **Jedyną drogą uniknięcia restricted scopes** byłoby ograniczenie się do samego wysyłania (`gmail.send`). To nie jest klient poczty.
- **Rekomendacja:** pozostać przy **jednym zakresie `gmail.modify`**. To najwęższy pojedynczy zakres pokrywający funkcje aplikacji. Świadomie unikamy `https://mail.google.com/`, który daje trwałe usuwanie, IMAP/SMTP i pełny dostęp.

Gotowy tekst do wklejenia w formularzu weryfikacji (**Data Access** → zakres → pole uzasadnienia / „How will the scopes be used?”):

```text
emailto.chat (https://emailto.chat) is a person-first Gmail client: instead of a list of
threads, it groups the user's own Gmail conversations by the person they are talking to and
presents them as a chat-style timeline. All Gmail data is used solely to provide this
user-facing email client to the signed-in user; it is never used for advertising, sold, or
read by humans.

We request a single Gmail scope, https://www.googleapis.com/auth/gmail.modify, only after the
user explicitly clicks "Connect Gmail" (incremental authorization, separate from sign-in).
It is used for the following user-facing features:

1. Reading mail: users.messages.list/get, users.threads.list/get and
   users.messages.attachments.get to display the user's conversations and attachments,
   grouped by person.
2. Replying and composing: users.messages.send to send replies and new emails, and
   users.drafts.create/update/delete/send so unsent replies are saved as Gmail drafts and stay
   in sync with Gmail.
3. Managing messages: users.messages.modify / users.threads.modify to mark conversations as
   read/unread, star/unstar, and archive (remove the INBOX label), and messages.trash/untrash
   to move items to Trash. These actions mirror standard Gmail behavior so the user's mailbox
   stays consistent across emailto.chat and Gmail.
4. Keeping the app in sync: users.history.list for incremental sync and users.watch for
   Gmail push notifications via Cloud Pub/Sub, so new mail appears without a full re-download.
5. Sender identity: users.settings.sendAs.list (read-only) so replies are sent from the
   correct address/alias.

Why narrower scopes are insufficient: gmail.readonly cannot send or change message state;
gmail.send and gmail.compose cannot read the mailbox or change labels; gmail.labels manages
label definitions but cannot apply UNREAD/STARRED/INBOX to messages. Marking read/unread,
starring and archiving require users.messages.modify, which is only available with
gmail.modify or the full https://mail.google.com/ scope. Combining gmail.readonly +
gmail.send + gmail.compose would still be restricted scopes and still could not archive or
mark messages read. gmail.modify is therefore the narrowest single scope that supports the
app's core functionality.

We deliberately do NOT request https://mail.google.com/: emailto.chat never permanently
deletes mail (only Trash, which is recoverable) and does not use IMAP/SMTP/POP.
```

Dostosuj punkty 1–5 do faktycznie używanych metod. Jeśli któraś funkcja, np. drafty, jeszcze nie istnieje, usuń ją, bo recenzent porównuje uzasadnienie z filmem.

### D8. Film demonstracyjny

Wymagania według [Demo Video](https://support.google.com/cloud/answer/13804565) i [General Guidance](https://support.google.com/cloud/answer/13804963):
- **Hosting**: publicznie dostępny link, np. **YouTube jako „Unlisted”** (niepubliczny) albo publiczny plik na Google Drive. Link wklejasz w formularzu weryfikacji.
- **Język ekranu zgody: angielski.** Na ekranie Google jest przełącznik języka w **lewym dolnym rogu**. Ustaw „English (United States)”. Aplikację najlepiej też pokazać po angielsku.
- Film ma pokazać **pełny przepływ end-to-end**, w tym **proces nadawania zgody OAuth**. Jeśli aplikacja ma kilka osobnych przepływów zgody (u nas: logowanie, a potem **Connect Gmail**), pokaż **każdy**.
- Na ekranie zgody muszą być widoczne **dokładnie te zakresy, które zgłaszasz** do weryfikacji.
- Pokaż **każdą funkcję, która korzysta z każdego zgłoszonego zakresu**.
- **Client ID w pasku adresu.** Pokaż pasek adresu przeglądarki z URL `accounts.google.com/...` zawierającym `client_id=…`, żeby recenzent mógł porównać go z projektem. **⚠** Tego wymogu nie znalazłem dosłownie w oficjalnej dokumentacji. Pochodzi z wytycznych zewnętrznych i z praktyki recenzentów, ale zdecydowanie warto go spełnić.
- Zalecana **narracja głosowa lub napisy**, które objaśniają, co się dzieje.

**Scenariusz filmu emailto.chat (około 3–5 minut, po angielsku):**
1. Strona główna https://emailto.chat (widoczna domena, opis aplikacji, link do Privacy Policy). Kliknij Privacy Policy i pokaż sekcję Limited Use.
2. Przed nagraniem cofnij dostęp na https://myaccount.google.com/connections, żeby ekran zgody pojawił się w całości.
3. **Sign in with Google**. Pokaż pasek adresu z `client_id` i ekran zgody (name, email, profile) po angielsku.
4. **Connect Gmail**. Ponownie pokaż pasek adresu z `client_id`, ekran zgody z uprawnieniem Gmail („Read, compose, and send emails…”) i **Continue**.
5. Dla `gmail.modify` pokaż po kolei:
   - listę osób i otwarcie rozmowy (odczyt, załącznik),
   - odpowiedź i jej pojawienie się w Gmailu w „Sent” (wysyłanie),
   - zapis wersji roboczej (drafts),
   - oznaczenie jako przeczytane i gwiazdkę oraz efekt w Gmailu,
   - archiwizację i efekt w Gmailu (zniknięcie z Inbox),
   - przyjście nowego e-maila, który pojawia się w aplikacji (history / push).
6. Pokaż `/app/settings`: połączone konto, odłączenie Gmaila, usunięcie konta i danych.

### D9. Kiedy restricted scopes wymagają weryfikacji

Ogólna zasada ([OAuth app verification](https://support.google.com/cloud/answer/13464321), [Production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)): **każda aplikacja „In production” z typem External, która prosi o zakresy sensitive lub restricted, musi przejść weryfikację**. Dla restricted dochodzi coroczna ocena bezpieczeństwa (D10).

**Sytuacje, w których weryfikacja nie jest wymagana** ([Manage App Audience](https://support.google.com/cloud/answer/15549945)):
- **Publishing status = Testing**: maksymalnie 100 test users, ostrzeżenie „unverified” i refresh tokeny ważne 7 dni. Tak może działać prywatny projekt lub zamknięta beta.
- **User type = Internal**: tylko użytkownicy Twojej organizacji Google Workspace. Weryfikacja nie jest wymagana. Nie dotyczy publicznej aplikacji ani kont @gmail.com.
- **Aplikacja „In production”, ale niezweryfikowana**: działa z ekranem „unverified app” i **dożywotnim limitem 100 nowych użytkowników** dla niezatwierdzonych zakresów sensitive i restricted. Nie nadaje się do publicznego launchu.
- **Użytek osobisty.** **⚠ Niezweryfikowane:** Google wymieniał wcześniej wyjątek dla aplikacji „for personal use” (gdy jedynym użytkownikiem jest deweloper lub mała grupa znanych mu osób). Nie potwierdziłem jego aktualnej treści. W praktyce tryb Testing pokrywa ten scenariusz.

**Wniosek dla emailto.chat:** publiczny launch dla dowolnych użytkowników Gmaila = **pełna weryfikacja restricted scope + CASA**. Do tego czasu możesz działać w trybie Testing z maksymalnie 100 zaproszonymi testerami.

### D10. Kiedy potrzebny jest niezależny security assessment (CASA)

Fakty z oficjalnych źródeł ([Security Assessment](https://support.google.com/cloud/answer/13465431), [Annual Recertification](https://support.google.com/cloud/answer/13463816), [Restricted scopes](https://support.google.com/cloud/answer/13464325)):
- **Aplikacje używające restricted scopes muszą przejść ocenę bezpieczeństwa.** Google korzysta z frameworka **CASA** (Cloud Application Security Assessment) w ramach **App Defense Alliance** (https://appdefensealliance.dev/casa).
- **Poziom (tier) wyznacza Google** na podstawie ryzyka: liczby użytkowników, zakresów i innych cech aplikacji. Tier 2 może być wykonany częściowo przez dewelopera (skanowanie) z walidacją przez autoryzowane laboratorium. Tier 3 to pełne testy wykonywane przez autoryzowane laboratorium. Aplikacja zwalidowana raz na Tier 3 pozostaje na Tier 3 w kolejnych latach.
- **Ocena co 12 miesięcy**, liczonych od daty poprzedniego **Letter of Validation (LOV)**. Coroczna ponowna ocena jest **pełna, niezależnie od tego, czy aplikacja się zmieniła**. Google przypomina mailowo właścicielom i edytorom projektu, więc dbaj o aktualne kontakty w IAM.
- Google kontaktuje się w sprawie oceny **po** spełnieniu pozostałych wymagań weryfikacji (branding, polityka, film, uzasadnienie).
- **Koszt ponosi deweloper** i płaci go laboratorium, nie Google. Cennik ustala laboratorium. Oficjalnych cen Google nie publikuje. Źródła nieoficjalne podają kwoty od kilkuset do kilku tysięcy USD rocznie, zależnie od tieru i laboratorium. **Nie traktuj tego jako wiążącego** i poproś o wyceny autoryzowane laboratoria z listy App Defense Alliance.

**Czy niezapisywanie treści wiadomości zwalnia z CASA?** **Nie automatycznie.** Ocena dotyczy tego, jak aplikacja **obsługuje dane z restricted scopes na infrastrukturze, którą kontrolujesz**. W emailto.chat tokeny OAuth (refresh tokeny z dostępem do Gmaila) są **przechowywane na serwerze** (zaszyfrowane, w Postgresie), a dane z Gmaila **przechodzą przez funkcje serwerowe na Vercel** (synchronizacja, cache metadanych i rozmów w bazie, wysyłanie). To typowy profil aplikacji, która **podlega ocenie**. Ograniczenie przechowywanych danych (np. brak pełnych treści w bazie, krótkie okresy retencji, szyfrowanie) zmniejsza ryzyko i ułatwia przejście oceny, ale o zakresie i tierze decyduje Google.

**⚠ Niezweryfikowane:** historycznie Google zwalniał z oceny aplikacje, w których dane z restricted scopes nigdy nie trafiają na serwer dewelopera (wszystko dzieje się na urządzeniu użytkownika). Nie potwierdziłem, czy ten wyjątek obowiązuje dziś. emailto.chat i tak go nie spełnia.

**Praktyczne przygotowanie do CASA:** HTTPS wszędzie (jest), szyfrowanie tokenów (`TOKEN_ENCRYPTION_KEY`), sekrety tylko w Environment Variables, zasada najmniejszych uprawnień, aktualne zależności (`npm audit`), ochrona przed CSRF i XSS, ciasteczka `Secure; HttpOnly; SameSite`, logowanie bez treści maili, procedura usuwania danych na żądanie, polityka retencji, kontrola dostępu do Vercel, bazy i Google Cloud (2FA).

---

## Najczęstsze problemy

| Objaw | Prawdopodobna przyczyna | Rozwiązanie |
|---|---|---|
| `Error 400: redirect_uri_mismatch` | Redirect URI nie jest identyczny z wpisem w kliencie (http/https, `www`, port, `/` na końcu); zły `APP_URL` | A10, C4; poprawić `APP_URL`; odczekać 5 min |
| `Error 403: access_denied` / „has not completed the Google verification process” | Konto spoza **Test users** (Testing) | A7: dodać konto. Dla wszystkich: D1 + weryfikacja |
| `Error 401: invalid_client` | Zły Client ID lub secret, wyłączony lub usunięty sekret, spacje w `.env` | A11; nowy sekret; redeploy |
| `invalid_grant` po tygodniu | Refresh token w Testing wygasa po 7 dniach | Połączyć Gmaila ponownie; docelowo D1 |
| `invalid_grant` po zmianie hasła lub cofnięciu dostępu | Użytkownik cofnął zgodę | **Connect Gmail** ponownie |
| Zalogowany, ale „brak dostępu do Gmaila” | Odznaczony checkbox lub anulowana druga zgoda | Ponownie **Connect Gmail** i zaznaczyć uprawnienie |
| „Gmail API has not been used in project … or it is disabled” | Gmail API nie jest włączone w projekcie klienta OAuth | A4 |
| Ekran zgody pokazuje „unverified app” na produkcji | Restricted scope jeszcze niezatwierdzony | D1–D10 (oczekiwane do czasu weryfikacji) |
| Build na Vercel: „Cannot find module” / „No Next.js version detected” | Brak **Root Directory = `emailto-chat`** | C1 |
| Build: błąd Prisma `P1001` / `P1012` / brak `DATABASE_URL` | Zmienna nie ustawiona dla Production albo baza nieosiągalna | C5, C6; redeploy |
| Migracje: „prepared statement already exists” / timeout blokady | `migrate deploy` przez transakcyjny pooler | Migracje przez bezpośredni URL (C5) |
| Zbyt wiele połączeń do bazy | Bezpośredni URL w funkcjach serverless | Pooled URL w `DATABASE_URL` (C5) |
| `413 FUNCTION_PAYLOAD_TOO_LARGE` przy załączniku | Limit 4,5 MB ciała żądania na Vercel | `MAX_UPLOAD_MB=4`; większe pliki wymagają osobnego mechanizmu |
| Deploy blokowany przez `vercel.json` (cron) | Harmonogram częstszy niż raz dziennie na planie Hobby | `"0 5 * * *"` albo plan Pro |
| Cron zwraca 401 | Brak lub inny `CRON_SECRET` w Vercel; brak redeployu | C6, C7 |
| Pub/Sub: brak żądań na webhook | Brak roli Publisher dla `gmail-api-push@…`, watch nieodnowiony, zły `GMAIL_PUBSUB_TOPIC` | B3, B5 |
| Pub/Sub: 401/403 na webhook | Audience ≠ `PUBSUB_AUDIENCE` (np. URL z `?token=`), inny SA, zły token | B4 |
| Pub/Sub: 3xx | Endpoint na `www` lub `http` | `https://emailto.chat/api/webhooks/gmail` |
| Nowe maile nie przychodzą po ~tygodniu | Wygasł `watch`, bo cron nie działa | C7, B5 |
| `history.list` 404 | Przeterminowany `historyId` | Aplikacja wykonuje pełną resynchronizację (oczekiwane) |
| Domena w Vercel: „Invalid Configuration” | Złe lub stare rekordy DNS, propagacja | C2: wartości z karty domeny; usunąć stare A/AAAA; odczekać |
| Logowanie nie działa na `*.vercel.app` | Preview URL nie jest redirect URI | Testować na localhost lub produkcji (C4) |

---

## Lista kontrolna na koniec

### Gotowość techniczna

- [ ] Projekt Google Cloud utworzony, Project ID zapisany.
- [ ] Gmail API włączone.
- [ ] Google Auth Platform: Branding (nazwa, e-mail wsparcia, home page, privacy, terms, authorized domain `emailto.chat`, kontakt), External, Testing.
- [ ] Test users dodani (≤ 100).
- [ ] Klient OAuth „Web application”: origins `http://localhost:3000`, `https://emailto.chat`; redirect URIs `http://localhost:3000/api/auth/google/callback`, `https://emailto.chat/api/auth/google/callback`.
- [ ] Client ID i Secret zapisane bezpiecznie (JSON pobrany, nie w repo).
- [ ] Data Access: `openid`, `userinfo.email`, `userinfo.profile`, `gmail.modify`.
- [ ] Lokalnie: `.env`, `npx prisma migrate deploy`, `npm run dev`, logowanie i Connect Gmail działają.
- [ ] Vercel: import, **Root Directory = `emailto-chat`**, build zielony.
- [ ] Domena `emailto.chat` (apex) + `www` → 308 → apex, HTTPS aktywny.
- [ ] Hostowany Postgres (pooled URL w `DATABASE_URL`), migracje zastosowane.
- [ ] Wszystkie zmienne w Vercel (Production), inne sekrety niż lokalnie, `MAX_UPLOAD_MB=4`, redeploy wykonany.
- [ ] `vercel.json` z cronem `/api/cron/sync` (raz dziennie na Hobby), `CRON_SECRET` ustawiony, ręczne **Run** zwraca 200.
- [ ] (Opcjonalnie) Pub/Sub: temat, rola Publisher dla `gmail-api-push@system.gserviceaccount.com`, subskrypcja push z OIDC (SA + audience), opcjonalny `?token=`, zmienne w Vercel, test nowej wiadomości przechodzi.
- [ ] Checklista C8 przechodzi w całości.

### Gotowość do weryfikacji Google

- [ ] Strona główna `https://emailto.chat` opisuje aplikację (nie jest samym logowaniem) i linkuje do Privacy Policy (ten sam URL co w Branding) oraz Terms.
- [ ] `/privacy` po angielsku: jakie dane Google, jak używane, przechowywane i udostępniane, retencja, usuwanie, cofnięcie dostępu, brak reklam i sprzedaży, deklaracja **Limited Use**.
- [ ] `/terms` publiczne na tej samej domenie.
- [ ] Domena `emailto.chat` zweryfikowana w Google Search Console (DNS TXT) kontem Owner/Editor projektu.
- [ ] Logo zgodne z wymaganiami (≤ 1 MB, 120×120, bez marek Google). Branding zweryfikowany i opublikowany w **Verification Center**.
- [ ] Uzasadnienie `gmail.modify` (D7) dopasowane do rzeczywistych funkcji.
- [ ] Film demo (D8): angielski, oba przepływy zgody, `client_id` w pasku adresu, każda funkcja używająca zakresu, link YouTube „Unlisted”.
- [ ] Kontakty w IAM i Branding aktualne (Google pisze w sprawie weryfikacji i corocznej CASA).
- [ ] Przygotowanie do CASA: lista kontrolna bezpieczeństwa (D10), wybrane autoryzowane laboratorium, budżet na coroczną ocenę.
- [ ] **Publish app** (Audience) kliknięte świadomie, gdy wszystko powyżej jest gotowe. Do zatwierdzenia obowiązuje limit 100 nowych użytkowników.

---

### Niepewności i rzeczy do ręcznego sprawdzenia

1. Czy **Client secret** jest w pełni widoczny tylko przy tworzeniu klienta (A11).
2. Brak oficjalnego **dosłownego** wzoru zdania Limited Use (D4). Podane zdanie jest standardem branżowym.
3. Wymóg widoczności **`client_id` w pasku adresu** na filmie pochodzi ze źródeł zewnętrznych (D8).
4. Czy agent Pub/Sub ma domyślnie rolę **Service Account Token Creator** (B4).
5. Czy Vercel Cron działa tylko na produkcji i nie podąża za przekierowaniami (C7).
6. Aktualne **wartości rekordów DNS** Vercel, które zależą od projektu (C2), i dokładne **nazwy zmiennych** dodawanych przez integracje Marketplace (C5).
7. Aktualna treść wyjątków od weryfikacji („personal use”, przetwarzanie wyłącznie na urządzeniu) i dokładne kryteria tieru CASA (D9, D10).
8. Lokalizacja ustawień Vercel (**Settings** → **Build and Deployment** zamiast dawnego **General**).
