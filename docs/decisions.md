# Architecture Decisions

## Decision 001

Monorepo

Why

React and Django are tightly coupled.

The project is maintained by one developer.

---

## Decision 002

React + Django

Why

Strong separation between frontend and backend.

Easy API development.

---

## Decision 003

Import Pokémon cards locally

Why

- Faster
- Better search
- Offline support
- Avoid API limits

---

## Decision 004

Backend generates quiz images

Why

Users cannot remove frontend overlays to reveal answers.

---

## Decision 005

Google OAuth

Why

Reduce signup friction.

Still support email/password login.

---

## Decision 006

All English-language cards, all sets

Why

- Matches "browse every card" without multi-language import complexity
- Card and Set models include a `language` field (default `en`) so other languages can be added later without a migration
- Open: unconfirmed whether the Pokémon TCG API serves non-English card data directly

---

## Decision 007

Quiz images: lazy generate-and-cache

Why

- Avoids regenerating the same masked image on every request
- Avoids generating variants for cards that are never quizzed
- Precomputing specific cards later (e.g. for a timed quiz mode) is additive, not a redesign

---

## Decision 008

Card sync: diff-by-set upsert, manual trigger

Why

- Printed cards are static once released, so new content is set-shaped, not scattered
- Full set list is cheap to re-fetch every run; full card data is only fetched for sets not yet imported
- Upsert by TCG ID (never wipe-and-reload) keeps foreign keys from Collections/Favorites stable
- Manual trigger for now; scheduling can wrap the same command later without a redesign
- Open: unconfirmed whether the API exposes a reliable "updated since" signal for finer-grained diffing

---

## Decision 009

Collections and Favorites are separate models, not one combined table

Why

- Ownership needs a quantity (collectors commonly own duplicates); favoriting doesn't
- Avoids a `quantity` column that's only meaningful on rows that are also "owned"
- Supersedes the earlier single `CollectionCard` sketch in docs/database.md

---

## Decision 010

Authentication: JWT, not Django sessions

Why

- Frontend and backend are expected to be deployed on separate domains, and/or a future mobile client
- Cookie-based sessions are impractical to configure cleanly across separate origins
- Access token kept in memory only (never localStorage) to limit XSS exposure; refresh token stored in an httpOnly cookie, sent only to the refresh endpoint
- Logout revokes the refresh token server-side via blacklisting

---

## Decision 011

Guest quiz play allowed; scores save only if logged in

Why

- Avoids gating the app's most casual, low-commitment feature behind an account
- Follows through on the low-friction reasoning behind Decision 005 (Google OAuth) — signup friction is removed, but the quiz would still require it if login were mandatory to play at all
- Quiz question endpoint stays open (`AllowAny`); the score-recording endpoint requires auth (`IsAuthenticated`)
- Naturally incentivizes signing in (save scores, future leaderboards) without forcing it

---

## Decision 012

Quiz scoring tracks per-question detail, not just session-level score

Why

- Enables future per-card stats (e.g. "which Pokémon you consistently get wrong") and richer statistics/leaderboard features
- `QuizAttempt` (session) keeps a cached `score`/`total_questions` for fast reads; `QuizAttemptAnswer` (one row per question) holds the detail
- A deliberate choice to take on more schema now in exchange for that future capability, not a default — session-level alone would have been simpler and was the initial recommendation

---

## Decision 013

API conventions: URL path versioning, page-number pagination, explicit serializers

Why

- Versioning (`/api/v1/`) costs nothing to add now; retrofitting it onto URLs a client already depends on later would not be free
- Page-number pagination fits a browsing UX ("page 3 of 40") and card data is static between syncs, so cursor pagination's main benefit (protecting against rows shifting between requests) doesn't apply
- Explicit `fields` lists (never `__all__`) keep what's exposed a deliberate choice
- Separate List/Detail serializers for `Card` keep browsing payloads light without limiting the detail page

---

## Decision 014

Email verification is required for email/password accounts; Google OAuth accounts skip it

Why

- Google has already verified the email for OAuth accounts, so re-verifying is redundant
- Without verification, password reset would trust an email address nobody confirmed the user actually owns — a gap adjacent to account takeover
- Password reset requests return the same generic response regardless of whether the email is registered, to avoid leaking which emails have accounts
- Verification-resend and password-reset-request endpoints are throttled (DRF built-in throttle classes, no new dependency) to prevent mailbox spamming

---

## Decision 015

Frontend state management: React Query (server state) + Zustand (client state)

Why

- Server state (cards, sets, collections, favorites, quiz data) needs caching, pagination, and refetch-after-mutation — React Query is purpose-built for this rather than hand-rolled fetch/loading/error state
- Client state is small (in-memory JWT access token, quiz-session UI) and doesn't need Redux's ceremony (slices, providers, RTK Query endpoint definitions) at this scope
- The access token lives in memory, not Context, so it can be read by the API client's request interceptor — a plain module, not a component, which can't call a Context hook. Zustand's store is readable via `getState()` from anywhere, which solves this directly
- Redux Toolkit was considered and is not ruled out — Deck builder or Trading (Future Features) may eventually need Redux-shaped state (undo/redo, multi-panel validation, one action fanning out to many reactions). If so, it can be added scoped to that feature, coexisting with React Query and Zustand, without migrating the rest of the app

