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
- Redux was considered and set aside for now — not needed at the current scope, but not ruled out. If a future feature (e.g. Deck builder) needs Redux-shaped state (undo/redo, multi-panel validation, one action fanning out to many reactions), it can be added scoped to that feature alongside React Query and Zustand, without migrating what already works.

### Django

- Authentication
- Business logic
- Card import
- Quiz generation
- Image modification
- Database

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

Open item, to confirm before implementation: whether the Pokémon TCG API exposes a reliable "set fully released" or "last updated" signal to detect when an already-imported set has new/changed cards. See docs/decisions.md.

---

## Images

Original card images are stored.

Quiz images are generated server-side by Django (Pillow), never by the frontend.

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

Preferred

Google OAuth

Also support

Email/password login

Future providers may include:

- GitHub
- Discord

### Email Verification & Password Reset

Email/password accounts must verify their email before logging in; Google OAuth accounts skip this, since Google has already verified the address. Password reset uses a time-limited signed token sent by email. The reset-request endpoint always returns the same generic response regardless of whether the email is registered, and both the reset-request and verification-resend endpoints are throttled. See docs/decisions.md #014 and docs/api.md.

### Session Strategy

JWT (`djangorestframework-simplejwt`), not Django session+CSRF. Frontend and backend are expected to be deployed on separate domains (and/or a future mobile client), which makes cookie-based sessions impractical to configure cleanly across origins.

To avoid the usual XSS risk of storing JWTs in `localStorage`:

- The access token (short-lived) is kept in memory only, never persisted to storage.
- The refresh token (longer-lived) is stored in an httpOnly cookie, sent only to the refresh endpoint.
- Logout revokes the refresh token server-side via blacklisting; the short-lived access token limits exposure even without a full denylist.

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

## Future Features

Deck builder

Trading

Achievements

Statistics

Leaderboards
