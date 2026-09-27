# API Documentation

## Overview

The React frontend communicates exclusively with the Django REST API.

The frontend should never directly access the Pokémon TCG API.

---

## Conventions

### Versioning

All endpoints are prefixed with `/api/v1/`. Adding the prefix now costs nothing; retrofitting it onto URLs a client already depends on later would not be free. See docs/decisions.md #013.

### Pagination

`PageNumberPagination` (`?page=`, `?page_size=`), response shape: `count`, `next`, `previous`, `results`. Card data is static between syncs, so page-number navigation (jump to page N) fits better than cursor pagination, which mainly protects against a scenario (rows shifting between requests) that doesn't apply here.

### Serializers

- Explicit `fields` lists on every `ModelSerializer` — never `__all__`.
- `Card` has separate List and Detail serializers: the list view (used for browsing/search, many cards on screen at once) stays light; the detail view carries the full payload.
- `Set` is nested inside `Card` responses as a lightweight sub-serializer (id, name, series), not duplicated in full.

---

## Authentication

### Google OAuth

POST /api/v1/auth/google/

Description

Authenticates a user using Google OAuth.

Status

Planned

---

### Login

POST /api/v1/auth/login/

Status

Planned

---

### Logout

POST /api/v1/auth/logout/

Status

Planned

---

### Register

POST /api/v1/auth/register/

Description

