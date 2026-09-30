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
- **Refined later**: the `pathname`-only key above meant clicking Next/Previous (also a `replace` navigation, so same key) restored whatever scroll position was saved on the *previous* page, landing you back at the bottom of a now-different set of cards instead of the top of the new page. Fixed by making the key `pathname` + the `page` query param for the Cards route only (`getScrollRestorationKey` in `Layout.tsx`, exported for testing): a page number the current session hasn't visited yet has no saved position, so React Router's own default (scroll to top) applies, while going back to a card detail page still resolves to the exact page-number bucket you left, unaffected. Deliberately scoped to pagination only, not search/filter/set/sort changes — those controls all live in the `.filters` bar above the card grid, which isn't sticky, so reaching them already requires being scrolled back near the top; keying by page number would have changed nothing visible there. New tests in `routing.test.tsx` stub `window.scrollY` and spy on `window.scrollTo` to assert the two cases (jsdom still can't verify real layout, so this was also confirmed live in a real browser, same as above)

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

## Decision 036

Name autocomplete (Cards search, Quiz guess-the-card), and a fairer answer check for prefixed card names

Why

- **New `GET /api/v1/card-names/`** (`?search=`, optional `?set=`/`?series=`) returns distinct card names starting with the given prefix, capped at 8 — a lightweight suggestion list, not the full paginated Cards endpoint. `NameAutocomplete.tsx` is a reusable combobox (ARIA `role="combobox"`/`listbox`/`option`, arrow-key navigation, Enter-to-select only when a suggestion is actually highlighted so it doesn't hijack form submission) layered on top of a plain controlled input — it doesn't own `value`, so each caller's own logic (the Cards page's debounced URL commit; the Quiz page's plain guess state) is untouched
- **Cards page suggestions are scoped to the current set/series** (same mechanism as decisions.md #034/#035); **Quiz page's guess-the-card input is deliberately left unscoped (global, whole catalog)**. This was explicitly discussed rather than assumed: scoping suggestions to a specific quiz question's small eligible pool could sometimes narrow to (or even reveal) the answer by elimination — a global list is the same regardless of which card the current question is actually about, so it carries no information about the answer. This only holds because it's fully global; scoping it to "this question's pool" would reopen exactly the leak decisions.md #029 was written to prevent
- **Ranked shortest-name-first, not alphabetically** — confirmed against real data before shipping: an alphabetical cap at 8 for the prefix "pi" never reached "Pikachu" or "Piplup" at all, crowded out entirely by "Pidgeot"/"Pichu" variant reprints (`Pidgeot ex`, `Pidgeot V`, `Pidgeot δ`, `Pidgeot-EX`, ...). Real card names cluster heavily around suffix-variant reprints of the same species, so alphabetical-with-a-cap systematically favors whichever species has the most reprints. The shortest matching name for a prefix is usually the unadorned species name, with no suffix-parsing required — verified this heuristic actually surfaces "Piplup" before shipping it, not just assumed it would
- **`guess_card` answer-checking now also accepts a card's name with a trainer-ownership or Dark/Light-variant prefix stripped** (e.g. "Typhlosion" for "Ethan's Typhlosion"; "Charizard" for "Dark Charizard") — found while discussing autocomplete for the Quiz page, then confirmed as a real, sizeable pattern against actual data (335 possessive-prefix cards, 85 Dark/Light cards) before deciding it was worth fixing, not just a rare edge case. Requiring the full name for these cards tests card-naming trivia, not "can you recognize this Pokémon," which is what the mode is for
- **The prefix-stripping is narrow and pattern-based** (a regex for `"X's "`, a two-item literal list for `"Dark "`/`"Light "`) rather than a general "accept the last word" heuristic. Checked against real multi-word species names first (Mr. Mime, Tapu Koko, Type: Null, Great Tusk) — a "last word" rule would have also accepted "Koko" for "Tapu Koko" or "Mime" for "Mr. Mime", which are genuine single indivisible species names, not a prefix + Pokémon. Neither pattern matches those, so they're correctly unaffected

---

## Decision 037

Sort Cards by release date, so every variant of a searched name (or an "All Sets"/"All {series}" view) can come back in the order the cards actually came out

Why

- **`Set.release_date` already existed** (populated from the real Pokémon TCG API payload during import, decisions.md #031's "newest series first" sidebar grouping already relies on it) — no schema or import change needed, just exposing and sorting by data already there
- **Exposed via an annotated `release_date = F("set__release_date")` on `CardViewSet`'s queryset** (`cards/views.py`), rather than a `set__release_date` ordering param — keeps the public API's `?ordering=` values flat/single-word, consistent with `name`/`number`/`rarity`, and avoids leaking the ORM's double-underscore join syntax into a query param
- **`CardOrderingFilter` (`cards/ordering.py`) gained a `release_date` case alongside its existing `number` numeric-sort handling** (decisions.md #032): sorting by `release_date` alone would group every card in the same set together in arbitrary database order, since they all share that set's single release date. A numeric `number` tiebreak (always ascending, regardless of the release-date direction) is appended automatically, so same-set cards still come out in checklist order
- **`release_date` added to `SetNestedSerializer`**, so it's visible on `card.set.release_date` in list/detail responses too (previously only `id`/`name`/`series`) — additive, backward-compatible
- **Deliberately scoped to a third Sort-by option, not a new default** — Name/Number stay the defaults for "All Sets"/a specific set/a series respectively (decisions.md #032/#033/#035); this is an opt-in choice for "show me these in the order they were printed," which only really makes sense across multiple sets (searching a name, or browsing all of a series/the whole catalog)
- Considered scoping this to search results only (since that's the motivating case) rather than a general sort option — rejected as an arbitrary restriction: it's exactly as meaningful for "All {series}" browsing with no search term, and a general `ordering=` option is simpler than a special case

---

## Decision 038

Sorting by Name or Number tiebreaks by release date too (e.g. every "Abra" print, or every card labeled "#1" across sets), with an optional oldest/newest toggle

Why

- **The gap ran the other direction from decisions.md #037**: that decision gave `release_date` sorts a `number` tiebreak; sorting by `name` or `number` alone had no tiebreak at all, so same-named cards (every "Abra") or same-numbered cards (every "#1") came back in arbitrary database order. `CardOrderingFilter` now appends `release_date` automatically whenever `name` or `number` is the sort and `release_date` isn't already one (avoiding a redundant/conflicting append when it is)
- **`?newest_first=true` controls the tiebreak's direction independently of the primary sort's own direction** — explicitly discussed with the user rather than assumed: the simpler option (reusing the existing Ascending/Descending control to also flip the tiebreak) was considered first, but the user specifically wanted the tiebreak direction choosable on its own, e.g. Name ascending (A→Z) with newest-print-first within each name group. Read directly off `request.query_params` in `CardOrderingFilter.filter_queryset` rather than routed through DRF's `ordering_fields`/`ordering` mechanism, since it's a modifier on the tiebreak, not a sortable field in its own right
- **A checkbox, not a third dropdown, and only rendered once Sort: Name or Sort: Number is selected** — discussed trade-offs with the user before building: the filter bar already has six controls (search, rarity, supertype, type, sort field, sort direction), and this only has any visible effect when there's an actual tie to break (mostly "All Sets"/"All {series}"/search views, not typical single-set browsing), so a permanent extra control would mostly do nothing. Hiding it otherwise keeps it out of the way without losing the value for the case it's for
- **Defaults to oldest-first (unchecked)** — matches what sorting by Name/Number already did the moment #037 shipped (no behavior change for anyone not using the checkbox), and reads naturally as "off = the plain, un-modified sort"
- **`newest_first` is silently ignored by a `release_date` sort itself** — that sort already has its own direction via `-release_date`; the frontend also never sends the param outside Name/Number sorts, though the checkbox's own checked state persists in the URL either way (harmless, and it means switching back to Name/Number resurfaces your last choice instead of forgetting it)
- Test fixtures deliberately decouple the expected result from every plausible wrong fallback (alphabetical name, numeric-ascending number, and insertion/id order) — an earlier version of the decisions.md #037 tests accidentally passed once by coincidence with real data that happened to already be alphabetized in release order, which this was written specifically to avoid repeating

---

## Decision 039

A card's image URLs occasionally 404 on the upstream Pokémon TCG image host — a new `check_card_images` management command detects and fixes this server-side, the frontend shows an honest placeholder for what can't be fixed, and card tiles now also show rarity

Why

- **Found by the user browsing real data, not synthetic**: one card (Aquapolis Aipom, `ecard2/67.png`) rendered as a generic card-back graphic in the grid instead of its actual art, though its detail page (which uses `image_large`) showed correctly
- **Root cause confirmed with a real network trace, not assumed**: `image_small`'s URL genuinely 404s, but the response body is itself a valid, decodable PNG (a placeholder), so the browser decodes and displays it successfully and never fires the `<img>` element's `error` event. A first attempt using an `onError`-triggered fallback was built, then proven (via `page.on('response')` + an injected error listener in a real browser) to never actually run for this failure mode — no error event fires when a "broken" response still decodes as a valid image. This meant the fix had to move server-side, where an HTTP client actually looks at the status code
- **`cards/images.py` + `check_card_images` management command**: HEAD-requests every card's `image_small` (and `image_large` if that fails) against the real image host and corrects the database — mirrors `sync_cards`' existing thin-command-over-plain-function structure. Not folded into `sync_cards` itself: it makes ~20,000 external requests to a *different* host (the image CDN, not the Pokémon TCG API), taking a few minutes — bundling that into every regular data sync would slow it down and add an unrelated failure mode. Meant to be re-run occasionally as maintenance, not automatically
- **Scanned the full real catalog (20,479 cards) rather than guessing scope, twice** — once to size the problem, once for real via the command: 52 cards affected (0.25%). Not systemic — the wider E-Card era sample (529 cards) had only the one originally-reported card. Of the 52, only 2 (this Aipom, and a Hidden Legends Groudon) had a working `image_large` to fall back to; the other 50 — concentrated in "McDonald's Collection" promo sets (2014/2015/2017/2018) — have *no* working image anywhere on the CDN, small or large
- **Explicitly asked the user how to handle those 50** rather than assuming: leaving them showing the CDN's misleading card-back placeholder (looks like a real successfully-loaded image) vs. an honest "No image available" placeholder of our own. Chose the honest one
- **`image_small`/`image_large` blanked to `""` in the DB for those 50, not left as the dead URL** — an empty string is the existing "field not present" convention in this codebase (same as blank `artist`/`rarity`), needing no schema/migration change (the columns are `blank=False` but not `null=False`-enforcing beyond form validation — a raw `""` write is a perfectly valid non-null value), and it's what the frontend now checks (`card.image_small ? <img> : <placeholder>`) instead of trying to render an image and hoping for the best
- **`image_large` added to `CardListSerializer`** (previously Detail-only) so the frontend has something to fall back to from the grid, not just the detail page
- **Card tiles now also show rarity** next to the set name (e.g. "Holon Phantoms · Uncommon"), a small unrelated UI request from the same conversation — same conditional-suffix pattern already used for artist on the line below (omitted when blank, e.g. Energy cards with no rarity)

---

## Decision 040

Case-opening reel plays before every quiz question, not just the first

Why

- **Originally noted in docs/ui-ideas.md as covering a real loading wait**: the idea's own description ties it to "doubles as the loading window while a masked quiz image is generated on first request." Traced the actual data flow before building anything: `QuizQuestionsView.get` (`quiz/views.py`) builds *every* question for the session in one list comprehension, and `build_question` synchronously calls `get_or_create_masked_image` for each — meaning all N images are already generated and cached by the time question 1 even renders. There's no backend latency left to hide on question 2 onward
- **Built for every question anyway, per explicit user request** ("I know that all the cards are predetermined but I think it would be a nice touch") — once the "hides real latency" justification didn't apply past question 1, this became a pure game-feel choice, which is a legitimate reason on its own
- **Decoys are plain rarity-tinted card-back rectangles, not real card art** — discussed with the user and refined into a flip reveal (spin → land on a card back → flip to the real, already-masked image), but the decoys themselves were deliberately kept free of any real Pokémon artwork. For "Guess the Card" mode only the name is masked, so a future question's real artwork briefly flashing through an earlier question's reel would be a genuine (if minor) spoiler; a generic rarity-tinted back has no information to leak
- **`QuizQuestionView` already fully remounts per question** (`key={session.currentIndex}` where it's rendered in `QuizPage.tsx`), so a plain local `isOpening` state (starting `true`) gives every question its own reel for free — no extra plumbing needed to make "every card after the first" work
- **The guess form is actually gated behind the reel, not just visually**: `isOpening` controls which JSX renders at all, not a CSS overlay — `NameAutocomplete`/the guess input don't exist in the DOM until the reel finishes, so a user (or an automated script) can't answer early. The winning slot's reveal `<img>` *is* present in the DOM from the moment the reel mounts (just visually flipped away via `backface-visibility`), which is deliberate — no reason to hide the image itself from assistive tech behind a purely decorative animation, only the interactive form
- **`startedAt` (for `time_taken_seconds`) moved to when the reel finishes, not component mount** — otherwise every recorded answer time would be inflated by the reel's own ~4.5s duration
- **Real `setTimeout`s drive the phase transitions, not `transitionend`** — same reasoning as elsewhere in this codebase (NameAutocomplete's debounce, the scroll-restoration work): CSS transition events are unreliable across browsers/jsdom, so timers are the source of truth for "when is this done," with CSS just matching those durations visually. `onFinish`'s own instability (a fresh inline function every parent render) is handled with the same ref-mirroring pattern already used for `fetchSuggestions` in `NameAutocomplete.tsx`
- **Respects `prefers-reduced-motion`**: skips straight to the revealed state rather than forcing the ~4.5s animation on someone who's asked for less motion
- **All 7 existing `QuizPage.test.tsx` tests needed updating**, not just new tests added — they previously waited on the "Card to guess" alt text to decide a question was ready to interact with, but that alt text is actually already present (on the reel's flipped-away reveal image) from the moment the reel mounts. Switched the wait condition to the guess form itself, which is the thing genuinely gated by the animation; a dedicated regression test now asserts the form is absent immediately after starting a quiz and only appears once the reel finishes
- **Refined after user feedback**: sized to match the real revealed card exactly (480px, confirmed by measuring the live page rather than guessing) and driven by one shared `--quiz-card-width` CSS variable on `.quiz-question`, read by the real `<img>`, the reel's viewport, and each reel item alike — resizing the card later (explicitly mentioned as likely) means changing that one variable, not touching `CaseOpeningReel.tsx`. The landing-position math was rewritten as a CSS `calc()` expression referencing that same variable instead of a JS pixel constant, for the same reason. Both spin and flip durations were roughly doubled (1800ms→3500ms, 500ms→1000ms) per direct feedback that the original pace didn't show off the animation
- **Two real bugs found via live-browser verification while making that change, neither catchable by jsdom**: (1) a decoy item's own `border` was adding to its rendered width on top of `width: var(--quiz-card-width)` instead of being drawn inside it (no project-wide `box-sizing: border-box` reset exists), silently drifting the landing position off-center by an accumulating amount across all 20 decoy items — fixed with `box-sizing: border-box` on `.case-opening-item`; (2) the track's `transform` only switched from its initial `translateX(0px)` to the landing offset *after* a full `SPIN_DURATION_MS` timer fired, meaning the CSS slide didn't visually start until the JS considered spinning already over, and the flip fired ~1s into a slide that takes `SPIN_DURATION_MS` to visually complete — fixed by decoupling a `started` flag (flipped via `requestAnimationFrame` right after mount, so the transition has something to animate *from* on the very next paint) from the semantic `phase` state, so the visual transition and the JS timers that gate the flip/reveal now actually start at the same moment. Both were verified fixed by reading the track's live computed `transform` matrix and comparing it against the expected `calc()` result, not just eyeballing a screenshot
- **Decoys became an actual "card back" look, not a plain gradient rectangle** — the user asked for something closer to a real Pokémon TCG card back with a rarity hue. Same non-affiliation constraint as decisions.md #018 (the header icon "inspired by a favorite Pokémon, not official Pokéball artwork") applies here too, since this is original artwork the app itself draws rather than a real card photo fetched from the API — so it couldn't just be the actual card back. Published two original options as a small preview artifact (a rarity-tinted panel with either a rotated-diamond mark or a centered ring-and-dot emblem) for the user to look at before writing any component code; they picked the ring. Implemented as a shared `CardBack` component (one definition of "what a card back looks like," used by every decoy and the winning slot's pre-flip face, rather than duplicating the markup) — plain CSS shapes (`border-radius: 50%` ring, absolutely-positioned dot and inset frame), no image asset. Making `.case-opening-back` an absolutely-positioned child that fills its parent, rather than a flex item carrying its own border directly, also structurally closes off the border/box-sizing drift bug two bullets up for the decoy case specifically — there's no longer a border on anything flex-sized at all
- **Decoys shrank to a fraction of the real card size, and the winning slot un-docks from the track to grow into full size as it flips** — modeled directly on a real CS:GO case-opening screenshot the user shared, where several neighboring items are visible on either side of the one landing under the pointer. `--reel-item-width: calc(var(--quiz-card-width) * 0.4)` (a new variable alongside `--quiz-card-width`, both on `.case-opening`) fits about 2.4 items across the same viewport width that used to show exactly one — the viewport itself stayed exactly one full card's size, since that's also precisely the size the winner needs to fill once grown, so nothing needed to change there
- **The landing math lost its earlier simplification**: decisions.md #040's original version exploited viewport-width-equals-item-width to collapse the centering formula down to `-(N × stride)`; with items now smaller than the viewport, that shortcut no longer holds, so the full formula (slide left by every decoy, then re-center by half the viewport, then back off by half an item) came back — still one `calc()` string over shared CSS variables, no JS pixel math
- **The winning slot is a separate, conditionally-rendered element, not a track member that grows in place** — growing a flex item's `width` while it's still laid out among fixed-width siblings only extends it to one side (flex items don't grow symmetrically around their own center), which would look like the card sliding sideways while enlarging rather than growing outward from where it landed. Instead: the track (with an in-flow, `--reel-item-width`-sized placeholder in the last slot) renders only while `phase === 'spinning'`; the moment it lands, the track unmounts and a *different*, absolutely-positioned element appears — centered via `left/top: 50%; transform: translate(-50%, -50%)`, starting at the same size and screen position the track's placeholder had a moment before (guaranteed identical by the landing math itself), so the swap is invisible, and then free to grow symmetrically around that fixed center point, decoupled from any flex layout
- **The reveal image is no longer in the DOM during the spin** — a real, if minor, regression from the original version of this decision (which deliberately kept the reveal `<img>` present-but-hidden from the very first frame, reasoning that assistive tech shouldn't have to wait out a purely decorative animation). Given the new architecture — the winning slot doesn't exist as its own element until landing — preserving that property would have meant rendering a second, hidden copy of the reveal image throughout the entire spin, adding real complexity for a minor accessibility nicety. Accepted the trade-off: the image (and the rest of the question content) now becomes available starting at the landed phase, not the very first spin frame — still well before the animation fully resolves, just not from t=0 like before. `CaseOpeningReel.test.tsx` updated to assert absence during the spin and presence once landed, rather than presence throughout
- **Test timeouts**: Vitest's 5000ms default was already marginal for a single ~4.5s reel wait and outright insufficient for the one test that waits through two in a row (resuming an in-progress quiz reloads the question, replaying its reel) — bumped `testTimeout` to 15000ms globally in `vitest.config.ts` rather than tuning each affected test individually, since the underlying cause (the reel's real duration) applies to all of them
- **Verification needed several iterations to get right, and the failures were informative, not just noise**: an early live-browser check misjudged the timing of its own follow-up assertions (assuming a fixed offset from a click would still be "mid-spin" without accounting for the script's own IPC round-trip overhead between calls), landing on `.case-opening-pointer`/`.case-opening-winner` sometimes before they existed and sometimes long after the sequence had already finished and unmounted. Switched to event-driven waits (`waitForSelector` on state changes, not `waitForTimeout` guesses) once the flakiness pattern was clear. Separately, a mid-transition bounding-box read produced a width/height pair that looked contradictory at first (84px wide, 500px tall) — not a bug: `getBoundingClientRect()` reports the screen-projected box during an active `rotateY`, which foreshortens the apparent width while height (untouched by a Y-axis rotation) still reflects the true in-progress grow value — the same phenomenon already noted once earlier in this file for a different mid-flip measurement
- **Trailing decoys added after the winning slot** — real CS:GO case-opening screenshots (the user's own reference) show a couple of items still visible past the one that landed, not just leading up to it. `TRAILING_DECOY_COUNT` (6) is a second, independent decoy array appended after the winner's in-track placeholder — deliberately separate from `DECOY_COUNT`, since the landing math only ever cared about what comes *before* the winner and stays that way; trailing items are purely cosmetic filler with no bearing on where the track lands

---

## Decision 041

Quiz length picker (Short/Medium/Long = 3/5/7 questions), shown below the mode-selection buttons

Why

- **The backend already supported an arbitrary `?count=`** (`QuizQuestionsView`, `quiz/views.py`) — clamped between 1 and `MAX_QUESTION_COUNT` (20) — so this was almost entirely a frontend addition; the only backend change was lowering `DEFAULT_QUESTION_COUNT` from 10 to 5 to match the frontend's new default, kept as a sane fallback even though the frontend now always sends `count` explicitly
- **Fixed labels (Short/Medium/Long) over a free-form number input**, per explicit user request — the three counts (3/5/7) map directly to those labels rather than exposing the raw numbers as the primary UI (the button text still shows the number in parentheses, e.g. "Medium (5)", so it's not hidden)
- **Rendered as a `radiogroup`/`radio` pair of buttons, not native `<input type="radio">`** — consistent with the existing custom-control pattern already used for `NameAutocomplete`'s option list, giving full control over styling (reusing the established `.active` treatment) while keeping it accessible via `aria-checked`
- **Placed directly below the existing mode-selection buttons**, per explicit user request, rather than above them or beside each mode button — the length applies uniformly across all three modes, so one shared picker made more sense than duplicating it per mode
- **Lifted to `QuizPage` state (`questionCount`), not local to `ModeSelection`** — the mutation that actually fires the request lives in `QuizPage`, so the picker's value needs to be readable there at mutate-time; `ModeSelection` stays a controlled, presentational component

---

## Decision 042

Fixed CI failing on both jobs (lint/format drift, plus a real `tsc -b` narrowing bug in one test)

Why

- **CI had been silently not running per-commit for a stretch**: pushes since decisions.md #037/#038/#039/#040 landed without `ruff format`/`ruff check`/`prettier --check` being run locally first, so formatting drift accumulated across several backend (`cards/ordering.py`, `cards/tests/test_images.py`, `cards/tests/test_views.py`) and frontend (`CaseOpeningReel.tsx`, `CardListPage.test.tsx`, `QuizPage.test.tsx`, `routing.test.tsx`) files without being caught. Both CI jobs failed as soon as they actually ran again (on decision #040's and #041's pushes) — the backend job at `ruff check` (one genuine `E501` line-too-long in `test_images.py`), the frontend job at `prettier --check`. Fixed by running `ruff format .` and `npx prettier --write .` across the whole tree rather than hand-fixing each file
- **A second, unrelated problem was hiding behind the first**: CI's frontend job runs Lint → Format check → Type check → Tests in sequence and stops at the first failure, so the format-check failure was masking a real `npx tsc -b` error in `CardListPage.test.tsx` (introduced by decision #038's commit) that would have failed CI on its own regardless. Confirmed by running the full local check sequence end-to-end after the formatting fix, matching `.github/workflows/ci.yml` step-by-step, rather than assuming one fix meant CI was green
- **The `tsc` error was a real, reproducible narrowing quirk in the pinned TypeScript version, not a mistake in the test's logic**: `let capturedParams: URLSearchParams | null = null;` reassigned inside an MSW request-handler closure, then read via `capturedParams?.get(...)` — the exact same pattern used successfully twice elsewhere in the same file — type-checked to `never` at every read site in this one test specifically. Isolated with a minimal reproduction outside the project (confirmed against fresh installs of three different TypeScript versions) before concluding it wasn't project-specific misconfiguration; never fully pinned down which exact statement triggers it despite bisecting the test body, so this is recorded as an observed compiler limitation to work around, not a fully explained one
- **Fixed by capturing into a ref object (`{ current: URLSearchParams | null }`) instead of a bare reassigned `let`** — reading `capturedParams.current?.get(...)` is a plain property access on every read, not a flow-narrowed local variable, so it doesn't hit whatever code path in the checker produces the bad narrowing. Scoped the fix to just this one test (the other two working usages of the bare-`let` pattern in the same file were left alone) rather than rewriting the pattern project-wide for a bug that, as far as could be determined, only manifests here
- **No test behavior changed** — this was purely a compile-time fix; the full backend (98% coverage) and frontend (73 tests) suites, plus `ruff check`/`ruff format --check`/`prettier --check`/`eslint`/`tsc -b`/migration-check, were all run locally end-to-end to confirm they match what CI actually runs before pushing

---

## Decision 043

Case-opening reel no longer replays for a question already revealed

Why

- **Found via live-browser testing, not a design ask**: decision #040 explicitly called replaying the reel on every remount "a deliberate simplification, not a bug," reasoning that no one would realistically leave and rejoin the quiz page within seconds. Testing showed the more common real case: navigating to Cards and back, or reloading, mid-quiz — genuinely disruptive to replay a ~4.5s animation for a card the player has already seen and may already be mid-guess on
- **A single `currentRevealed: boolean` added to the persisted `QuizSession`** (`quizStore.ts`), not a full history of revealed indices — only the question at `currentIndex` can ever be "in view" needing this, so tracking anything more (e.g. a set of all revealed indices across the whole quiz) would be unused state. Reset to `false` whenever `currentIndex` advances (`recordAnswer`), set to `true` by a new `revealCurrent` action called from the reel's `onFinish`
- **Piggybacked on the existing persistence rather than adding new plumbing**: `QuizSession` was already persisted via `zustand/persist` for the "quiz survives a reload" behavior (decisions.md #030), so this "was this question already shown" flag survives the exact same way, for free
- **`QuizQuestionView`'s `isOpening`/`startedAt` initial state read `session.currentRevealed` once at mount**, matching how the component already remounts fresh per question (`key={session.currentIndex}`, decisions.md #040) — no extra effect needed to sync it. `startedAt` is set immediately (not left null) when skipping the reel, so `time_taken_seconds` still starts counting from when the question actually became visible
- **`useState(() => ...)` (lazy initializer), not a bare value, for the `Date.now()` case** — a newer ESLint rule (`react-hooks/purity`) flags calling an impure function like `Date.now()` directly in a render-time expression; the lazy-initializer form is React's sanctioned "compute once at mount" pattern and satisfies the rule
- **An old, already-persisted session with no `currentRevealed` field** (from before this change) reads as `undefined`, which is falsy — so it safely falls back to the old "always show the reel" behavior for anyone mid-quiz when this ships, no migration needed
- **The existing "resumes after remounting" test's own comment (which said this replay was deliberate) needed correcting**, not just a new test added — it happens to unmount *before* the reel's `onFinish` actually fires (the reveal image appears at the 'landed' phase, well before `onFinish` fires at 'done' — decisions.md #040 addendum), so `currentRevealed` was never set and that test still validates the "not yet revealed" replay case correctly; a new test covers the already-revealed case by waiting for the guess form (proof `onFinish` ran) before unmounting
- **Verified live**: started a quiz, waited for the reveal, navigated to Cards and back — guess form appeared immediately, no reel, confirmed via computed page state rather than a screenshot alone; a hard reload showed the same

---

## Decision 044

Idle-then-accelerate reel: fills the quiz-start fetch pause with a slow idle spin instead of a dead pause, then hands off into the real spin

Why

- **The actual problem was dead time, not a jarring cut** — clicking a mode button had a brief, silent pause while the first question's card image was being generated/fetched, then the reel appeared abruptly. Considered a plain crossfade between mode-selection and the reel first, but that only smooths the edges of the pause, not the pause itself; went with the user's own comparison instead — a slot machine idling before the lever is pulled — since it actually fills the wait with something
- **`StartingReel` (new, in `CaseOpeningReel.tsx` alongside the existing reel)** renders a slow (14s per loop, CSS `@keyframes`, two copies of the same decoy list scrolled by exactly `-50%` for a seamless loop) scroll of the same generic card-back decoys the real spin already uses — no real card data needed, so it can start the instant a mode is picked, before the fetch even resolves
- **Hands off into the existing, *unmodified* `CaseOpeningReel`** once the real first question arrives, rather than teaching the real spin to also handle "no data yet." Keeps the already-carefully-tuned spin/landing/flip logic (decisions.md #040 and its addenda) untouched — `StartingReel` is purely additive, wrapping it
- **A brief opacity crossfade (`CROSSFADE_MS`, 250ms) at the handoff**, both views stacked in the same CSS grid cell rather than one replacing the other outright — the idle loop and the real spin's first frame are visually similar enough (both rows of tinted card backs) that a quick crossfade reads as an acceleration rather than a jump cut, without needing to solve exact position/velocity continuity between two independently-animated tracks
- **A `MIN_IDLE_DURATION_MS` floor (700ms)** before the handoff is allowed to happen even if data arrives instantly — otherwise a fast response would flash the idle view for a frame or two, which reads as a glitch rather than a deliberate "idling, then pulled" beat
- **A real, resilience-breaking bug found and fixed before this shipped**: the first working version created the quiz session only once the *entire* reveal animation finished (in `StartingReel`'s `onFinish`), instead of as soon as the fetch resolved like before this feature. That meant navigating away or reloading during the ~5s idle+spin+flip window — not a rare window, given the animation's own length — lost the whole fetched quiz, regressing the resilience decisions.md #030 established. Caught by the *existing* "resumes an in-progress quiz after remounting" test (docs/decisions.md #043) failing, not a new test — deliberately broke the fix afterward to confirm that same test fails without it, per this session's verification practice. Fixed by moving session creation back to the moment the fetch resolves (`onSuccess`, same timing as originally) while keeping `StartingReel` mounted continuously across that moment via a single derived condition (`pendingMode` set, and either no session yet or session exists but question 0 isn't revealed yet) — so persistence happens early, but the visual handoff still happens inside one continuously-mounted component, not across a hard branch swap
- **`revealCurrent()` (decisions.md #043's existing action) replaces the session's already-revealed flag** once `StartingReel` finishes, instead of `startSession` taking an "already revealed" flag — considered the latter first, but once session creation moved back to fetch-resolution time, nothing needed it anymore; removed before shipping rather than left as unused API surface
- **The question count is shown immediately** ("Question 1 of {questionCount}") during the idle/starting phase, using the count already known from the picker (decisions.md #041) rather than waiting for the real session — small continuity touch so the header doesn't flicker or go missing during the wait
- **Reduced motion skips the idle wait entirely, not just the idle animation** — `MIN_IDLE_DURATION_MS` and the crossfade only apply without `prefers-reduced-motion`; a user who's asked for less motion has nothing to gain from an artificial pause, and the underlying `CaseOpeningReel` already jumps straight to revealed for them (decisions.md #040)
- **A real ESLint error caught along the way**: `react-hooks/purity`'s newer `react-hooks/set-state-in-effect` check flagged a synchronous `setState` call inside an effect (the reduced-motion branch of the crossfade timer). Fixed by deriving that case directly during render (`showIdle = prefersReducedMotion ? !revealing : …`) instead of setting state from inside the effect — only the real (non-reduced-motion) timer-driven case still needs the effect
- **`usePrefersReducedMotion` extracted into a small shared hook** in the same file, once `StartingReel` needed the same check `CaseOpeningReel` already had — avoids duplicating the `matchMedia` check a second time now that two components in the file need it
- **Verified live** in a real browser with the API artificially throttled: screenshots confirmed the idle loop visibly scrolling before the real spin appears; the resilience fix was checked by navigating away mid-reveal and back, confirming the quiz survives (falls back to the existing not-yet-revealed reel replay, decisions.md #043, never back to mode selection); reduced motion was checked separately and finishes in a fraction of the normal timeline, confirming no artificial wait was added

---

## Decision 045

Quiz guess form: submit button stays beside the input on every mode, and "Guess the Set" gets the same name-autocomplete as "Guess the Card"

Why

- **The submit button was already visually beside the plain `<input>`** used for "Guess the HP" and (previously) "Guess the Set" — but `NameAutocomplete`'s outer wrapper is a `<div>` (block-level), so once "Guess the Card" started using it (decisions.md #036), the button landed on its own line below it instead, and the suggestions dropdown (absolutely positioned, spanning the div's own width) would render right on top of where that button was. Found by the user, not something jsdom-based tests would have caught (no real layout engine) — fixed live, confirmed with a screenshot
- **Fixed with `display: flex` on `.quiz-question form`**, not by changing `NameAutocomplete` itself — the div stays block-level, but as a flex item in a row it naturally shrinks to its input's width instead of stretching full-width, which also means the dropdown (still sized to its own parent) no longer has any excess width to cover the now-beside-it button with. One CSS rule fixes all three modes at once, plain `<input>` included, rather than a fix specific to the autocomplete case
- **"Guess the Set" now uses `NameAutocomplete` too**, reusing the exact same component "Guess the Card" already has, just with a different `fetchSuggestions`. Same non-leaking reasoning as decisions.md #036: the suggestion list is the full, unscoped set catalog, not narrowed to this question's eligible pool, so it can't hint at the answer
- **No new backend endpoint** — `GET /api/v1/sets/` already returns the full unpaginated set list (~174 today, see docs/decisions.md #028), small enough to fetch once and filter client-side per keystroke instead of adding a `set-names` endpoint mirroring `card-names` (decisions.md #036). Fetched via `useQuery({ queryKey: ['sets'], queryFn: getSets })` in `QuizQuestionView` — same query key `CardListPage` already uses for its own set list, so React Query's cache is shared rather than issuing a second independent fetch if a user visits both pages in one session; only re-fetched once per that cache's lifetime, not once per question or per keystroke
- **`filterSetNameSuggestions` is a small, pure, directly-testable function** (`api/cards.ts`) — prefix match, case-insensitive, deduped, capped at 8, alphabetical — deliberately kept separate from the `useQuery` call so it has no network/React dependency of its own to mock in tests
- **The user also asked whether "charizard" (lowercase) is accepted for "Charizard"** — yes, unchanged, already true and already documented: `check_answer` (`quiz/questions.py`) strips and lowercases both the guess and the real answer before comparing, for every mode. No code change needed, just confirmed by reading the existing implementation
- **Verified live**: screenshots of "Guess the Card" confirmed the submit button now stays visible beside the input with the suggestions dropdown open beneath it (previously fully covered); "Guess the Set" confirmed offering and accepting real set-name suggestions ("Base", "Base Set 2", "Battle Styles" for "ba") against the real synced catalog. A new regression test for the set suggestions was confirmed to fail without the fix (falls back to the plain input) before restoring it

---

## Decision 046

Name-suggestion search (card names and set names) matches anywhere in the name, not just as a prefix

Why

- **Two real, user-reported gaps in the same underlying assumption**: both the Quiz page's card-name suggestions (`GET /api/v1/card-names/`, decisions.md #036) and the new set-name suggestions (decisions.md #045) matched only a leading prefix. A card like "Mega Lopunny & Jigglypuff-GX" was never suggested when searching "Jigglypuff" (it's not a prefix), and a set like "SM Black Star Promos" was never suggested when searching "Black" — real, non-hypothetical cases confirmed against the synced catalog, not edge cases invented for the fix
- **`name__istartswith` → `name__icontains`** on the backend `card-names` endpoint; the frontend's `filterSetNameSuggestions` switched from `.startsWith()` to `.includes()` the same way, for the same reason
- **A minimum search length (2 characters) added to the backend endpoint itself**, not left to the frontend's existing `NameAutocomplete` `MIN_CHARS` alone — substring matching is far more expensive than prefix matching for very short queries: measured against the real ~4,453-distinct-name catalog, a single-character search like `"a"` matches ~70% of all names (3,079), versus a handful for a real 1-2 character *prefix*. `MAX_CANDIDATES` (the pre-ranking fetch cap) was raised from 500 to 2000 for the same reason — 500 was already being exceeded by ordinary 2-character substrings ("an" → 584, "ar" → 758 distinct names), which would have silently truncated *before* the shortest-name ranking ran, risking dropping the actual best match. No equivalent guard was needed for `filterSetNameSuggestions` — it filters an already-fetched ~174-item array in memory, not a database query, so even a pathological 1-character search costs nothing meaningful there (and `NameAutocomplete`'s own `MIN_CHARS` already prevents one from ever being sent through the real UI regardless)
- **A second real bug found via live-browser verification of the fix itself**: `filterSetNameSuggestions` was still sorting purely alphabetically (unlike `getCardNames`, which already uses shortest-name-first specifically to avoid this). Broadening to substring matching made the exact clustering problem #036 already solved for card names show up for sets too — searching "black" surfaced 12 real matches, 8 of them sharing the suffix "... Black Star Promos" with different era prefixes, and a plain alphabetical cap pushed "SM Black Star Promos" (the era actually being searched for) out of the top 8, crowded out by earlier-alphabet eras (BW, DP, HGSS, Nintendo). Fixed by applying the same shortest-name-first, alphabetical-tiebreak ranking `getCardNames` already uses
- **Verified live against the real synced catalog for both original reports**: `?search=jigglypuff` now returns `["Jigglypuff", "Erika's Jigglypuff", "Mega Lopunny & Jigglypuff-GX"]`; set suggestions for "black" now include "SM Black Star Promos" in the top 8. New backend tests for the substring match, the minimum-length rejection, and a tag-team-card regression test mirroring the exact reported case; new frontend tests for substring matching and the shortest-first ranking fix — all confirmed to fail without their respective fixes before being restored

---

## Decision 047

Quiz difficulty picker (Easy/Medium/Hard), mapped to rarity tiers — reversed from the "obvious" mapping, per explicit user direction

Why

- **The rarity-to-difficulty mapping is backwards from what "rare" suggests, deliberately**: the initial proposal was Easy = Common/Uncommon/Rare, Hard = chase tier, reasoning that a rarer card is objectively harder to reproduce. The user reversed this: most players recognize a distinctive chase card's set/era on sight, while commons are easy to confuse across different sets precisely because there are so many near-identical ones. Implemented exactly as directed rather than the initially-proposed mapping — a real product/game-feel call, not a technical one, and the user's read on their own players is the one that matters here
- **Reuses the existing "chase" tier (`SPECIAL_TIER_RARITIES`, `quiz/eligibility.py`) for Easy** rather than defining a new list — that set already exists for a related reason (deciding Trainer-card eligibility, decisions.md #017) and is the authoritative, already-tested source for "distinctive enough to recognize," so Easy inherits it directly instead of risking a second, slowly-drifting copy
- **Hard is an explicit small set (`{"Common", "Uncommon", "Rare"}`)**; **Medium has no enumerated list of its own** — it's implemented as "eligible and not Easy, not Hard" (a Django `.exclude()`, not an inclusion list). A future data sync introducing a new rarity string falls into Medium automatically instead of being silently excluded from every difficulty until someone remembers to add it to an enumerated list — the same forward-compatibility reasoning already applied to `filterSetNameSuggestions`' "everything else" set-name matching (though there it was about substring search, not rarity)
- **New `difficulty` query param on `GET /api/v1/quiz/`, not just a frontend-side `rarities` list** — `rarities` (already existing) only supports inclusion (`rarity__in`), so Medium's "exclude two known sets" logic couldn't be expressed through it at all without enumerating Medium's rarities explicitly on the frontend, which would need to be kept in sync with the backend's rarity data by hand. Keeping the mapping and its logic entirely server-side matches the project's standing rule that business logic belongs in Django, not React
- **No changes needed to `getQuizQuestions` beyond adding the param** — the frontend API client already had a `rarities?: string[]` slot from before any UI used it; `difficulty` was added the same way, and `QuizPage`'s difficulty state just flows into the existing mutation call, the same pattern the quiz-length picker (decisions.md #041) already established
- **Reused the "Quiz length" picker's exact visual pattern** (radiogroup of pill buttons, one active) rather than inventing a new one, placed directly above it per the user's explicit request — the underlying CSS classes (`.quiz-count-label`/`.quiz-count-picker`) were renamed to the generic `.quiz-picker-label`/`.quiz-picker` so both pickers share one definition instead of duplicating a near-identical block; a new `.quiz-picker-description` shows one line of human-readable rarities for whichever difficulty is currently selected, updating as the selection changes, rather than trying to fit a description under all three buttons at once
- **Verified against the real synced catalog, not just the fixture-based test suite**: `?difficulty=easy` returned only chase-tier rarities (Rare Ultra, Rare Secret, Illustration Rare, ...) and `?difficulty=hard` returned only Common/Uncommon/Rare, both checked directly against live API responses. New backend tests (eligibility-level and view-level, including the invalid-difficulty 400 case) and a new frontend test (default selection, description text updates, and the chosen difficulty is actually sent) — each confirmed to fail without its respective fix before being restored

---

## Decision 048

Quiz mode buttons are a row of three boxy tiles, not a stack of thin bars

Why

- **The three "Guess the ___" buttons were plain, unstyled, full-width, stacked buttons** — small and easy to overlook next to the Difficulty/Quiz length pickers added since (decisions.md #041, #047). The user asked for a row of three taller rectangles instead
- **A fixed `min-height` (92px) on a flex row, not `aspect-ratio` or a large fixed size** — the user explicitly didn't want the page pushed down; a modest height increase (from the browser-default ~36px to 92px, an extra ~56px total) reads as a deliberate tile rather than a thin bar without meaningfully affecting what's visible on load. Checked directly: the full mode-selection screen (mode tiles, difficulty picker + description, quiz length picker) still fits inside an 800px viewport with zero scrolling
- **Same color tokens and hover treatment as the Difficulty/Quiz length pill buttons** (`var(--border)`, `var(--bg)`, `var(--accent-bg)`, `var(--accent-border)`) — a different shape (rounded rectangle vs. pill) for a different kind of control (a one-shot navigation action vs. a persistent selection), but the same visual language, not a third ad hoc button style on one page
- **Verified live** at a real 1280×800 viewport: three roughly-square tiles side by side, page height exactly matches viewport height (no scroll needed)

---

## Future Decisions

Caching and deployment target — deferred to Phase 7 (see ARCHITECTURE.md).
