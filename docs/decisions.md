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

## Decision 025

Card/Set models and sync command: new `cards` app, several fields promoted out of `details`, pricing links kept but not pricing numbers, two prior open items resolved

Why

- **New `cards` Django app**, not added to `core` — ARCHITECTURE.md's own "Django responsibilities" list separates "Card import" from "Authentication," and `core` today is purely the auth/health-check layer. Phase 5 (Collections/Favorites) and Phase 6 (Quiz) will define models FK'ing into Card, so `cards.models.Card` reads correctly as the card-domain app's own model
- **Verified live against the real API** (its docs site 403s on fetches, same as earlier in this project, so the actual `api.pokemontcg.io` endpoints were queried directly): `hp`/`number` are strings, not numbers; Trainer-supertype cards have no `hp`/`types` fields at all (confirms Decision 017's design was necessary, not speculative); `evolvesTo` is an array (branching evolutions, e.g. Eevee → 8 eeveelutions) while `evolvesFrom` is a single string; `subtypes` (evolution stage/card category) is confirmed distinct from `types` (elemental type, already normalized via the `Type` model) — verified simultaneously on the same card (Eevee: `types: ["Colorless"]`, `subtypes: ["Basic"]`)
- **Resolves two prior open items**: neither the Card nor Set object has any language field at all, strongly suggesting the API is English-only by nature (Decision 006's open item); the Set object has an `updatedAt` field (Decision 008's open item) — it exists, but timestamp-diffing logic isn't built now (would be scope creep beyond models + sync command), it's simply stored in `Set.details` for a possible future enhancement, per Decision 016's already-cheap promotion path
- **Real schema gap found and fixed**: `Set` had no field for the API's own set identifier, but the sync command cannot resolve which local Set a card belongs to without one. Added `tcg_id` (required), plus `image_symbol`/`image_logo` as real columns (ARCHITECTURE.md's "Guess the Set" quiz mode names a use for the symbol specifically) and a `details` JSON field for genuinely render-only leftovers (`ptcgoCode`, `legalities`, `printedTotal`, `total`, `updatedAt`)
- **More Card fields promoted to real columns than originally planned**: `artist`, `national_pokedex_numbers`, `subtypes`, `evolves_from`, `evolves_to` — all cheap (scalar or simple array fields), no new tables needed
- **`attacks`/`weaknesses`/`resistances` promoted to full related tables** (`Attack`, `Weakness`, `Resistance`, each FK'd to Card; `Weakness`/`Resistance.type` reuse the `Type` lookup table rather than duplicating type-name strings a third time) — a deliberate scope expansion beyond Decision 016's "defer until a query need exists" default, chosen despite no current feature needing to query by attack damage or weakness type. Recreated (deleted and reinserted) on every sync of a card rather than diffed, since they're pure derived data from the API, never user-edited
- **Pricing (`tcgplayer`/`cardmarket`) numbers excluded entirely, but their `url` fields kept** as `tcgplayer_url`/`cardmarket_url` — a stored price snapshot would silently go stale under the diff-by-set design (an already-`imported` set is never revisited), actively misleading rather than just unused, and the API's own docs disclaim pricing as informational-only anyway. A link to the live pricing page doesn't have this problem, since it points at a page that updates itself rather than a frozen number
- **One migration** for all six models (`Set`, `Type`, `Card`, `Attack`, `Weakness`, `Resistance`) — introduced together with FK/M2M dependencies and no independent history to preserve
- **`responses`, not `requests-mock`**, for mocking the sync command's HTTP calls in tests — fits this project's existing `unittest`-style `TestCase`/`APITestCase` pattern better, and supports both ordered/sequential responses (needed for the 429-then-success retry test) and ignores query-string differences by default (needed since pagination varies `page`/`q` params against the same URL)
- Django admin registered for all six models now (cheap, and this phase explicitly ends in "verify real data landed correctly") — `Attack`/`Weakness`/`Resistance` as `TabularInline` on the Card admin page

---

## Decision 026

Dropped the `(set, number, language)` unique constraint on Card — real sync data disproved the assumption behind it

Why

- Earlier research (during initial planning, before any real data existed) concluded every printed card gets a unique number within a set. Running the actual sync against the live API falsified this **twice**: `cel25c` (Celebrations: Classic Collection) card #15 is genuinely 4 distinct cards (Venusaur, a Trainer card, Claydol, Rocket's Zapdos) sharing one printed number as a special 4-way "puzzle" promo mechanic; `zsv10pt5` (Black Bolt, a current-era set) hit the same collision on #60 — not just one obscure legacy exception
- `tcg_id` (the API's own identifier, already `unique=True` and already what the sync's upsert keys on) was never at risk — it correctly distinguishes `cel25c-15_A1` from `cel25c-15_A2`, etc. The dropped constraint wasn't protecting anything real; it was actively blocking real data from importing
- Fixed via a second migration removing the constraint, rather than special-casing the specific sets — no code exists that special-cases would improve, and `tcg_id` already fully covers actual card identity
- A concrete example of why a "prove it live" sync run matters even after research and unit tests pass: fixture-based tests only exercise the shapes you thought to construct, not what the full real catalog actually contains

---

## Decision 027

`react-router-dom` adopted for frontend page navigation (Phase 3)

Why

- Phase 3 needed a card list page and a card detail page. The alternative — a router-free single component switching views via local state — has no shareable/bookmarkable URLs and no working browser back/forward, and would need revisiting anyway once Phase 4/5/6 add their own pages (login, collections, quiz)
- `createBrowserRouter`/`RouterProvider` (the current React Router idiom) is set up once in `App.tsx`; `main.tsx` is untouched since `App` already owns rendering the router
- `renderWithProviders` (the shared test helper) gained an optional `route` param that wraps the tree in a `MemoryRouter`, needed for any component reading `useParams`/`useNavigate`

---

## Decision 028

Cards/Sets/Types read API: `django-filter`, an added `Types` endpoint, unpaginated Set/Type lists, `AllowAny` for browsing

Why

- **`django-filter`** for `rarity`/`supertype`/`set`/`type` filtering on `GET /api/v1/cards/` — DRF's own recommended idiom for this exact case (a declarative `FilterSet`), rather than hand-parsing query params, which gets more verbose as filters stack up. `type` is a custom `CharFilter` (`types__name`, case-insensitive) so the frontend passes a human-readable name (`?type=Fire`) instead of needing a Type id first
- **`GET /api/v1/types/` added**, not previously listed in docs/api.md — the frontend needs the ~18 elemental types to populate a filter dropdown, and hardcoding that list client-side would drift from the DB, which is the actual source of truth after Phase 2's sync. A small, obvious extension of the Card/Set API work already underway, not a separate feature
- **`Set` and `Type` list endpoints are unpaginated** (`pagination_class = None`), unlike `Card`. Both are small, slow-growing lookup lists (174 sets, ~18 types) that the frontend needs *in full* at once to populate filter dropdowns — paginating them at the default page size would silently truncate the dropdown to the first page instead of showing every option
- **`AllowAny` on all three viewsets**, overriding the global `IsAuthenticated` default — browsing cards requires no login, matching the precedent already established for quiz-playing (Decision 011)
- **Default `PageNumberPagination`, page size 24**, capped at `max_page_size=100` via a small subclass (`cards.pagination.StandardPagination`) — prevents a client from requesting an unreasonably large page against a 20,479-row table
- **Explicit default ordering** (`Card` by `name, number`; `Set` by `name`) added to both querysets after DRF/Postgres warned that paginating an unordered queryset can yield inconsistent results across pages — a real correctness issue, not just a lint nag, caught by actually running the tests rather than assumed away
- Found and fixed while building this: Testing Library's automatic DOM cleanup between tests never registers under this project's `globals: false` Vitest config (auto-cleanup relies on detecting a global `afterEach`), so tests were silently leaking mounted DOM between runs. Fixed with an explicit `cleanup()` call in `afterEach` in `test/setup.ts` — a latent bug in the shared frontend test infrastructure, not scoped to this feature, but only surfaced once a test asserted on text that appeared twice across leaked renders

---

## Decision 029

Quiz image masking: server-side Pillow, lazy generate-and-cache, fractional regions with era-aware set-symbol placement

Why

- **Server-side generation only** — masking happens in Django before the image ever reaches the frontend, per the Backend Rules in CLAUDE.md (image generation is backend responsibility) and so the guessed field can never leak by inspecting network traffic; `questions.py` omits the guessed field from the payload entirely for the same reason
- **Lazy generate-and-cache**, keyed by `(mode, card)`, served from `MEDIA_ROOT`/`django-storages`-backed storage — matches the strategy already described in ARCHITECTURE.md's "Quiz generation" section: avoids recomputing on every request and avoids precomputing masks for the ~20k cards that may never be quizzed
- **Fractional (not pixel) regions** — `NAME_REGIONS`/`HP_REGION`/etc. are expressed as `(left, top, right, bottom)` fractions of the source image's own size, so the same region definitions work across the small/large image variants the API serves without per-size tuning
- **Deliberately generous regions, not pixel-exact** — the goal is reliably obscuring the answer, not surgical redaction; a slightly oversized black rectangle is a much smaller failure mode (a bit more of the card hidden) than an undersized one (the answer partially visible)
- **Era-aware set-symbol placement for `guess_set`** — the TCG set symbol has moved on the physical card layout over the game's history (WOTC-era flavor-line placement → post-e-Card bottom-right → Sun & Moon-onward bottom-left), derived from `Set.release_date`. `bp` (Best of Game) is special-cased to mask both possible regions since it reprints cards from multiple eras under one set
- **Rarity-tier eligibility for Trainer cards** (`SPECIAL_TIER_RARITIES` in `eligibility.py`) — ordinary Trainer cards aren't recognizable by name/set/HP alone the way a Pokémon card's art is, so only chase-tier Trainer rarities (Secret/Rainbow/Illustration Rare etc., covering both older and newer API naming for the same tiers) are quiz-eligible; Energy cards are excluded entirely. See ARCHITECTURE.md's "Quiz Eligibility & Rarity Filtering" and docs/decisions.md #017
- Alternative considered and rejected: generating masks at import time (`sync_cards`) for every card/mode combination. Rejected because most of the 20k-card catalog will never be selected for a quiz question, making eager generation mostly wasted work; the lazy approach leaves an explicit, additive path to warm the cache ahead of time for a subset later if a future timed mode needs it, per ARCHITECTURE.md

---

## Decision 030

Quiz frontend: persisted Zustand session (survives reload), explicit abandon-to-restart, manual score-save

Why

- **`quizStore.ts` (Zustand) holds session progress** (mode, questions, current index, answers, score), not local component state — unlike most UI state in this app, it must outlive `QuizPage` unmounting: navigating to browse cards and back, or a full reload, should not lose an in-progress quiz. This is a genuine cross-render-tree/cross-reload requirement, not a speculative one, so it doesn't fall under the "don't add stores for hypothetical future readers" caution that was raised (and rejected) while scoping this — see ARCHITECTURE.md's State Management section, which already assigned quiz-session progress to Zustand
- **`persist` middleware backed by `localStorage`**, unlike `authStore` (in-memory only). `authStore`'s in-memory-only choice is a security constraint specific to the access token (decisions.md #015) and doesn't generalize — quiz progress has no such sensitivity, and losing an unfinished quiz to an accidental refresh or a backgrounded mobile tab reclaiming the page is a worse outcome than the modest cost of `persist`'s localStorage schema
- **Starting a new quiz requires explicitly abandoning the in-progress one** (an "Abandon quiz" control on the question view) rather than mode selection always being reachable — visiting `/quiz` while a session exists resumes it directly instead of re-prompting for a mode
- **Score-saving is a manual "Save score" button on the summary screen, not an automatic POST on quiz completion** — avoids a hidden side effect tied to answering the last question, and naturally covers retry-after-failure and the edge case of a reload landing on an already-finished-but-unsaved session, without needing a mount-time effect to re-detect and resubmit
- **No frontend login flow exists yet** (Phase 4 frontend not started) — the quiz is fully playable unauthenticated (`AllowAny` per decisions.md #011); the summary screen shows "Log in to save your score" instead of the save button when `authStore` has no access token, rather than attempting a request that would 401
- Bug found via manual browser verification, not caught by the (MSW-mocked) test suite: `get_or_create_masked_image`'s storage-relative URL (`/media/quiz_masks/...`) was returned to the frontend as-is. Since the frontend and Django are different origins, the browser resolved it against the frontend's own origin and 404'd — the image never rendered. Fixed in `questions.py` by wrapping it in `request.build_absolute_uri(...)` before it reaches the response; this also passes an already-absolute URL through unchanged, so it keeps working if `MEDIA_URL`/storage backend changes later (e.g. a cloud storage backend for deployment, Phase 7)

---

## Decision 031

Cards page: series/set browsing sidebar replaces the "Set" dropdown

Why

- **Sets grouped by `Set.series` and sorted newest-first** (both the series themselves and the sets within each), reusing the existing unpaginated `GET /api/v1/sets/` response client-side — no backend/schema change, since `series` and `release_date` were already on the model and already returned by the API (added for Phase 3, decisions.md #028, but not previously surfaced in the UI)
- **Collapsible per series, not a flat list** — ~17 series and 174+ sets is too much to show expanded all at once; the series containing the currently-selected set starts expanded so navigating to a filtered card list doesn't hide where you are
- **Kept the existing top nav (Cards/Quiz) as-is** — this only replaces the "Set" dropdown in the Cards page filter bar with a persistent left sidebar scoped to that page; it does not become a site-wide layout, so `Layout.tsx`/`QuizPage.tsx` are unaffected
- **Series header and its own like-named set need distinct accessible names** — real data has series and sets that share a name (e.g. the "Mega Evolution" series contains a set also named "Mega Evolution"), which would otherwise give two buttons in the same view an identical accessible name. The series header's `aria-label` is "Expand/Collapse {series}" (visible text stays just the series name) so the two are unambiguous both for screen readers and in tests

---

## Decision 032

Card list: sort by Name or Number, natural (not lexicographic) sort for Number, default sort resets per set-filter context

Why

- **Sort field/direction (Name/Number, Ascending/Descending) resets to a context default whenever the set filter changes** — Number for a specific set (checklist order — what most people expect when browsing one set), Name for "All Sets" (Number has no coherent global meaning: every one of the 174+ sets has its own #1, so a global number-sort would just interleave unrelated cards from many sets). Confirmed with the user rather than assumed, since the alternative (remembering the user's last manual choice across context switches) was an equally reasonable option
- **`number` needed a real backend fix, not just a frontend `ordering` param** — `Card.number` is a `CharField` (not every printed number is purely numeric, e.g. "TG01", "SWSH001"), so the existing plain string `.order_by("number")` was already wrong: `1, 10, 100, 101, 102, 11, 12, ...` instead of `1, 2, 3, ... 10, 11, ...` — confirmed against real Base Set data before deciding this needed fixing rather than just wiring the UI up to already-broken behavior
- **`cards/ordering.py`'s `CardOrderingFilter`** (replacing plain `OrderingFilter` on `CardViewSet` only — `SetViewSet`/`TypeViewSet` keep the default) annotates a `number_numeric` field via Postgres `REGEXP_REPLACE(number, '\D', '', 'g')` (strip non-digits) wrapped in `NullIf`+`Cast`, and orders by that with the raw `number` string as a secondary tiebreaker. `NullIf` matters because ~32 real cards (puzzle-piece promos like "A", "B", "C") have *no* digits at all — stripping them yields an empty string, which errors casting straight to integer; `NullIf` turns that into a real `NULL` first, sorting last via `nulls_last=True` regardless of direction, rather than erroring or having them jump to the front on descending sort
- Alternative considered and rejected: a natural-sort library or Python-side sort. Rejected because the sort has to happen at the database level to work correctly with pagination (a Python-side sort would require pulling every matching row into memory first, defeating pagination) — a DB-level annotation was the only option that composes with the existing filter/paginate/search pipeline

---

## Decision 033

Card list filters/sort/page live in the URL, not component state; browser-back navigation from card detail; scroll position restored

Why

- **The problem**: `CardListPage`'s filters (set, search, rarity, supertype, type, sort, page) lived only in local `useState`. Visiting a card's detail page unmounts `CardListPage`; navigating back remounts it fresh, discarding all of that — every filter reset to its default, not just the set. Confirmed with the user this covered all filters, not only `set`, before implementing (see conversation) — fixing only `set` would have been an inconsistent partial fix for what is really one underlying bug
- **Filters/sort/page moved into the URL query string** (`/?set=2&ordering=number&page=1`, read via `useSearchParams`), so the exact view is encoded in the URL rather than component memory. This is the option that also makes the browser's own Back/Forward buttons work correctly (not just the in-app "Back to cards" link), and makes filtered views shareable/bookmarkable as a side effect — a smaller alternative (a persisted store, like `quizStore`) was considered and explicitly rejected by the user in favor of this, since a store wouldn't distinguish "hit back" from "clicked the Cards nav link fresh," and wouldn't give shareable URLs
- **Every filter/sort/page update uses `setSearchParams(..., { replace: true })`**, not the default push — otherwise every keystroke or dropdown change would push a new browser-history entry, and leaving the page would take many "back" presses instead of one. Only the navigation to a card's detail page (a real `Link` push) and returning from it are real history entries
- **Card detail's "Back to cards" is `navigate(-1)`**, not a `Link to="/"`. A fresh `Link to="/"` always points at the bare, unfiltered path — with filters now living in the URL, only a true history-back revisits the *exact* prior URL (filters intact). This is also why the top nav's "Cards" link is deliberately left as a plain `Link to="/"`: clicking it is a fresh start, not a "return," and resets to the unfiltered default — confirmed with the user this asymmetry (back restores, nav-link resets) was the intended behavior, not an oversight
- **Real bug found while implementing, not caught by the existing test suite**: the search-input debounce effect had `[searchInput]` as its only dependency, so its `setTimeout` callback closed over `searchParams` from whatever render the effect was last (re)scheduled in. If another filter (e.g. picking a set) changed the URL while that timer was still pending, the debounce firing 400ms later would overwrite the *entire* URL back to its state from before that other change — wiping out the set selection. `window.location.search` was tried as a fix and also rejected: it only reflects a real `BrowserRouter`, not the `MemoryRouter` this project's tests use, so it silently broke in tests while appearing to work in the browser. Fixed with a ref that mirrors the latest `searchParams` (kept current via a `useEffect`, not written during render — React's `react-hooks/refs` lint rule disallows the latter), read inside the timeout instead of a closure. A new regression test (`CardListPage.test.tsx`) types into search then immediately picks a set, asserting both survive
- **`<ScrollRestoration getKey={(location) => location.pathname} />`** (react-router-dom, added in `Layout.tsx`) restores scroll position when returning to a previous page. The default `getKey` (React Router's per-navigation `location.key`) doesn't work for this page: since every filter change is a `replace` that mints a new location object (and therefore a new default key) for the *same* logical page, the key active when scroll position was saved (before navigating to a card) frequently didn't match the key active when landing back on "/" — silently restoring to 0 instead of erroring, which made this easy to miss without deliberately checking. Keying by `pathname` instead treats "the Cards page" as one continuous scroll-restoration bucket regardless of which filters are active, which is what "go back to where I was" actually means here. Confirmed via real-browser testing (not just unit tests, since jsdom has no real layout/scrolling) — also caught a testing-methodology error along the way: Playwright's `.click()` auto-scrolls its target into view first, so clicking the DOM's first card tile (always positioned at the top) was itself resetting the scroll position being tested; the working verification clicks a card already visible at the scrolled-to position
- Known limitation, disclosed to the user before building this: scroll restoration isn't pixel-perfect in every case, since it can race against the card grid's async (React Query) load — in practice this project's real-browser testing found it lands correctly once React Query's cache is warm (the common case, since the exact same query was just run before navigating away), so this was accepted rather than engineered around further

---

## Decision 034

Rarity/Type/Supertype filter options are scoped to the selected set, and reset to "All ___" if they become invalid

Why

- **`GET /api/v1/rarities/`, `/types/`, and the new `/supertypes/` all accept an optional `?set=<id>`**, narrowing to values actually present in that set rather than every value in the whole catalog. Motivated directly by the user: browsing one set with a free-standing "Rarity"/"Type"/"Supertype" dropdown offering choices that can't possibly match anything in that set (e.g. "Rare Secret" in a set with no secret rares) is a dead end that just returns an empty grid — narrowing the options themselves prevents that combination from being reachable at all, rather than reachable-but-broken
- **New `GET /api/v1/supertypes/` endpoint**, replacing the frontend's hardcoded `['Pokémon', 'Trainer', 'Energy']` array — that hardcoded list had no way to know which of the three are present in a *specific* set, so making Supertype consistent with Rarity/Type's set-scoping required it to become a real, queryable endpoint rather than a static constant. Ordered by a fixed canonical list (Pokémon, Trainer, Energy), not alphabetically like Rarity — supertype has a small, well-known set of values with a conventional display order that alphabetical sorting wouldn't preserve, unlike rarity, where no such convention exists in the data
- **Selections that become invalid after switching sets auto-reset to "All ___"** (e.g. rarity was "Rare Holo EX" while browsing all sets, then a set with no such rarity is selected — rarity clears back to "All rarities") rather than silently keeping an impossible filter combination applied. This is implemented as three small `useEffect`s that compare the current filter value against the freshly-fetched, set-scoped options list once it loads, clearing the URL param (via the same `replace`-based `setSearchParams` pattern as the rest of this page, decisions.md #033) if the value isn't in it. Switching back to "All Sets" never needs this reset in the other direction: the global list is always a superset of any single set's list, so a value valid for some set is always valid globally too
- Alternative considered and rejected: keep the filter dropdowns global/unscoped and instead show "no results" messaging when a combination returns nothing. Rejected because it's strictly worse UX for the exact case the user raised — the dropdown would keep advertising choices that are guaranteed to produce an empty grid for the set you're currently looking at, rather than only ever offering choices that could work

---

## Decision 035

Browse an entire series at once ("All Mega Evolution"), not just one set at a time

Why

- **New `?series=` filter on `GET /api/v1/cards/`** (`CardFilter.series`, matching `Set.series` case-insensitively), alongside the existing `?set=` — a series (e.g. Mega Evolution) spans several sets, and there was no existing way to ask for "every card in this series" short of the frontend issuing one request per set and merging results, which would also break pagination/sorting/count across the merge. A single server-side filter keeps the existing paginate/sort/search pipeline working unchanged
- **`set` and `series` are mutually exclusive in the UI** — `SeriesSidebar` gained an "All {series}" item inside each expanded series group (alongside its individual sets), and selecting it clears any active `set`, while selecting a specific set clears any active `series`. Picking one always means "not the other," so there's no combined `set`+`series` case to reason about in the frontend, even though the backend filter would technically accept both independently
- **A series-view defaults to Name sort, like "All Sets," not Number** — same reasoning as decisions.md #032/#033: Number sort means "checklist order within one set," and a series spanning several sets has no single checklist order (each set still has its own #1). `handleSeriesSelect` always sets `ordering=name`, mirroring `handleSetSelect`'s behavior when clearing to "All Sets"
- **Rarity/Type/Supertype scoping (decisions.md #034) extended to `series` the same way it works for `set`** — a shared `scope_cards_by_set_or_series()` helper in `cards/views.py` picks whichever of the two the request provides (set taking priority, though the frontend never sends both). Without this, switching to a series view would still show every rarity/type/supertype in the whole catalog rather than just what's in that series, defeating the point of the same problem #034 solved for individual sets
- **Label is "All {series}"** (e.g. "All Mega Evolution"), matching the existing "All Sets" top-level item's naming convention, per explicit user preference over alternatives like "All Mega Evolution sets"

---

## Future Decisions

Caching and deployment target — deferred to Phase 7 (see ARCHITECTURE.md).
