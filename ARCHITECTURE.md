# Architecture

## High-Level Architecture

                React
                  │
                  ▼
         Django REST API
                  │
                  ▼
            PostgreSQL
                  ▲
                  │
        Pokémon TCG API

The Pokémon API is only used during import/synchronization.

The frontend never communicates with it.

API conventions (versioning, pagination, serializer structure) are documented in docs/api.md; see docs/decisions.md #013 for the reasoning.

---

## Responsibilities

### React

- UI
- Routing
- Authentication UI
- Collection pages
- Quiz pages
- Written in TypeScript. Reinforces React Query and Zustand's own typed APIs, and catches frontend/backend contract mismatches (e.g. a serializer field renamed) at compile time rather than at runtime. See docs/decisions.md #021.

### State Management

- React Query — server state: cards, sets, collections, favorites, quiz data. Handles caching, pagination, and refetch-after-mutation.
- Zustand — client state: the in-memory JWT access token and quiz-session UI progress. Chosen over Context because its store is readable outside the component tree (e.g. by the API client's request interceptor, which attaches the access token and is not itself a component). See docs/decisions.md #015.
- The two Zustand stores take opposite persistence stances, each for a specific reason rather than a blanket rule: the access token is kept in memory only and never written to `localStorage` (losing it on reload is expected — a security constraint, since persisting it would widen the XSS attack surface), while quiz-session progress *is* persisted to `localStorage`, so an in-progress quiz survives navigating away or a full reload. See docs/decisions.md #030.
- Redux was considered and set aside for now — not needed at the current scope, but not ruled out. If a future feature (e.g. Deck builder) needs Redux-shaped state (undo/redo, multi-panel validation, one action fanning out to many reactions), it can be added scoped to that feature alongside React Query and Zustand, without migrating what already works.

### Django

- Authentication
- Business logic
- Card import
- Quiz generation
- Image modification
- Database

---

## Frontend Routing & URL State

The Cards page's filters (set, series, search, rarity, supertype, type, sort,
page) live in the URL's query string (`useSearchParams`), not component
state — the exact view is encoded in the URL itself, so navigating to a
card's detail page and back (the in-app link or the browser's own back
button) restores it exactly, rather than resetting to the unfiltered
default. Filter changes use a `replace` navigation, not the default push, so
adjusting a filter updates the current history entry instead of stacking a
new one on every keystroke or dropdown change — navigating to a card's
detail page (and returning from it) are the only real history entries. See
docs/decisions.md #033.

Scroll position is restored on the way back via React Router's
`<ScrollRestoration>`, keyed by pathname rather than the library's default
per-navigation key. The default key changes on every URL-driven filter
update (each one is a distinct navigation, even with `replace`), which would
otherwise make "the Cards page" look like a different scroll-restoration
bucket every time a filter changed; keying by pathname alone treats it as
one continuous page regardless of which filters are active.

---

## Pokémon Data

Cards are imported into the local database.

The application should query only the local database.

A Django management command should handle synchronization.

Scope: all English-language cards, across all sets.

The Card and Set models include a `language` field (defaulting to `en`) so additional languages can be imported later without a schema migration. Detailed field-level schema lives in `docs/database.md`.

Sync strategy: diff-by-set upsert. Every sync fetches the full set list (a few hundred entries) and upserts it by TCG ID. Card data is only fetched in full for sets not yet marked as imported, since printed cards are static once released. The Set model tracks an "imported" flag for this purpose, and the command supports a force-reimport flag per set as an escape hatch for the rare case of errata. Cards are upserted by TCG ID, never wiped and reinserted, so foreign keys from user data (collections, favorites) stay stable.

The sync command is triggered manually (e.g. `python manage.py sync_cards`) rather than scheduled. Scheduling can be added later as a wrapper around the same command without a redesign.