---

## Decision 016

Card schema: real columns only for what's searched/filtered/quizzed on; everything else in a JSON `details` blob

Why

- README states "search by Pokémon, set, rarity, type" — `type` had no field at all, a real gap, not speculative scope
- Quiz generation needs to filter to Pokémon-only cards (not Trainer/Energy), which needs a `supertype` field
- `type` is normalized as a many-to-many to a `Type` lookup table (not a JSON array) since it's a small fixed vocabulary (~18 values) *and* an actual filter requirement — unlike attacks/weaknesses/artist/flavor text/etc., which are render-only with no current query need and go in `details` (JSON)
- Promoting a scalar field out of `details` later (e.g. `artist`) is cheap — one migration + one bulk SQL backfill via Postgres's JSONB extraction operators. Promoting a list-shaped field (e.g. `attacks`, multiple per card) is more work — a new related table + a data migration looping over rows — but still mechanical, not a redesign
- Indexes added on `name`, `rarity`, `supertype` — the three fields actually driving search/filter/quiz queries

---

## Decision 017

Quiz eligibility is per-mode and asymmetric by supertype; users can further filter by rarity

Why

- Renamed "Guess the Pokémon" to "Guess the Card" — every card has a `name` regardless of supertype, so recognizable Trainer cards (e.g. full-art "Iono") can be guessed too, not just Pokémon species
- Guess the HP stays Pokémon-only — Trainer/Energy cards have no HP value at all, a data fact rather than a design choice
- Trainer cards are only eligible (for Guess the Card / Guess the Set) at or above a "special" rarity tier (Ultra Rare, Secret Rare, Special Illustration Rare, and future equivalents) — common/uncommon Trainer cards aren't distinctive enough to guess, unlike full-art chase cards. Pokémon cards have no such threshold; any rarity is eligible
- Energy cards are excluded entirely from all quiz modes — Basic Energy repeats too often across the catalog and isn't distinctive
- The special-tier rarity list is a small fixed constant in code, not a DB table, since it's a fixed game-rule concept, not user data
- Users can additionally narrow the pool via a `rarities` param (checkboxes on the frontend), applied uniformly across all modes. This only narrows within what's already baseline-eligible — it can't make an ineligible card (common Trainer, any Energy) eligible

---

## Decision 018

Project is strictly non-commercial; a non-affiliation disclaimer is required in the UI

Why

- Pokémon card artwork is copyrighted by Nintendo/Creatures/GAME FREAK/The Pokémon Company. pokemontcg.io is an unofficial, community-run fan project with no official affiliation — using its data/images rests on fan-project ecosystem tolerance, not an explicit granted license
- The Pokémon Company's own stated Media Usage Guidelines license copyrighted material for non-commercial, editorial/informational use only, and prohibit use implying affiliation or endorsement
- Could not fully verify pokemontcg.io's own Terms of Service text on image redistribution/modification specifically — `dev.pokemontcg.io/terms` returned HTTP 403 on direct fetch. This is a genuine research gap, not a resolved question — worth reading directly in a browser before this matters more (e.g. before any commercial step)
- Given the above: no ads, no paid tiers, no monetization, unless revisited deliberately later with its own review
- A visible non-affiliation disclaimer is required somewhere on every page (e.g. app footer) — "unofficial fan project, not affiliated with or endorsed by The Pokémon Company, Nintendo, Creatures, or GAME FREAK; card images and trademarks are property of their respective owners." Directly addresses the "implies affiliation" restriction. See ARCHITECTURE.md.

---

## Decision 019

Testing specifics: Postgres test DB, mocked external API, MSW for frontend, structural image assertions

Why

- Tests run against Postgres, not SQLite, since the schema already relies on Postgres-specific behavior (`details` JSONB, unique-together constraints) — SQLite would risk a test suite that passes on behavior differing from production, undermining "prefer correctness over speed"
- Import command tests mock the Pokémon TCG API's HTTP responses (fixture JSON) rather than calling the live API — fast, deterministic, independent of the real API's availability/rate limits
- Frontend API mocking uses MSW, intercepting at the network level so components exercise real React Query hooks against mocked responses — keeps tests closer to "behavior, not implementation" (already a stated principle in docs/testing.md)
- Quiz image generation tests assert structural properties (dimensions, format, masked region differs from original) rather than exact pixel output, which would be brittle

---

## Decision 020

CI via GitHub Actions: run tests, lint, migration check, coverage — no deployment step

Why

