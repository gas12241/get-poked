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
- `Card` has separate List and Detail serializers: the list view (used for browsing/search, many cards on screen at once) stays light; the detail view carries the full payload. The one exception is `image_large`, included on the List serializer too despite otherwise belonging to the "full payload" — it's a frontend fallback for the rare card whose `image_small` 404s on the upstream image host, not a display field in its own right — see docs/decisions.md #039
- `Set` is nested inside `Card` responses as a lightweight sub-serializer (id, name, series, release_date), not duplicated in full.

---

## Authentication

Paths below are flat (`/api/v1/register/`, not `/api/v1/auth/register/`) — this section originally planned an `/api/v1/auth/...` prefix, but the JWT/cookie mechanics (decisions.md #010) were actually built as `/api/v1/token/...`, and everything added since follows that same flat convention rather than mixing two styles. See docs/decisions.md #067.

### Register

POST /api/v1/register/

Description

Creates an email/password account (`{email, password}`). The account cannot log in until the email is verified (see docs/decisions.md #014, #067). Sends a verification email containing a signed, time-limited link. Throttled (10/hour).

Status

Implemented

---

### Verify Email

POST /api/v1/verify-email/

Description

Confirms a verification token (`{token}`) and marks the account verified. On success, also logs the account in — same response shape as Login below (`{access}` in the body, refresh token set as an httpOnly cookie).

Status

Implemented

---

### Resend Verification Email

POST /api/v1/verify-email/resend/

Description

`{email}`. Always returns the same generic response regardless of whether a matching unverified account exists, to avoid revealing which emails have accounts. Throttled (3/hour).

Status

Implemented

---

### Login

POST /api/v1/token/

Description

`{email, password}`. Returns `{access}` in the body; the refresh token is set as an httpOnly cookie (see docs/decisions.md #010). Rejects an unverified account with a clear, specific message (not genericized — the caller already proved they know the password, so there's no enumeration risk here, unlike Register/Resend above).

Status

Implemented

---

### Refresh

POST /api/v1/token/refresh/

Description

Reads the refresh token from the httpOnly cookie (not the request body). Returns a new `{access}` and re-sets the rotated refresh cookie.

Status

Implemented

---

### Logout

POST /api/v1/token/logout/

Description

Blacklists the refresh token (read from the cookie) and clears it.

Status

Implemented

---

### Google OAuth

POST /api/v1/google/

Description

`{credential}` — the signed ID token from Google Identity Services' frontend button, not an authorization code (no redirect flow). Verified server-side against Google's public keys and our own Client ID (the `audience` check). Finds or creates a `User` by the token's email, auto-verified; an existing unverified email/password account becomes verified and resolves to the same row (account linking by email, see docs/decisions.md #069). Same response shape as Login (`{access}` in the body, refresh token set as an httpOnly cookie).

Status

Implemented

---

### Request Password Reset

POST /api/v1/password-reset/

Description

`{email}`. Always returns the same generic response regardless of whether the email is registered (or verified), to avoid revealing which emails have accounts. Throttled (3/hour).

Status

Implemented

---

### Confirm Password Reset

POST /api/v1/password-reset/confirm/

Description

`{token, password}`. Validates the reset token (signed, 1h expiry — shorter than email verification's, since a leaked reset link is a more immediate takeover risk) and sets the new password. Also blacklists every outstanding refresh token for the account (ends any other active session) and logs the user in — same response shape as Login (`{access}` in the body, refresh token set as an httpOnly cookie).

Status

Implemented

---

## Profile

Requires authentication (`IsAuthenticated` — the project-wide default, not an explicit override; see docs/decisions.md #070).

### Get/Update Profile

GET or PATCH /api/v1/me/

Description

`email`, `first_name`, `last_name`, `is_verified`, `date_joined`, `has_usable_password` (computed, not a stored field — `false` for a Google-only account that's never set a password). PATCH only accepts `first_name`/`last_name`; the rest are read-only regardless of what's in the request body — changing your own email isn't supported yet (deliberately out of scope, see docs/decisions.md #070).

Status

Implemented

---

### Change Password

POST /api/v1/me/change-password/

Description

`{current_password, new_password}`. Rejects with the generic-sounding but specific "Current password is incorrect." if the current password doesn't match (no enumeration risk here — the caller is already authenticated as this account). On success, blacklists every other outstanding refresh token for the account (same as Password Reset above) but re-issues a fresh one for the request that made the change, so changing your own password doesn't log out the session you did it from.

Status

Implemented

---

## Cards

### Get Cards

GET /api/v1/cards/

Purpose

Returns a paginated list of cards. Uses the List serializer (see Conventions).

Supports

- search — `?search=` (partial, case-insensitive match on `name`; also accent-insensitive — e.g. `search=Poke` matches "Poké Vital A" — via a diacritic-stripped `name_ascii` field, see docs/decisions.md #060)
- filtering — `?rarity=`, `?supertype=`, `?set=` (Set id), `?type=` (elemental type name, case-insensitive, e.g. `Fire`), `?series=` (Set.series, case-insensitive, e.g. `Mega Evolution` — matches every card across every set in that series, see docs/decisions.md #035); any combination applies as AND
- pagination — `?page=`, `?page_size=` (default 24, max 100)
- sorting — `?ordering=` (`name`, `number`, `rarity`, `release_date`; prefix `-` to reverse). `number` sorts numerically (1, 2, ... 10, 11), not lexicographically as a plain string sort would (1, 10, 11, ... 2) — see docs/decisions.md #032. `release_date` is an alias for the card's set's `release_date` (e.g. every variant of a searched name in the order it was actually printed); cards sharing a release date (i.e. the same set) get a numeric `number` tiebreak, same as above — see docs/decisions.md #037. Conversely, `name`/`number` sorts tiebreak by `release_date` (e.g. every "Abra" print, or every "#1" across sets) — oldest print first by default, or newest first with `?newest_first=true` — see docs/decisions.md #038

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

Returns the full list of sets, unpaginated (see docs/decisions.md #028). Supports `?ordering=` (`name`, `release_date`). No authentication required. Small enough (~174 sets) that the Quiz page's "Guess the Set" name suggestions filter this same response client-side rather than calling a dedicated search endpoint — see docs/decisions.md #045.

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

- `search` — required; matched anywhere in the name, not just as a prefix (case-insensitive and accent-insensitive — e.g. `search=Poke` matches "Poké Vital A", see docs/decisions.md #060), and rejected outright below 2 characters. Shorter or omitted: `[]`.
- `set` / `series` — optional, same semantics as on Types/Rarities/Supertypes above. The frontend omits both when calling this for the Quiz page's guess-the-card input — see Description.

Description

Powers search-box typeahead suggestions: distinct card names containing `search` anywhere (e.g. `search=jigglypuff` finds "Mega Lopunny & Jigglypuff-GX", not just a card named exactly "Jigglypuff"), capped at 8. Ranked shortest-name-first (alphabetical as a tiebreak), not purely alphabetically — real names cluster around variant-suffixed reprints of the same species (`Pikachu`, `Pikachu ex`, `Pikachu V`, `Pikachu VMAX`, ...), so a plain alphabetical cap gets dominated by one popular species before ever reaching a different one; the shortest match is usually the unadorned species name. Cards page suggestions are scoped to the current set/series like the other filter-option endpoints; Quiz page suggestions are deliberately left unscoped — scoping to a specific question's small eligible pool could sometimes narrow to (or even reveal) the answer, whereas a global, answer-independent list can't. See docs/decisions.md #036, #046. No authentication required.

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
- `count` — number of questions, default 5, capped at 20. The frontend's quiz-length picker (Short/Medium/Long) always sends this explicitly as 3/5/7 — see docs/decisions.md #041
- `rarities` — comma-separated list (e.g. `Ultra Rare,Secret Rare,Special Illustration Rare`) further narrowing the card pool within whatever's already eligible for the mode. Applies to all modes. Omitted or empty means no additional restriction.
- `difficulty` — `easy`, `medium`, or `hard` (optional; 400 if given and not one of these). The frontend's difficulty picker sends this explicitly. `easy` is the existing chase-rarity tier (Ultra Rare, Secret Rare, Special Illustration Rare, ...); `hard` is Common/Uncommon/Rare; `medium` is everything eligible that's neither — deliberately the reverse of what "rare" suggests, since most players recognize a distinctive chase card's set on sight more easily than a common's. See docs/decisions.md #047. Composable with `rarities` in principle, though nothing sends both at once today.

Description

Baseline card pool eligibility depends on `mode` and supertype (see ARCHITECTURE.md "Quiz Eligibility & Rarity Filtering"):

- `guess_card` — Pokémon cards, any rarity; Trainer cards, only at/above the special-rarity tier (Ultra Rare, Secret Rare, Special Illustration Rare, and future equivalents); Energy cards excluded.
- `guess_hp` — Pokémon-only, any rarity (Trainer/Energy cards have no HP).
- `guess_set` — same rule as `guess_card`.

The `rarities`/`difficulty` params narrow further within that baseline — neither can make an otherwise-ineligible card (a common Trainer, or any Energy card) eligible. See docs/decisions.md #017.

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

---

## Horoscope

### Pull Today's Horoscope

POST /api/v1/horoscope/pull/

Description

Idempotent: the first call of a UTC calendar day creates a 7-card pull (5 Pokémon, 1 Trainer, 1 Energy, each drawn independently with weighted rarity odds — see docs/decisions.md #061) and returns `201`; any later call that same UTC day returns the existing pull unchanged, `200`. Response: `{"id": <int>, "pull_date": "YYYY-MM-DD", "pulled_at": "<ISO datetime>", "cards": [{"card": <CardListItem>, "supertype": "...", "rarity_tier": "common"|"mid"|"chase", "order": <int>}, ...]}`.

Requires authentication.

Status

Implemented

---

### Horoscope History

GET /api/v1/horoscope-pulls/

Description

Returns only the requesting user's own past pulls (paginated, per the project-wide default, newest first), same shape as a single pull from the endpoint above.

Requires authentication.

Status

Implemented