Rate limiting: the sync command authenticates with an API key (1,000 requests/day unauthenticated vs. 20,000/day with a key — a key is required given the catalog size). The key is a secret, read from an environment variable, never committed. Requests are proactively paced with a small fixed delay, plus exponential backoff on 429/transient errors, since the API's per-minute limit for authenticated requests isn't documented — combining both is more robust than relying on either alone. If the command dies partway through, re-running it resumes naturally via the diff-by-set design above (already-imported sets are skipped), with no separate checkpointing needed. See docs/decisions.md #022.

Resolved: the Set object does expose an `updatedAt` field, verified live against the real API — stored in `Set.details` for a possible future "detect changed sets automatically" enhancement, not built as part of Phase 2. See docs/decisions.md #025.

Card/Set/Type models, plus `Attack`/`Weakness`/`Resistance` (attacks, weaknesses, and resistances are normalized as their own tables, not JSON), live in a dedicated `cards` app — see docs/database.md and docs/decisions.md #025.

A `(set, number, language)` uniqueness constraint was dropped from `Card` after a full production sync disproved the assumption behind it — some reprint sets genuinely repeat a printed number within the same set. `tcg_id` (the source API's own id) is the actual identity guarantee. See docs/decisions.md #026.

---

## Cards Browsing & Filtering

`GET /api/v1/cards/` is paginated (24/page, capped at 100), filtered
(`django-filter`), searched on `name` (partial, case-insensitive), and
orderable. Filters: `rarity`, `supertype`, `set` (a specific Set id),
`series` (every set in a series at once — e.g. every Mega Evolution set —
matching `Set.series` case-insensitively), `type` (case-insensitive
elemental type name). See docs/api.md and docs/decisions.md #028, #035.

Sorting by `number` needs special handling: `Card.number` is a `CharField`,
since not every printed number is purely numeric (e.g. "TG01"). A plain
string sort produces `1, 10, 100, 101, 102, 11, 12, ...` instead of numeric
order — confirmed as a real, visible bug against production data before
fixing it. The fix extracts the numeric portion via a Postgres
`REGEXP_REPLACE`/`NullIf`/`Cast` annotation and orders by that, with the raw
string as a secondary tiebreak, so the handful of cards with no digits at
all in their printed number sort last instead of erroring. See
docs/decisions.md #032.

Populating filter dropdowns (Rarity, Type, Supertype) and the search box's
name suggestions all go through dedicated small endpoints rather than a
hand-maintained list on the frontend, so they can never drift from what's
actually in the database. Each accepts an optional `set` or `series` param
(a shared `scope_cards_by_set_or_series()` helper) that narrows the offered
choices to whatever's actually reachable in the current view — picking a
set never leaves a filter dropdown offering a choice guaranteed to return
nothing. See docs/decisions.md #028, #034, #035, #036.

Name suggestions are ranked shortest-match-first, not alphabetically —
reprints of a popular species otherwise crowd out every other species under
an alphabetical cap (confirmed against real data: searching "pi"
alphabetically never reached "Pikachu" or "Piplup", both buried behind
"Pidgeot" variant reprints). See docs/decisions.md #036.

---

## Images

Original card images are stored.

Quiz images are generated server-side by Django (Pillow), never by the frontend. The guessed region is obscured with a Gaussian blur, not a solid fill — see docs/decisions.md #052.

Generation strategy: lazy generate-and-cache. A masked variant is generated the first time it is requested for a given card and quiz mode, then saved to media storage and served from cache on every subsequent request. This avoids recomputing identical output on every quiz request (as a no-cache approach would) and avoids generating variants for cards that are never actually quizzed (as precomputing every variant at import time would).

Because the masking logic and the cache-populating step are shared, this leaves an easy path to precompute variants ahead of time for a specific subset of cards later (e.g. to support a future timed quiz mode where generation latency at request-time is unacceptable) — that would be an additive management command that warms the cache eagerly for that subset, not a redesign.

Possible quiz modes:

- Hide card name (Guess the Card)
- Hide set symbol (Guess the Set)
- Hide HP (Guess the HP)
- Hide rarity
- Future modes

### Quiz Eligibility & Rarity Filtering

Card pool eligibility is per-mode and, for Guess the Card / Guess the Set, asymmetric by supertype rather than a blanket rule:

- **Guess the Card** — Pokémon cards: any rarity. Trainer cards: only rarities at or above a defined "special" tier (Ultra Rare, Secret Rare, Special Illustration Rare, and future equivalents) — common/uncommon Trainer cards aren't distinctive enough to guess by name, unlike full-art chase cards. Energy cards: excluded entirely (Basic Energy repeats too often and isn't distinctive).
- **Guess the HP** — Pokémon-only, any rarity. Trainer and Energy cards have no HP value at all, so this is a data fact, not a design choice.
- **Guess the Set** — same asymmetric rule as Guess the Card (Pokémon any rarity, Trainer above the special tier, Energy excluded).

