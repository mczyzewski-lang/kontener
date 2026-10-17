# emailto.chat

**Your email. Now a conversation.** A person-first Gmail client: people on the left, every Gmail thread with that person as a tab, every e-mail as a chat bubble, every shared file in one place. Recipients still get normal e-mail.

> Polska instrukcja konfiguracji Google Cloud, Gmail API, Pub/Sub, Vercel i weryfikacji OAuth: **[GOOGLE_SETUP_PL.md](./GOOGLE_SETUP_PL.md)**.

- `/` — landing page with an embedded, working demo
- `/demo` — full Demo Mode (sample data, runs entirely in the browser, clearly labelled)
- `/app` — the real app (Google sign-in → Connect Gmail)
- `/privacy`, `/terms` — legal pages (fill in operator details before launch)

---

## Quick start (local)

```bash
cd emailto-chat
npm install
cp .env.example .env            # fill in Google OAuth credentials + generated secrets
# Postgres: local install, or: docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
npx prisma migrate deploy
npm run dev                     # http://localhost:3000
```

Without Google credentials everything except `/app` works: landing, `/demo`, legal pages, PWA.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build (runs `prisma generate`) |
| `npm test` | Unit + integration tests (vitest). Integration tests need `DATABASE_URL` pointing at a disposable Postgres DB and are skipped otherwise |
| `npm run lint` / `npm run typecheck` | ESLint (flat config) / TypeScript |
| `npm run db:migrate` / `npm run db:deploy` | Prisma migrations (dev / production) |

---

## Architecture

```
src/
  core/        Pure TypeScript domain layer — no Next.js, Prisma or DOM.
               types (view models), MailClient contract, address parsing,
               person/group/thread indexing, quote & signature detection,
               MIME building, reply headers. Shareable with a future Expo app.
  demo/        Demo Mode: sample mailbox + DemoMailClient (implements MailClient in-browser
               using the same core indexing as the server).
  lib/         api-client.ts (ApiMailClient implements MailClient over the REST API), utils.
  server/
    gmail/     Gmail API integration only: client factory, retry/backoff, MIME payload parsing.
    domain/    Indexer (Gmail thread → person-first index), read model (queries),
               send/compose, drafts, actions, attachments, HTML sanitization.
    sync/      Sync engine (progressive initial sync, backfill, History API incremental sync,
               expired-cursor repair, locking) + Gmail watch (Pub/Sub).
    auth/      Google OAuth (login + separate Gmail consent), account connect/disconnect/delete.
    security/  Sessions, CSRF, AES-256-GCM token encryption, rate limiting, API wrapper.
  app/         Next.js App Router: pages + thin route handlers in app/api/**.
  components/  UI: mail/ (the chat client), ui/ (primitives in shadcn/ui style on Radix), landing/, legal/.
```

**Why this split:** the UI talks to one interface — `MailClient` (`src/core/client.ts`). The live app uses `ApiMailClient`, Demo Mode uses `DemoMailClient`; both return the same view models. A React Native / Expo app can reuse `src/core` and `ApiMailClient` unchanged.

**Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, Radix primitives styled shadcn-style, Lucide icons, SWR, Prisma 6 + PostgreSQL, official `@googleapis/gmail` + `google-auth-library`, `sanitize-html`, Vitest. Prisma 6 (not 7) was chosen deliberately: it needs no driver adapter and is the most battle-tested path on Vercel today.

### Data model — how Gmail becomes person-first

Gmail stays the **source of truth**. We keep a minimal index:

| Entity | Purpose |
| --- | --- |
| `User`, `Session`, `UserPreference` | Account, hashed session tokens, settings |
| `MailAccount` | Gmail connection: address, send-as aliases, **encrypted** tokens, status (`active` / `needs_reauth`), push expiry |
| `EmailThread` | One row per Gmail `threadId` (= one topic tab): subject, snippet, labels, unread count, `isGroup`, `groupKey`, `counterpartEmail` |
| `EmailMessage` | One row per Gmail message: headers (from/to/cc/bcc), labels, Message-ID/References. **No bodies.** |
| `Contact` | One row per **normalized e-mail address** (never merged by display name) |
| `ThreadParticipant` | Contact ↔ thread index (= ContactThreadIndex): which threads a person took part in |
| `AttachmentMetadata` | File name, type, size, Gmail attachment id — bytes are fetched on demand |
| `SyncState` | historyId cursor, backfill page token, lock, errors |
| `Draft` | Gmail draft id mapping (content lives in Gmail) |
| `OutboundMessage` | Idempotency records — prevents double sending |

Rules (implemented in `src/core/grouping.ts`, tested in `tests/core-grouping.test.ts`):

1. A **thread** = Gmail `threadId` = one tab. Never merged by subject.
2. Participants of a thread = all From/To/Cc addresses minus *my* addresses (primary + aliases; the `SENT` label is authoritative). Bcc is ignored.
3. 1 other participant → **direct** thread with that person. ≥2 → **group** thread. Group threads with exactly the same participant set form one group conversation (key = hash of the sorted set). So groups come from real participants of real threads — not from any one e-mail with many recipients.
4. Each thread exists once; people and groups are **indexes** over threads. A person's view shows their direct threads *and* group threads they took part in.
5. Unread counts are **aggregates** computed at query time. Person badges count direct threads only, so a group message is never counted twice.
6. Actions are thread-scoped: archiving a topic removes `INBOX` from that one Gmail thread only.

### Sync