Creates an email/password account. Account cannot log in until email is verified (see docs/decisions.md #014).

Status

Planned

---

### Verify Email

POST /api/v1/auth/verify-email/

Description

Confirms a verification token and activates the account.

Status

Planned

---

### Resend Verification Email

POST /api/v1/auth/verify-email/resend/

Description

Throttled to prevent spamming a mailbox.

Status

Planned

---

### Request Password Reset

POST /api/v1/auth/password-reset/

Description

Always returns the same generic response regardless of whether the email is registered, to avoid revealing which emails have accounts. Throttled.

Status

Planned

---

### Confirm Password Reset

POST /api/v1/auth/password-reset/confirm/

Description

Validates the reset token and sets the new password.

Status

Planned

---

## Cards

### Get Cards

GET /api/v1/cards/

Purpose

Returns a paginated list of cards. Uses the List serializer (see Conventions).

Supports

- search — `?search=` (partial, case-insensitive match on `name`)
- filtering — `?rarity=`, `?supertype=`, `?set=` (Set id), `?type=` (elemental type name, case-insensitive, e.g. `Fire`), `?series=` (Set.series, case-insensitive, e.g. `Mega Evolution` — matches every card across every set in that series, see docs/decisions.md #035); any combination applies as AND
- pagination — `?page=`, `?page_size=` (default 24, max 100)
- sorting — `?ordering=` (`name`, `number`, `rarity`; prefix `-` to reverse). `number` sorts numerically (1, 2, ... 10, 11), not lexicographically as a plain string sort would (1, 10, 11, ... 2) — see docs/decisions.md #032

No authentication required (see docs/decisions.md #028).

Status

Implemented

---

### Get Card

GET /api/v1/cards/{id}/

Description

Returns the full Detail serializer: all Card fields plus nested `attacks`, `weaknesses`, `resistances`, and `types`. No authentication required.

Status

Implemented

---

## Sets

GET /api/v1/sets/

Description

Returns the full list of sets, unpaginated (see docs/decisions.md #028). Supports `?ordering=` (`name`, `release_date`). No authentication required.

Status

Implemented

---

## Types

GET /api/v1/types/

Params

- `set` — Set id (optional). Narrows to types actually used by at least one card in that set.
- `series` — Set.series (optional, case-insensitive). Narrows to types used anywhere across every set in that series. Ignored if `set` is also given. Neither given: every type in the database.

Description

Returns the list of elemental types (Fire, Water, etc.), unpaginated. Used by the frontend to populate the `type` filter on the Cards endpoint — scoped to the current set or series selection when one is active, so the dropdown never offers a choice that can't match anything. See docs/decisions.md #028, #034, #035. No authentication required.

Status

Implemented

---

## Rarities

GET /api/v1/rarities/

Params

- `set` / `series` — same semantics as on Types above.

Description

Returns the distinct, non-blank `rarity` values actually present on `Card` (optionally scoped to `set` or `series`), sorted alphabetically — a plain list of strings, not `{id, name}` objects, since `rarity` is a plain field on `Card`, not its own model. Used by the frontend to populate the `rarity` filter on the Cards endpoint as a dropdown instead of free text, since rarity names aren't something most users can type out reliably. See docs/decisions.md #034, #035. No authentication required.

Status

Implemented

---

## Supertypes

GET /api/v1/supertypes/

Params

- `set` / `series` — same semantics as on Types/Rarities above.

Description

Returns the `supertype` values actually present on `Card` (optionally scoped to `set` or `series`) — a plain list of strings. Unlike Rarities, order is the fixed conventional one (`Pokémon`, `Trainer`, `Energy`), not alphabetical, since supertype has a small, well-known set of values with an expected display order. See docs/decisions.md #034, #035. No authentication required.

Status

Implemented

---

## Card Names

GET /api/v1/card-names/

Params

- `search` — required; a name prefix (case-insensitive). Empty or omitted: `[]`.
- `set` / `series` — optional, same semantics as on Types/Rarities/Supertypes above. The frontend omits both when calling this for the Quiz page's guess-the-card input — see Description.

Description

Powers search-box typeahead suggestions: distinct card names starting with `search`, capped at 8. Ranked shortest-name-first (alphabetical as a tiebreak), not purely alphabetically — real names cluster around variant-suffixed reprints of the same species (`Pikachu`, `Pikachu ex`, `Pikachu V`, `Pikachu VMAX`, ...), so a plain alphabetical cap gets dominated by one popular species before ever reaching a different one; the shortest match for a prefix is usually the unadorned species name. Cards page suggestions are scoped to the current set/series like the other filter-option endpoints; Quiz page suggestions are deliberately left unscoped — scoping to a specific question's small eligible pool could sometimes narrow to (or even reveal) the answer, whereas a global, answer-independent list can't. See docs/decisions.md #036. No authentication required.

Status

Implemented

---

## Collections

Maps to the `CollectionEntry` model (docs/database.md) — owned cards, with quantity.

GET /api/v1/collections/

POST /api/v1/collections/

PATCH /api/v1/collections/{id}/

Description

Updates quantity for an owned card.

DELETE /api/v1/collections/{id}/

Status

Planned

---

## Favorites

Maps to the `Favorite` model (docs/database.md) — starred cards, independent of ownership.

GET /api/v1/favorites/

POST /api/v1/favorites/

DELETE /api/v1/favorites/{id}/

Status

Planned

---

## Quiz

Maps to `QuizAttempt`/`QuizAttemptAnswer` (docs/database.md).

### Get Quiz Questions

GET /api/v1/quiz/

Returns a randomly generated quiz.

Params

- `mode` — `guess_card`, `guess_set`, `guess_hp` (required)
- `count` — number of questions, default 10, capped at 20
- `rarities` — comma-separated list (e.g. `Ultra Rare,Secret Rare,Special Illustration Rare`) further narrowing the card pool within whatever's already eligible for the mode. Applies to all modes. Omitted or empty means no additional restriction.

Description

Baseline card pool eligibility depends on `mode` and supertype (see ARCHITECTURE.md "Quiz Eligibility & Rarity Filtering"):

- `guess_card` — Pokémon cards, any rarity; Trainer cards, only at/above the special-rarity tier (Ultra Rare, Secret Rare, Special Illustration Rare, and future equivalents); Energy cards excluded.
- `guess_hp` — Pokémon-only, any rarity (Trainer/Energy cards have no HP).
- `guess_set` — same rule as `guess_card`.

The `rarities` param narrows further within that baseline — it cannot make an otherwise-ineligible card (a common Trainer, or any Energy card) eligible. See docs/decisions.md #017.

Response is `{"questions": [...]}`, one object per question: `card` (id), `image` (absolute URL to the masked card image), `rarity`, `supertype`, `types`, plus whichever of `name`/`hp`/`set` are *not* the field being guessed for that mode. The guessed field itself is never present in the payload (see docs/decisions.md #029).

No authentication required (see docs/decisions.md #011).

Status

Implemented

---

### Check Quiz Answer

POST /api/v1/quiz/check/

Body: `{"card": <id>, "mode": "guess_card" | "guess_set" | "guess_hp", "guess": "<string>"}`

Description

Compares `guess` (trimmed, case-insensitive) against the actual value of the guessed field for `card` and `mode`. Returns `{"correct": <bool>, "answer": "<string>"}` — `answer` is always returned so the frontend can reveal the correct value, right or wrong.

No authentication required (see docs/decisions.md #011).

Status

Implemented

---

### Quiz Attempts

GET /api/v1/quiz-attempts/

POST /api/v1/quiz-attempts/

Description

Records a completed quiz session. `POST` body: `{"quiz_mode": "...", "answers": [{"card": <id>, "is_correct": <bool>, "time_taken_seconds": <float>, "order": <int>}, ...]}` — `score`/`total_questions` are computed server-side from `answers`, not trusted from the client. `GET` returns only the requesting user's own attempts (paginated, per the project-wide default).

Requires authentication (see docs/decisions.md #011).

Status

Implemented