The "special tier" rarity list is a small fixed constant in code (not a DB table), since it's a fixed game-rule concept rather than user data.

On top of this baseline eligibility, users can further narrow the pool by rarity via checkboxes on the frontend (e.g. limiting to just Secret Rare), passed as a `rarities` param on the quiz-generation endpoint. This filter applies uniformly across all modes and narrows *within* whatever's already baseline-eligible — it can't make an otherwise-ineligible card (e.g. a common Trainer, or any Energy card) eligible. Omitted or empty means no additional restriction. See docs/decisions.md #017 and docs/api.md.

### Question Generation & Answer Checking

The field being guessed is never included in a question's payload — masking
the image but also sending the answer as plain text alongside it would make
the quiz trivially solvable by reading the network response. The masked
image URL is returned as an absolute URL, not the storage-relative path a
local storage backend returns by default: the frontend and Django are
different origins, so a relative path resolves against the wrong one. See
docs/decisions.md #030.

Guess-the-card answer checking accepts more than an exact string match: a
card's full printed name always works, but for cards whose name carries a
prefix that identifies context rather than the Pokémon itself — an owning
trainer ("Ethan's Typhlosion") or a classic Team Rocket variant ("Dark
Charizard") — the plain name with that prefix stripped is also accepted.
This is intentionally narrow and pattern-based (a possessive-prefix pattern,
plus the two known historical variant prefixes) rather than a general "last
word" heuristic, which would incorrectly loosen genuine multi-word species
names (e.g. "Tapu Koko", "Mr. Mime") that aren't a prefix plus a Pokémon at
all. See docs/decisions.md #036.

### Licensing

Card artwork and data come from the Pokémon TCG API, an unofficial fan project — not an explicit license grant. The app is strictly non-commercial (no ads, no paid tiers) as a result. A non-affiliation disclaimer ("unofficial fan project, not affiliated with or endorsed by The Pokémon Company, Nintendo, Creatures, or GAME FREAK; card images and trademarks are property of their respective owners") is a required element of the React app's base layout, rendered on every page (e.g. in a shared footer component), not something added per-page. See docs/decisions.md #018.

---

## Collections

Ownership and favoriting are modeled as two separate tables, not one combined table, since they track different things and grow differently over time.

`CollectionEntry` — user, card, quantity, date added. Represents a card the user owns, with a count of how many copies (collectors commonly own duplicates).

`Favorite` — user, card, date added. Represents a card the user has starred, independent of whether they own it.

A card can be owned, favorited, both, or neither — the two tables are queried independently and combined at the API layer when a view needs both (e.g. a card detail page).

---

## Authentication

Status: the JWT/cookie mechanics, the custom email-identified `User` model,
email/password registration/verification/login/logout, password reset, and
Google OAuth are all implemented and tested (`core` app). A dedicated
profile-editing page is designed but not yet built — see docs/decisions.md
#005, #014, #067, #068, #069.

Preferred

Google OAuth

Also support

Email/password login

Future providers may include:

- GitHub
- Discord

### User model

Custom `core.User` (`AbstractUser` subclass), not Django's default — `email` is the unique login identifier (`USERNAME_FIELD`), not `username` (removed). An `is_verified` boolean gates login, checked explicitly in a custom `TokenObtainPairSerializer` subclass rather than overloading Django's broader `is_active`. See docs/decisions.md #067 for why this was done as an early, one-time migration-history reset rather than bolted onto the default model.

### Email Verification & Password Reset

Email/password accounts must verify their email before logging in; Google OAuth accounts skip this, since Google has already verified the address. Verification uses a signed, time-limited token (`django.core.signing`, 24h, no new dependency) emailed as a link to the frontend, which POSTs it back to confirm — a successful verification also logs the user in immediately. Password reset works the same way, on a separate salt so a verification link and a reset link can never be used interchangeably, with a shorter 1h expiry (a leaked reset link is a more immediate takeover risk than a leaked verification link). The reset-request endpoint always returns the same generic response regardless of whether the email is registered (or verified); both it and verification-resend are throttled (DRF's `ScopedRateThrottle`). Completing a reset also blacklists every outstanding refresh token for the account, ending any other active session, then logs the user in. See docs/decisions.md #014, #067, #068 and docs/api.md.

### Google OAuth

Frontend uses Google Identity Services' own button (`@react-oauth/google`) to get a signed ID token directly from Google, client-side — no authorization-code/redirect exchange to implement. The backend verifies that token's signature against Google's public keys and its `audience` claim against our own Client ID (`google-auth`), then resolves a `User` **by email**, the same identity email/password and Google sign-in both key off (see "User model" above) — signing in with Google using an email that already has a password account logs into that same account and marks it verified if it wasn't already, rather than creating a second, disconnected one. A brand-new Google-only account gets `set_unusable_password()` (Django's own mechanism — `check_password` always fails against it), so it can't be logged into via email/password until a real one is set through the password-reset flow above. See docs/decisions.md #069.

### Session Strategy

JWT (`djangorestframework-simplejwt`), not Django session+CSRF. Frontend and backend are expected to be deployed on separate domains (and/or a future mobile client), which makes cookie-based sessions impractical to configure cleanly across origins.

To avoid the usual XSS risk of storing JWTs in `localStorage`:

- The access token (short-lived) is kept in memory only, never persisted to storage.
- The refresh token (longer-lived) is stored in an httpOnly cookie, sent only to the refresh endpoint.
- Logout revokes the refresh token server-side via blacklisting; the short-lived access token limits exposure even without a full denylist.
- The frontend's fetch wrapper (`apiClient`) reads the current access token directly from the Zustand store (`getState()`, not a hook) and attaches it as a Bearer token — the wrapper itself isn't a React component, so it has no way to receive the token via props or context.

### CORS

Follows directly from the decisions above, not a separate choice: since the refresh-token cookie is credentialed and genuinely cross-site (separate domains), `CORS_ALLOW_ALL_ORIGINS` cannot be used — browsers reject wildcard origins combined with credentialed requests. Configuration (`django-cors-headers`):

- `CORS_ALLOWED_ORIGINS` — an explicit list, sourced from an environment variable (different values for local dev, e.g. `http://localhost:5173`, vs. the production frontend domain)
- `CORS_ALLOW_CREDENTIALS = True`, paired with the refresh cookie's `SameSite=None; Secure`
- No regex-based origin matching (`CORS_ALLOWED_ORIGIN_REGEXES`) — only needed for dynamic subdomains (e.g. per-PR preview deployments), which isn't a current need since deployment itself is deferred to Phase 7

See docs/decisions.md #023.

### Quiz Access

Playing a quiz does not require authentication. Recording a score does. The quiz question endpoint is open (`AllowAny`); the score-recording endpoint requires auth (`IsAuthenticated`). See docs/decisions.md #011.

### Quiz Scoring

Tracked at per-question detail, not just session-level. `QuizAttempt` represents a completed session (with a cached score); `QuizAttemptAnswer` represents each individual question within it (card, correctness, time taken). This trades more schema now for future per-card statistics and leaderboard features. See docs/database.md and docs/decisions.md #012.

---

## Caching & Deployment

Deferred. No caching layer or hosting/deployment target has been decided. These are Phase 7 concerns (see ROADMAP.md) and deciding this far ahead risks locking in a choice before the app's actual traffic/scale patterns are known. Revisit at Phase 7.

---

## Testing

Backend

- Models
- APIs
- Authentication
- Import command
- Quiz generation

Frontend

- Components
- Pages
- User interactions
- Authentication flow

Specifics (test database choice, external API mocking, image-generation assertions, MSW) are in docs/testing.md; see docs/decisions.md #019.

---

## CI/CD

GitHub Actions, running on every push/PR. Scoped to verification only — no deployment step (deployment target is still deferred to Phase 7).

- Backend: `python manage.py test` against a Postgres service container (matches the test-DB choice in docs/decisions.md #019)
- Frontend: `npm run test:run` (Vitest in non-watch mode — plain `vitest`/`npm test` never exits)
- Lint: Ruff (Python), ESLint + Prettier (frontend)
- Type check: `tsc -b` (not `tsc --noEmit` — the project uses a solution-style tsconfig with project references, each already setting `noEmit: true`; frontend is TypeScript — see docs/decisions.md #021)
- Migration check: `python manage.py makemigrations --check --dry-run`
- Coverage: `coverage.py` (backend), Vitest `--coverage` (frontend) — enforces the 80%+ target already stated in docs/testing.md

See docs/decisions.md #020.

---

## Horoscope

A daily, per-user card pull — 5 Pokémon, 1 Trainer, 1 Energy, each drawn independently. Not part of the original roadmap phases; added later alongside the Quiz system's own backend/frontend split (`horoscope` app, mirroring `quiz`'s `QuizAttempt`/`QuizAttemptAnswer` parent/child shape). See docs/decisions.md #061 for the full reasoning.

Once-per-UTC-day is a database constraint, not application logic: `HoroscopePull.pull_date` (a plain `DateField`, set once via `timezone.now().date()`) carries a `UniqueConstraint(user, pull_date)`, so the guarantee holds regardless of what any view does. The pull endpoint is accordingly idempotent — the first `POST` of a day creates, every later one that day just returns the existing row.

Each of the 7 slots rolls a rarity tier (common/mid/chase) independently against fixed, deliberately-designed odds (70/25/5 — not derived from the real catalog's own proportions, which skew common-heavy as an accident of 25 years of reprints rather than a designed scarcity), then picks a random eligible card of that supertype+tier, falling back through the other two tiers if the rolled one has no eligible cards for that supertype. Reuses `quiz/eligibility.py`'s rarity-tier constants rather than redefining them.

The frontend reveal (`HoroscopeReel.tsx`) is a new component, not a reuse of the quiz's single-card `CaseOpeningReel` — 7 small flip-reels, each starting its own spin on a fixed stagger so they land left to right. `CardBack` and the flip CSS are shared with the quiz reel; `usePrefersReducedMotion` was extracted out to `hooks/` so both components read it from one place.

Like quiz-attempt saving, pulling a horoscope requires authentication (`IsAuthenticated`) — there is no guest/anonymous path. Whether Quiz and Horoscope should eventually support anonymous use with activity "claimed" onto an account created afterward is an open, deliberately deferred question (see docs/decisions.md #061) — it depends on a registration flow that doesn't exist yet in any form, and should be revisited once Phase 4 (Authentication) is actually being designed, not decided in isolation for one feature.

---

## Future Features

Deck builder

Trading

Achievements

Statistics

Leaderboards
