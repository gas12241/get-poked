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

---

## Phase 6 — Quiz System (Backend)

- [x] `QuizAttempt`/`QuizAttemptAnswer` models — per-question detail, not just session score (see docs/database.md, docs/decisions.md #012)
- [x] Eligibility rules (`quiz/eligibility.py`) — baseline per mode plus rarity narrowing, chase-tier-only Trainer cards, Energy excluded (see docs/decisions.md #017/#029)
- [x] Server-side image masking with Pillow (`quiz/imaging.py`) — lazy generate-and-cache, fractional regions, era-aware set-symbol placement (see docs/decisions.md #029)
- [x] `GET /api/v1/quiz/` (question generation, `AllowAny`), `POST /api/v1/quiz/check/` (answer check, `AllowAny`), `GET`/`POST /api/v1/quiz-attempts/` (score recording, `IsAuthenticated`) — see docs/decisions.md #011
- [x] Backend tests — 33 passing (models, eligibility, imaging/masking, question generation, answer checking, attempt recording + auth)
- [ ] Manual end-to-end verification against real synced data (deferred until the frontend quiz UI exists to drive it)

---

## Phase 6 — Quiz System (Frontend)

- [ ] Not started
