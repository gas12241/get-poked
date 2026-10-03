# Testing Strategy

## Philosophy

Every major feature should include automated tests.

A feature is not complete until its tests are complete.

---

## Backend

Test

- Models
- APIs
- Authentication
- Import command
- Quiz generation

Run

python manage.py test

Test database: Postgres, not SQLite — matches production, since the schema already relies on Postgres-specific behavior (the `details` JSONB field, unique-together constraints). SQLite would risk tests passing on behavior that differs in production. See docs/decisions.md #019.

External API mocking: import command tests mock the Pokémon TCG API's HTTP responses (fixture JSON, via `responses` or `requests-mock`) rather than calling the live API — keeps tests fast, deterministic, and independent of the real API's availability/rate limits.

Quiz image generation tests: assert structural properties (correct dimensions/format, no exception raised, masked region differs from the original) rather than exact pixel output, which would be brittle against any minor rendering change.

Registration/verification email tests: assert against `django.core.mail.outbox`, not the real `EMAIL_BACKEND` setting — Django's test runner always swaps in its own in-memory backend regardless of what's configured, so these tests work the same whether `EMAIL_BACKEND` is the dev console backend or (eventually) real SMTP. Expired-token behavior is tested via `override_settings(EMAIL_VERIFICATION_TOKEN_MAX_AGE=-1)` rather than a real sleep. Throttle-limit tests (`ScopedRateThrottle`) clear Django's cache in `setUp`/at the start of the test, since throttle counters persist across test methods in the same run otherwise (same client "IP").

---

## Frontend

Test

- Components
- User interactions
- API mocking (MSW — intercepts at the network level, so components exercise real React Query hooks against mocked responses rather than mocking the hooks themselves)

Run

npm run test:run (or `npm test` for interactive watch mode during development; CI uses `test:run` since plain `vitest` never exits)

---

## Future Goals

Target

80%+ coverage

Prefer testing behavior over implementation.

Regression tests required for bug fixes.

---

## CI

Runs in GitHub Actions on every push/PR: both test suites, linting (Ruff / ESLint+Prettier), a TypeScript check (`tsc -b`), a Django migration check, and coverage reporting against the 80%+ target above. No deployment step. See ARCHITECTURE.md "CI/CD" and docs/decisions.md #020, #021.
