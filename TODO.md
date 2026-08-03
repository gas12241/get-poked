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
