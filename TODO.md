# Current Sprint

## Repository

- [x] Create GitHub repository
- [x] Create README
- [x] Create CLAUDE.md
- [x] Create ARCHITECTURE.md
- [x] Create ROADMAP.md
- [x] Create TODO.md
- [x] Create .gitignore

---

## Backend

- [x] Create Django project
- [x] Install DRF
- [x] Install `djangorestframework-simplejwt` (see docs/decisions.md #010) — cookie-based refresh flow implemented in `core/`
- [x] Install `django-cors-headers`; configure explicit origin allowlist via env var (see docs/decisions.md #023)
- [x] Configure Ruff (lint + format)
- [x] Add `POKEMON_TCG_API_KEY` to `.env.example` usage in settings (see docs/decisions.md #022)

---

## Frontend

- [x] Create React app (Vite, TypeScript template — see docs/decisions.md #021)
- [x] Verify React runs — live end-to-end check: page renders and fetches real status from the Django backend via React Query
- [x] Install React Query (see docs/decisions.md #015)
- [x] Install Zustand (see docs/decisions.md #015) — `authStore.ts`, in-memory access token only
- [x] Configure ESLint + Prettier — kept over the Vite template's default Oxlint (see docs/decisions.md #024); `eslint-config-prettier` bridges the two

---

## Testing

- [x] Configure Django testing (Postgres test database — see docs/decisions.md #019) — verified via `core/tests.py`, 5 passing tests against a Postgres test DB
- [x] Configure React testing (Vitest + React Testing Library + MSW — see docs/decisions.md #019) — verified via `apiClient.test.ts` + `HealthCheck.test.tsx`, 5 passing tests using MSW-mocked network responses

---

## CI

- [x] Create GitHub Actions workflow: backend tests (with Postgres service container), frontend tests, lint, type check, migration check, coverage reporting (see docs/decisions.md #020) — verified via a real run on PR #1, both jobs green

---

## Documentation

- [x] Update README

---

## Phase 2 — Database & Import

- [x] Set/Card/Type models, plus Attack/Weakness/Resistance as related tables (see docs/database.md, docs/decisions.md #025) — dedicated `cards` app
- [x] Import Pokémon cards — `sync_cards` management command (diff-by-set upsert, `--set`/`--force` flags, rate-limited + retrying HTTP client)
- [x] Backend tests — 21 passing (models + sync logic + management command + retry/backoff), fixtures built from real API payloads
- [x] Full sync run against the real API — verified: 174/174 sets imported, 20,479 cards (matches the API's own `totalCount`)
- [x] Fixed a real bug found via the live sync run: dropped the `(set, number, language)` unique constraint after real data disproved the uniqueness assumption behind it (see docs/decisions.md #026) — `tcg_id` is the actual identity guarantee

---

## Phase 3 — Search/Filter/Pagination/Card Details

- [x] Backend: `GET /api/v1/cards/` (search, filter by rarity/supertype/set/type, pagination, sorting), `GET /api/v1/cards/{id}/`, `GET /api/v1/sets/`, `GET /api/v1/types/` — `django-filter`, explicit List/Detail serializers, `AllowAny` (see docs/decisions.md #028)
- [x] Backend tests — 17 passing (pagination shape, each filter individually and combined, search, ordering, nested detail data, 404, no-auth-required)
- [x] Verified against real synced data: pagination/search/filtering/nested detail all correct against the full 20,479-card dataset
- [x] Frontend: `react-router-dom` adopted (see docs/decisions.md #027) — `CardListPage` (search, filters, pagination) and `CardDetailPage` (full detail incl. attacks/weaknesses/resistances)
- [x] Frontend tests — 14 passing (list rendering, filter/search query params, pagination controls, detail rendering); fixed a latent test-cleanup bug in shared test infra along the way (see docs/decisions.md #028)
- [x] Manual end-to-end verification: both servers running live, browsed/searched/filtered/paginated real cards and navigated into a detail page in an actual browser
- [x] `SeriesSidebar` — replaced the "Set" filter dropdown with a collapsible sidebar grouping sets by series, newest-first (see docs/decisions.md #031); 6 new tests, existing set-filter test updated to match; verified live in a browser against the real 174-set catalog
- [x] Slide animation + direction chevron on series expand/collapse
- [x] Sort by Name/Number (asc/desc); fixed a real backend bug where Number sort was a plain string sort (`1, 10, 100...`) instead of numeric — `CardOrderingFilter` in `cards/ordering.py` (see docs/decisions.md #032). Sort defaults to Number when a set is selected, Name for "All Sets", resetting on each set-filter change. 5 new backend tests, 3 new frontend tests; verified live against real Base Set data (correct 001-102 order)
- [x] Filters/sort/page moved into the URL query string; going back from a card's detail page (in-app link or browser back) now restores the exact previous view and scroll position, instead of resetting to the unfiltered default — see docs/decisions.md #033. Along the way, fixed a real stale-closure bug in the search debounce (could clobber a filter picked while a search commit was still pending) and got `<ScrollRestoration>` actually working for a query-string-filtered page (needed a custom `getKey`, not the library default). 3 new/updated frontend tests including a full list→detail→back routing round trip; verified live in a browser
- [x] "Get Poked" moved into the top nav as a centered, clickable brand link (back to the unfiltered Cards page); Cards/Quiz kept top-left, theme toggle top-right, via a 3-column nav grid
- [x] Rarity filter is now a dropdown (`GET /api/v1/rarities/`, distinct non-blank values, alphabetical) instead of free text — mirrors the existing Types dropdown pattern (decisions.md #028), since `rarity` has no dedicated model of its own. 4 new backend tests, 1 new frontend test; verified live against all 38 real rarity values
- [x] Rarity/Type/Supertype dropdowns are now scoped to the selected set (`?set=` on all three endpoints, new `GET /api/v1/supertypes/` replacing a hardcoded list); switching to a set where the current selection no longer applies resets it to "All ___" automatically — see docs/decisions.md #034. 6 new backend tests, 2 new frontend tests; verified live (39 rarities on All Sets narrows to 9 on a specific set, with an incompatible prior selection correctly reverting)
- [x] "All {series}" browsing — an item under each series in the sidebar (e.g. "All Mega Evolution") shows every card across every set in that series in one view, via a new `?series=` filter on Cards/Rarities/Types/Supertypes; defaults to Name sort like "All Sets" (a series has no single checklist order); mutually exclusive with picking a specific set — see docs/decisions.md #035. 9 new backend tests, 5 new frontend tests; verified live (979 cards across Mega Evolution's 6 sets in one view)
- [x] Top nav highlights the active section (Cards — including a card's detail page, not just the list — and Quiz), matching the sidebar's active-set styling, plus a hover tint. 5 new frontend tests
- [x] Search-box name autocomplete (`GET /api/v1/card-names/`, scoped to the current set/series), ranked shortest-name-first rather than alphabetically — fixed a real bug found before shipping where an alphabetical cap of 8 never surfaced "Pikachu" or "Piplup" for the prefix "pi", crowded out entirely by one species' variant reprints. `NameAutocomplete.tsx` is a reusable ARIA combobox. See docs/decisions.md #036. 8 new backend tests, 8 new frontend tests; verified live against real data
- [x] "Reset filters" button next to the sort controls — clears search/rarity/supertype/type only, deliberately leaving the current set/series selection and sort untouched (the sidebar's own "All Sets" already covers resetting that). Disabled when nothing is applied. 1 new frontend test
- [x] Fixed a real bug: clicking Next/Previous restored the previous page's scroll position instead of landing at the top of the new page, because scroll restoration was keyed only by pathname (docs/decisions.md #033) and pagination is a same-pathname `replace` navigation just like every other filter change. Now keyed by pathname + page number for the Cards route, so an unvisited page number has no saved position (scrolls to top) while going back from a card detail page still restores exactly — see docs/decisions.md #033 addendum. 2 new frontend tests; verified live in a browser
- [x] "Release date" added as a third Sort-by option — lets a search (e.g. every "Charizard" variant) or an "All Sets"/"All {series}" view come back in the order the cards were actually printed, not just alphabetically. `Set.release_date` already existed and was already trusted for the sidebar's newest-first grouping (decisions.md #031); this exposes it on `?ordering=release_date` via an annotated alias, with a numeric `number` tiebreak for cards sharing a release date (same set) — see docs/decisions.md #037. 4 new backend tests, 1 new frontend test; verified live against real data
- [x] Fixed a real bug in `NameAutocomplete`: clicking a suggestion re-opened the dropdown a moment later. Selecting a suggestion changes `value` to the full name, which re-triggers the same debounced-fetch effect (it depends on `value`), and that fetch usually still matches (a name starts with itself) — reopening with the same suggestion(s) right after picking one. Fixed with a ref that marks "this value change came from a selection, skip the re-fetch," cleared as soon as it's consumed so normal typing is unaffected. 1 new regression test; verified live in a browser
- [x] Sorting by Name or Number now tiebreaks by release date (e.g. every "Abra" print, or every card labeled "#1" across sets, otherwise came back in arbitrary order) — oldest first by default, or newest first via a "Newest print first" checkbox that only appears once Name/Number sort is selected (discussed with the user before building: a permanent third control would mostly do nothing outside "All Sets"/"All {series}"/search views). See docs/decisions.md #038. 5 new backend tests, 1 new frontend test; verified live against real data (11 real "Abra" prints, 1999–2025)

---

## Phase 6 — Quiz System (Backend)

- [x] `QuizAttempt`/`QuizAttemptAnswer` models — per-question detail, not just session score (see docs/database.md, docs/decisions.md #012)
- [x] Eligibility rules (`quiz/eligibility.py`) — baseline per mode plus rarity narrowing, chase-tier-only Trainer cards, Energy excluded (see docs/decisions.md #017/#029)
- [x] Server-side image masking with Pillow (`quiz/imaging.py`) — lazy generate-and-cache, fractional regions, era-aware set-symbol placement (see docs/decisions.md #029)
- [x] `GET /api/v1/quiz/` (question generation, `AllowAny`), `POST /api/v1/quiz/check/` (answer check, `AllowAny`), `GET`/`POST /api/v1/quiz-attempts/` (score recording, `IsAuthenticated`) — see docs/decisions.md #011
- [x] Backend tests — 33 passing (models, eligibility, imaging/masking, question generation, answer checking, attempt recording + auth)
- [x] Manual end-to-end verification against real synced data — see Phase 6 (Frontend) below, now that the quiz UI exists to drive it

---

## Phase 6 — Quiz System (Frontend)

- [x] `quizStore.ts` (Zustand, persisted to localStorage) — session survives in-app navigation and a full reload; explicit "Abandon quiz" required to start a new one instead of restarting mid-session (see docs/decisions.md #030)
- [x] `api/quiz.ts` — typed client for question generation, answer checking, attempt recording
- [x] `QuizPage.tsx` at `/quiz` — mode selection, one question at a time (masked image + hints for the non-guessed fields), immediate correct/incorrect feedback, end-of-quiz score summary
- [x] Manual score-save (button on the summary screen) only offered when authenticated; "Log in to save your score" shown otherwise — there's no frontend login flow yet (Phase 4 frontend not started), so this keeps the quiz fully playable without blocking on it
- [x] Nav added to `Layout.tsx` (Cards / Quiz) — first cross-page navigation the app has needed
- [x] Frontend tests — 6 passing (start/answer/complete flow, authenticated vs. unauthenticated summary, abandon, resume-after-remount); 22 passing frontend-wide
- [x] Fixed a real bug found via manual browser verification: quiz images weren't rendering because the backend returned a storage-relative media URL, which the browser resolved against the frontend's own origin. Fixed with `request.build_absolute_uri(...)` in `quiz/questions.py` (see docs/decisions.md #030)
- [x] Manual end-to-end verification: both servers running live in a real browser (Playwright), walked a full 10-question quiz to completion, confirmed the masked image actually renders, and confirmed an in-progress quiz survives a real full page reload
- [x] "Guess the Card" name autocomplete, deliberately unscoped (whole catalog, not the question's eligible pool) so suggestions can't leak the answer — see docs/decisions.md #036. Also: `check_answer` now accepts a card's name with a trainer-ownership ("Ethan's") or Dark/Light-variant prefix stripped, confirmed against real data (335 + 85 cards) and checked against genuine multi-word species names (Tapu Koko, Mr. Mime) to make sure the fix doesn't overcorrect. 6 new backend tests