- **Initial sync is progressive:** the profile `historyId` is recorded first, then the newest threads are indexed page by page, so the sidebar fills within seconds; older mail is backfilled in the background up to `MAX_BACKFILL_THREADS`.
- **Incremental sync** uses the Gmail History API; affected threads are re-fetched and re-indexed idempotently.
- **Expired cursor** (`history.list` → 404) triggers a repair full sync.
- Triggers: app open, **polling every ~45 s while the app is visible** (works everywhere, no infrastructure), a daily **Vercel Cron** (`/api/cron/sync`, also renews the Gmail watch), and optional **Gmail push via Pub/Sub** (`/api/webhooks/gmail`) for near-real-time updates.
- A DB lock prevents concurrent syncs per account; retries use exponential backoff with jitter.
- It is e-mail, not a real-time chat: the UI never shows typing indicators, presence or read receipts.

### Security & privacy

- OAuth 2.0 Authorization Code + PKCE + state, server-side only. **Sign-in** (`openid email profile`) is separate from **Gmail consent** (`gmail.modify` only, incremental authorization). We do not request `https://mail.google.com/`.
- Tokens encrypted at rest with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`), never sent to the browser, never logged.
- Sessions: random token in an HttpOnly/Secure/SameSite=Lax cookie; only its SHA-256 is stored.
- Every API route: authentication, per-account data isolation, Origin-based CSRF check for mutations, rate limiting, zod validation.
- E-mail HTML is sanitized server-side (allowlist) **and** rendered in a sandboxed iframe without `allow-scripts`, with its own CSP. Remote images (tracking pixels) are blocked until the user loads them.
- Attachments are served with `X-Content-Type-Options: nosniff`, a sandbox CSP, and forced download for anything not on a short inline-safe list (no HTML/SVG inline).
- Global CSP, `frame-ancestors 'none'`, HSTS in production (see `next.config.ts`).
- Disconnect Gmail (revokes the token at Google, stops the watch, deletes the index) and Delete account (deletes everything) are in Settings.
- Minimal retention: no message bodies or attachment bytes are stored. Bodies do pass through our servers when you open them — see GOOGLE_SETUP_PL.md (section D) for what that means for Google's restricted-scope verification and CASA assessment.
- Mail content is never used for ads, profiling or AI training (Limited Use statement on the landing page and in the Privacy Policy).
- The service worker never caches `/api/**` (mail data).

---

## Feature status

### Works now (verified locally)

- Landing page with embedded live demo, FAQ, security section, Privacy Policy, Terms, SEO/Open Graph metadata, sitemap, robots.
- Demo Mode with Anna Kowalska (4 topics), Michael Brown (3), Sarah Johnson (2), a 4-person group, a second "Anna Kowalska" at a different address, and an HTML newsletter. Switching people and topics, search, details, attachments (real generated PDFs/images/CSV), sending with simulated replies, archive, star, unread — all local and labelled as demo.
- Desktop 3-column layout, tablet layout with a details drawer, dedicated mobile navigation (people → conversation → details, bottom tab bar, safe areas, 16px inputs to avoid iOS zoom), light and dark mode.
- Topic tabs (close a tab without deleting mail, overflow menu with search, `+ New topic` → new Gmail thread), chat timeline (day dividers, sender runs, unread marker, long-mail cards with Read more, collapsed quotes and signatures, sandboxed HTML view, per-message menu: Reply, Reply all, Forward, Copy text, Mark unread, Star, Show original).
- Composer: Enter to send (configurable), To/Cc/Bcc with autocomplete, attachments (picker, drag & drop, paste), emoji, basic formatting (bold/italic/lists → HTML + plain-text alternative), local + Gmail draft autosave, optimistic bubbles, idempotent retry after failures.
- Details panel: people/participants with copy, shared files (grid/list, All/Images/Documents/Other, this topic / all conversations, viewer, jump to source message), conversation history.
- Keyboard shortcuts (`?` lists them), loading skeletons, empty/error/offline states, toasts with Undo for archive.
- PWA: manifest, generated icons, offline shell, push handler prepared.
- Gmail backend: OAuth, sync engine, REST API and tests — see the server section of the test results below.

### Requires external configuration (not code)

- Google Cloud project, OAuth client, consent screen, test users → GOOGLE_SETUP_PL.md section A.
- Production deployment (Vercel, domain, Postgres, secrets) → section C.
- Optional Gmail push via Pub/Sub → section B. Without it, polling + cron keep things in sync.
- Public launch: OAuth verification for the restricted `gmail.modify` scope, and a CASA security assessment → section D. Until then the app works for up to 100 test users, and their refresh tokens expire after 7 days (Testing mode).

### Known limitations / not done yet

- **Forward** sends the original text but not the original attachments.
- **Web Push notifications**: the service worker handles `push` events, but the server does not send pushes yet (needs VAPID keys + subscription storage).
- **Rate limiting** is in-memory per server instance; on serverless use a shared store (e.g. Redis) for strict limits.
- **Attachment upload size** on Vercel is limited by the 4.5 MB request body limit (`MAX_UPLOAD_MB` defaults to 4 there). Larger uploads would need direct-to-storage uploads.
- Contacts that appear *only* in group threads are not listed under People (they're reachable via search, the group, and the details panel).
- Native iOS/Android apps are not built (the architecture is prepared: `src/core` + `ApiMailClient`).
- Outlook/IMAP are intentionally out of scope for the MVP.

### Before public launch

- Replace `[Operator legal name]`, `[Registered address]`, governing law and the provider list in `/privacy` and `/terms` (`src/components/legal/legal-page.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`).
- Complete Google's brand + restricted-scope verification and the CASA assessment (GOOGLE_SETUP_PL.md, section D).
- Point `APP_URL` at `https://emailto.chat` and add the production redirect URI.

---

## Roadmap after MVP

- Expo app reusing `src/core` and `ApiMailClient`; push via Pub/Sub → Web Push / APNs / FCM.
- Shared rate-limit store, background job queue for large backfills.
- Forwarding original attachments; per-contact merge (user-confirmed) of multiple addresses.