- The repo is already on GitHub, and CLAUDE.md already requires tests for every feature — CI makes that enforced rather than relying on manual discipline, which is exactly the gap the original review flagged
- Backend job runs `python manage.py test` against a Postgres service container, matching the test-DB decision in docs/decisions.md #019 — no value in testing against something CI doesn't also test against
- Frontend job runs `npm run test:run` (Vitest in non-watch mode — plain `vitest`/`npm test` launches watch mode and never exits, which would hang CI)
- Linting: Ruff for Python (replaces flake8+black+isort with one faster tool — fewer dependencies overall, not more); ESLint + Prettier for the frontend
- Migration check: `python manage.py makemigrations --check --dry-run` as its own step, catching the common mistake of changing a model without generating its migration
- Coverage reporting (`coverage.py` backend, Vitest `--coverage` frontend) ties the 80%+ target already stated in docs/testing.md to something actually measured, rather than an unenforced aspiration
- No deployment step — deployment target is still deferred to Phase 7 (docs/decisions.md caching/deployment deferral); this is scoped to verification only

---

## Decision 021

Frontend is TypeScript, not plain JavaScript

Why

- Catches frontend/backend contract mismatches at compile time (e.g. a DRF serializer field renamed breaks the build instead of failing silently at runtime) — the exact boundary most likely to drift as the API evolves
- React Query and Zustand (already chosen) both have first-class TypeScript support as a core selling point — typed query results, typed store state — so this reinforces prior decisions rather than sitting alongside them awkwardly
- Directly serves CLAUDE.md's stated top-level project goals (clean architecture, maintainability, readability, testability)
- Vite has zero-friction TS setup (`--template react-ts`), so there's no meaningful tooling cost
- Adds a `tsc --noEmit` type-check step to CI (docs/decisions.md #020 / ARCHITECTURE.md "CI/CD")

---

## Decision 022

Sync command uses an API key, with combined proactive pacing + reactive backoff

Why

- Confirmed via the Pokémon TCG API's own docs: 1,000 requests/day unauthenticated (max 30/min), vs. 20,000/day with a free API key — unauthenticated would be exhausted almost immediately given the catalog size (all English cards, all sets)
- The API key is a secret: environment variable, never committed (`.env.example` documents the expected variable name with no real value)
- The authenticated per-minute limit isn't documented anywhere found — so pacing requests proactively (small fixed delay) *and* backing off reactively (exponential backoff on 429/transient errors) together is more robust than relying on either alone against an unknown real limit
- Failure recovery needs no new logic: the diff-by-set sync design (#008) already makes re-running the command after a partial failure safe — already-imported sets are skipped
- Tooling: `requests`' built-in retry adapter (`HTTPAdapter` + `urllib3.Retry`), not a new dependency like `tenacity` — this is one focused piece of retry logic, not complex enough to justify an extra library

---

## Decision 023

CORS: explicit origin allowlist via env var, no wildcards, no regex

Why

- Follows directly from Decision 010 (separate domains, credentialed httpOnly refresh cookie) rather than being an independent choice — `CORS_ALLOW_ALL_ORIGINS` doesn't work once credentials are involved, since browsers reject wildcard origin + credentialed requests together
- `CORS_ALLOWED_ORIGINS` sourced from an environment variable, not hardcoded — different values for local dev (`http://localhost:5173`) vs. production frontend domain, same pattern as the API key
- `CORS_ALLOW_CREDENTIALS = True`, paired with the refresh cookie's `SameSite=None; Secure`
- No regex-based origin matching — only needed for dynamic subdomains (e.g. per-PR preview deployments), not a stated need since deployment is still deferred to Phase 7. Can be added later if that changes

---

## Decision 024

Frontend linter: ESLint + Prettier, not Oxlint (the current Vite template default)

Why

- Vite's `react-ts` template (as scaffolded) now generates `.oxlintrc.json` instead of an ESLint config — a genuine shift from what earlier project docs assumed. Worth deciding deliberately rather than silently keeping whatever the template happened to default to
- Oxlint is stable (1.0 since June 2025), fast (50-100x), and covers react-hooks and a growing share of TypeScript rules — a real, mature tool, not dismissed lightly
- The deciding factor: type-aware linting. ESLint + `typescript-eslint`'s type-aware rules (`no-floating-promises`, `no-misused-promises`) catch a bug class that matters specifically here, since the app is built around React Query — "forgot to await/handle a promise" is a realistic mistake in that pattern. Oxlint's type-aware linting (via `tsgo`) is newer and less proven than the ESLint+typescript-eslint combination
- Oxlint's main advantage — raw speed — matters most at a scale (large monorepos, CI bottlenecks) this solo-maintained project (Decision 001) doesn't operate at, so its incompleteness isn't worth trading for a speed gain that isn't needed yet
- `eslint-config-prettier` (not `eslint-plugin-prettier`) bridges the two — disables ESLint's stylistic rules so Prettier owns formatting and ESLint owns code-quality linting, run as two separate commands

---

## Future Decisions

Caching and deployment target — deferred to Phase 7 (see ARCHITECTURE.md).
