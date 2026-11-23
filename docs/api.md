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

Creates an email/password account (`{email, username, password}`). `username` is required and unique independently of `email` (see docs/decisions.md #071). The account cannot log in until the email is verified (see docs/decisions.md #014, #067). Sends a verification email containing a signed, time-limited link. Throttled (10/hour).

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

`{email, password}`. Returns `{access}` in the body; the refresh token is set as an httpOnly cookie (see docs/decisions.md #010). Rejects an unverified account with a clear, specific message (not genericized — the caller already proved they know the password, so there's no enumeration risk here, unlike Register/Resend above). Throttled (10/min, shared with Google OAuth below — see docs/decisions.md #085).

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

`{credential}` — the signed ID token from Google Identity Services' frontend button, not an authorization code (no redirect flow). Verified server-side against Google's public keys and our own Client ID (the `audience` check). Resolves a `User` by Google's own stable per-account ID (the token's `sub` claim, stored as `google_sub`), falling back to matching by email only for accounts that signed in before this field existed — and backfilling it onto them the moment they're found that way (see docs/decisions.md #074). An existing unverified email/password account becomes verified and resolves to the same row. Google never supplies a username, so a new account gets one auto-generated from the email (see docs/decisions.md #071) — editable afterward from the profile page. Same response shape as Login (`{access}` in the body, refresh token set as an httpOnly cookie). Throttled (10/min, shared with Login above — see docs/decisions.md #085).

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

`{token, password}`. Validates the reset token (signed, 1h expiry — shorter than email verification's, since a leaked reset link is a more immediate takeover risk) and sets the new password. The token is single-use — it's bound to the account's password hash at issue time, so it stops matching the moment any reset with it succeeds (see docs/decisions.md #086). Also blacklists every outstanding refresh token for the account (ends any other active session) and logs the user in — same response shape as Login (`{access}` in the body, refresh token set as an httpOnly cookie).

Status

Implemented

---

## Profile

Requires authentication (`IsAuthenticated` — the project-wide default, not an explicit override; see docs/decisions.md #070).

### Get/Update Profile

GET or PATCH /api/v1/me/

Description

`email`, `username`, `first_name`, `last_name`, `avatar`, `is_verified`, `date_joined`, `has_usable_password` (computed, not a stored field — `false` for a Google-only account that's never set a password), `auto_remove_favorite_on_collect`. PATCH accepts `username`/`first_name`/`last_name`/`avatar`/`auto_remove_favorite_on_collect`; the rest are read-only regardless of what's in the request body — `email` changes through the dedicated Change Email endpoints below, not a direct PATCH (see docs/decisions.md #075). `username` is unique independently of `email`, same validator/format as at registration (see docs/decisions.md #071).

`avatar` is a full URL or `null`. Updating it needs `multipart/form-data` instead of JSON (`{"avatar": <file>}`) — JPEG/PNG/WebP only, 5MB max, server-side center-cropped and resized to a fixed 256×256 on upload (see docs/decisions.md #073). Send `{"avatar": null}` as a normal JSON PATCH to clear it back to no picture.

`auto_remove_favorite_on_collect` (boolean, default `False`) — opt-in; when `True`, adding a card to the collection (see Collections → List/Add below) also removes any existing Favorite for that card. PATCHing it from `False` to `True` additionally does a one-time cleanup, removing the Favorite for any card already in the collection at that moment — not just future adds. PATCHing it while already `True` (or omitting it) never re-runs that cleanup. See docs/decisions.md #084.

Status

Implemented

---

### Change Password

POST /api/v1/me/change-password/

Description

`{current_password, new_password}`. Rejects with the generic-sounding but specific "Current password is incorrect." if the current password doesn't match (no enumeration risk here — the caller is already authenticated as this account). On success, blacklists every other outstanding refresh token for the account (same as Password Reset above) but re-issues a fresh one for the request that made the change, so changing your own password doesn't log out the session you did it from. Throttled (5/min — see docs/decisions.md #087).

Status

Implemented

---

### Request Email Change

POST /api/v1/me/email-change/

Description

`{new_email, current_password}`. `current_password` is only checked (and required) for an account that has a usable one — a Google-only account skips the check entirely, since an authenticated session is already proof enough for it (see docs/decisions.md #075). Sends a signed, time-limited confirmation link to the *new* address (1h expiry, same salt/token pattern as email verification and password reset, see docs/decisions.md #068). Nothing changes until the link is confirmed. Throttled (3/hour).

Status

Implemented

---

### Confirm Email Change

POST /api/v1/email-change/confirm/

Description

`{token}`. No authentication required (the token itself identifies the account and the pending change — the same shape as Confirm Password Reset above). Re-checks the new email's uniqueness at confirm time, not just at request time, to guard the gap between the two. Unlike Confirm Password Reset, this does **not** issue new tokens or log anyone in — the requester was already logged in when they made the request; the confirming click only proves ownership of the new inbox.

Status

Implemented

---

### Delete Account

DELETE /api/v1/me/

Description

Soft delete, not immediate removal — sets `deleted_at`, blacklists every outstanding refresh token, and clears the refresh cookie. The account (and its quiz/horoscope history) is otherwise untouched. Logging back in — password or Google — within `ACCOUNT_DELETION_GRACE_PERIOD_DAYS` (30) automatically restores it by clearing `deleted_at`; no separate restore endpoint. Past that window, the (not yet scheduler-wired) `purge_deleted_accounts` management command permanently deletes it, cascading through `QuizAttempt`/`HoroscopePull`. See docs/decisions.md #076.

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
- `?owned=true` / `?favorited=true` — restricts to cards the authenticated requester has a `CollectionEntry`/`Favorite` for; composes with every other filter above (e.g. `?owned=true&series=Mega+Evolution`). Mutually exclusive on the frontend, but nothing stops both being sent together (AND'd, same as any other filter combination). Requires authentication — an anonymous request returns an empty result set (`count: 0`), not the full catalog. See docs/decisions.md #079
- pagination — `?page=`, `?page_size=` (default 24, max 100)
- sorting — `?ordering=` (`name`, `number`, `rarity`, `release_date`, `date_added`; prefix `-` to reverse). `number` sorts numerically (1, 2, ... 10, 11), not lexicographically as a plain string sort would (1, 10, 11, ... 2) — see docs/decisions.md #032. `release_date` is an alias for the card's set's `release_date` (e.g. every variant of a searched name in the order it was actually printed); cards sharing a release date (i.e. the same set) get a numeric `number` tiebreak, same as above — see docs/decisions.md #037. Conversely, `name`/`number` sorts tiebreak by `release_date` (e.g. every "Abra" print, or every "#1" across sets) — oldest print first by default, or newest first with `?newest_first=true` — see docs/decisions.md #038. `date_added` only resolves when `?owned=true` or `?favorited=true` is also present (it's `CollectionEntry.date_added`/`Favorite.date_added` respectively) — requesting it otherwise is dropped rather than erroring, falling back to the default order. See docs/decisions.md #080

No authentication required for a plain request — only `?owned=`/`?favorited=` need it, and silently return nothing rather than erroring when it's absent (see docs/decisions.md #028, #079).

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

Maps to the `CollectionEntry` model (docs/database.md) — owned cards, with quantity. Requires authentication; every endpoint below is scoped to the requesting user via `get_queryset()`, same as Quiz Attempts — another user's entry isn't forbidden, it simply isn't in the queryset (a `PATCH`/`DELETE` on one returns 404, not 403). See docs/decisions.md #077.

### List/Add

GET or POST /api/v1/collections/

Description

`GET` is paginated (24/page, the project default). `POST` takes `{card_id, quantity?}` (`quantity` defaults to 1); rejects a duplicate `(user, card)` with a 400, and `quantity < 1` with a 400. Response nests the full card (same shape as the Cards list endpoint).

If the requesting user has the `auto_remove_favorite_on_collect` profile setting on (see Profile → Get/Update Profile above), a successful `POST` here also deletes any existing Favorite for that card — a one-way side effect of adding to the collection, not the other direction (removing/decrementing a `CollectionEntry` never touches Favorites). Off by default. See docs/decisions.md #084.

Status

Implemented

---

### Update/Remove

GET, PATCH, or DELETE /api/v1/collections/{id}/

Description

`PATCH` takes `{quantity}` to change how many of a card you own. `DELETE` removes the entry entirely.

Status

Implemented

---

### Entries by Card

GET /api/v1/collections/by-card/

Description

`{card_id: {id, quantity}}` for every card the requesting user owns — unpaginated, since a card-browsing page needs to know the owned state of every card on screen at once, not one page of it. The `id` is what a quantity update or removal addresses.

Status

Implemented

---

### Stats

GET /api/v1/collections/stats/

Description

Summary numbers plus a per-set completion and per-rarity breakdown for the requesting user's own collection:

```json
{
  "total_unique_cards": 12,
  "total_quantity": 18,
  "total_favorites": 5,
  "by_set": [{"set_id": 1, "set_name": "Base", "owned": 8, "total": 102}],
  "by_rarity": [{"rarity": "Common", "count": 5}]
}
```

`total_quantity` sums raw quantity (duplicates count); `total_unique_cards`, `by_set.owned`, and `by_rarity.count` all count distinct cards instead. `by_set` only includes sets the user owns at least one card from, sorted by completion percentage descending. A card with no recorded rarity appears under `"rarity": ""` — the frontend, not this endpoint, relabels that "Unknown". See docs/decisions.md #078.

Status

Implemented

---

## Favorites

Maps to the `Favorite` model (docs/database.md) — starred cards, independent of ownership. Same authentication/scoping as Collections above.

### List/Add

GET or POST /api/v1/favorites/

Description

`GET` is paginated. `POST` takes `{card_id}`; rejects a duplicate `(user, card)` with a 400. Response nests the full card.

Status

Implemented

---

### Remove

DELETE /api/v1/favorites/{id}/

Status

Implemented

---

### Ids by Card

GET /api/v1/favorites/by-card/

Description

`{card_id: favorite_id}` for every card the requesting user has favorited — unpaginated, same reasoning as Collections' "Entries by Card" above.

Status

Implemented

---

## Quiz

Maps to `QuizAttempt`/`QuizAttemptAnswer` (docs/database.md).

### Get Quiz Questions

GET /api/v1/quiz/

Returns a randomly generated quiz.

Params

- `mode` — `guess_card`, `guess_set`, `guess_hp`, `guess_set_icon` (required)
- `count` — number of questions, default 5, capped at 20. The frontend's quiz-length picker (Short/Medium/Long) always sends this explicitly as 3/5/7 — see docs/decisions.md #041
- `rarities` — comma-separated list (e.g. `Ultra Rare,Secret Rare,Special Illustration Rare`) further narrowing the card pool within whatever's already eligible for the mode. Applies to the three card-based modes only — meaningless for `guess_set_icon`, which has no rarity concept.
- `difficulty` — `easy`, `medium`, or `hard` (optional; 400 if given and not one of these). For `guess_card`/`guess_set`/`guess_hp`, this is a rarity-pool tier: `easy` is the existing chase-rarity tier (Ultra Rare, Secret Rare, Special Illustration Rare, ...); `hard` is Common/Uncommon/Rare; `medium` is everything eligible that's neither — deliberately the reverse of what "rare" suggests, since most players recognize a distinctive chase card's set on sight more easily than a common's. See docs/decisions.md #047. For `guess_set_icon`, difficulty instead means *answer format* (see below), since a set has no rarity at all. Composable with `rarities` in principle, though nothing sends both at once today.

Description

Baseline card pool eligibility depends on `mode` and supertype (see ARCHITECTURE.md "Quiz Eligibility & Rarity Filtering"):

- `guess_card` — Pokémon cards, any rarity; Trainer cards, only at/above the special-rarity tier (Ultra Rare, Secret Rare, Special Illustration Rare, and future equivalents); Energy cards excluded.
- `guess_hp` — Pokémon-only, any rarity (Trainer/Energy cards have no HP).
- `guess_set` — same rule as `guess_card`. Shows a real card with its printed set symbol blurred out — the question is "what set is this card from," inferred from everything else on it.

The `rarities`/`difficulty` params narrow further within that baseline — neither can make an otherwise-ineligible card (a common Trainer, or any Energy card) eligible. See docs/decisions.md #017.

Response is `{"questions": [...]}`, one object per question: `card` (id), `image` (absolute URL to the masked card image), `rarity`, `supertype`, `types`, plus whichever of `name`/`hp`/`card_set` (the card's own set — `{id, name}`, a hint, not an answer) are *not* the field being guessed for that mode. The guessed field itself is never present in the payload (see docs/decisions.md #029).

- `guess_set_icon` — a different question entirely: the pool is `Set`, not `Card` (all synced sets except Base Set, which predates the printed symbol and has no set-specific icon). `difficulty` controls answer format, not a rarity pool: `easy`/`medium` return `choices` (4 or 8 `{id, name}` options, shuffled, with no marker for which is correct); `hard` omits `choices` entirely for a free-typed guess, same "never send the answer" principle. Response shape: `{"set": <id>, "image": "<absolute URL to the set's own icon, Set.image_symbol>", "choices"?: [{"id": <id>, "name": "<string>"}, ...]}` — no `card`/`rarity`/`supertype`/`types`/`name`/`hp`/`card_set` at all, since none of those exist for a set. Distractor sets for `choices` are chosen to plausibly resemble the target's own icon (same series, falling back to nearest-by-release-date; same-first-letter preference for a Scarlet & Violet-onward target's literal 3-letter code) — see ARCHITECTURE.md "Guess the Set by Symbol" and docs/decisions.md #096.

No authentication required (see docs/decisions.md #011).

Status

Implemented

---

### Check Quiz Answer

POST /api/v1/quiz/check/

Body: `{"card": <id>, "mode": "guess_card" | "guess_set" | "guess_hp", "guess": "<string>"}`, or for the set-icon mode, `{"set": <id>, "mode": "guess_set_icon", "guess": "<string>"}` — exactly one of `card`/`set` is sent, matching whichever the question's own payload carried.

Description

Compares `guess` (trimmed, case-insensitive) against the actual value of the guessed field for `card`/`set` and `mode`. For `guess_set_icon`, `guess` is the chosen set's *name* even in a multiple-choice round (the same human-readable string every other mode's guess already is), not its id. Returns `{"correct": <bool>, "answer": "<string>"}` — `answer` is always returned so the frontend can reveal the correct value, right or wrong.

No authentication required (see docs/decisions.md #011).

Status

Implemented

---

### Save Quiz Attempt

POST /api/v1/quiz-attempts/

Description

Records a completed quiz session. Body: `{"quiz_mode": "...", "difficulty": "easy" | "medium" | "hard", "shared_token"?: "<uuid>", "answers": [{"card": <id>, "guess": "<string>", "time_taken_seconds": <float>, "order": <int>}, ...]}` — for `guess_set_icon`, each answer has `set` instead of `card`. Exactly one of `card`/`set` is required per answer, enforced by a DB-level constraint on `QuizAttemptAnswer` (docs/database.md). `score`/`total_questions`/each answer's `is_correct` are all computed server-side by re-checking `guess` against `card`/`set`/`quiz_mode` — none of it is trusted from the client (see docs/decisions.md #088; this endpoint used to also accept a client-submitted `is_correct` per answer and trust it directly). `shared_token` is optional — present only when this attempt was started from a shared quiz link (see Get Shared Quiz below); when it resolves to a real `QuizShare`, the saved attempt's `shared_by` is stamped with that share's original sharer. An unknown or omitted token just leaves `shared_by` null — it's never required and never fails the save. The response is the same rich shape as Get Quiz Attempt Detail below (nested real card or set data, not the quiz's masked/icon image, plus `shared_by`), not a flat echo of the input — the frontend's post-quiz breakdown screen renders directly from it.

Requires authentication (see docs/decisions.md #011).

Status

Implemented

---

### Get Quiz Attempt Dates

GET /api/v1/quiz-attempts/dates/

Params

- `month` — required, `YYYY-MM`

Description

`{"dates": [...]}` — bare date strings (UTC calendar day) for the requesting user's own attempts within that month, deduplicated (a day with several attempts still appears once). Powers the history calendar's "which days are clickable" check, deliberately lighter than fetching full attempt data for an entire month — same reasoning as Horoscope's own dates endpoint (docs/decisions.md #066).

Requires authentication.

Status

Implemented

---

### Get Quiz Attempts By Date

GET /api/v1/quiz-attempts/by-date/\<date\>/

Description

A flat list of the requesting user's own attempts that day — `[{"id", "quiz_mode", "difficulty", "score", "total_questions", "completed_at", "shared_by": {"id", "username"} | null}, ...]`, no nested per-question detail. Unlike a Horoscope pull, there's no one-per-day limit on quiz attempts, so an empty list (not a 404) is the normal response for a date with nothing.

Requires authentication.

Status

Implemented

---

### Get Quiz Attempt Detail

GET /api/v1/quiz-attempts/\<id\>/

Description

The full per-question breakdown for one of the requesting user's own attempts — same shape as the Save Quiz Attempt response: `{"id", "quiz_mode", "difficulty", "score", "total_questions", "completed_at", "shared_by": {"id", "username"} | null, "answers": [{"card": {...real card fields...} | null, "set": {...real set fields, including image_symbol...} | null, "guess", "correct_answer", "is_correct", "time_taken_seconds", "order"}, ...]}`. Exactly one of `card`/`set` is ever non-null per answer. `card` is the real, fully unmasked card (not the quiz's masked question image) so the history view can show what was actually being guessed on and link to its own detail page; for a `guess_set_icon` answer, `set` is populated instead — the real set (icon included), with no detail page to link to. `correct_answer` is derived at read time from `card`/`set`/`quiz_mode`, not stored — see docs/decisions.md #088/#096. `shared_by` is the user who shared the quiz link this attempt was taken from, or null for an attempt started normally — see docs/decisions.md #101. Another user's attempt id 404s, same pattern as every other per-user detail view in this app.

Requires authentication.

Status

Implemented

---

### Create Quiz Share

POST /api/v1/quiz-shares/

Description

Body: `{"attempt": <id>}`. Creates (or, on a repeat call for the same attempt, returns the existing) shareable link to one of the requesting user's own completed `QuizAttempt`s — `get_or_create` on the attempt, so clicking "Share this quiz" more than once never mints a second link. Response: `{"token": "<uuid>"}`. The attempt must belong to the requesting user, or 404 (same scoping pattern as every other per-user view in this app). See docs/decisions.md #101.

Requires authentication.

Status

Implemented

---

### Get Shared Quiz

GET /api/v1/quiz-shares/\<token\>/

Description

Replays the exact quiz behind a share token — same mode, difficulty, length, and ordered card/set targets as the original attempt it points at, rebuilt fresh through the same question-building logic Get Quiz Questions uses (so images are freshly re-masked, and `guess_set_icon`'s multiple-choice distractors are freshly re-rolled; only the *target* stays fixed). Response: `{"quiz_mode", "difficulty", "shared_by": {"id", "username"}, "questions": [...]}` — `questions` is the same shape Get Quiz Questions returns. 404 for an unknown or malformed token.

No authentication required — a guest can open and play a shared link the same way they could already start any quiz from the picker (see docs/decisions.md #011, #101); only saving the resulting attempt requires login. Throttled (`quiz-share` scope, 30/min) since the token is a public, unauthenticated DB lookup key.

Status

Implemented

---

### Get Quiz Attempt Statistics

GET /api/v1/quiz-attempts/stats/?date=\<YYYY-MM-DD\>

Params

- `date` — optional, in UTC terms (same day boundary `QuizHistoryCalendar` already uses). Despite the response key below being named `today`, this is any day: whichever day is currently selected on the history calendar, if the caller passes one. When omitted, the backend resolves it itself to the requesting user's most recently played date (falling back to the real UTC today only for an account with no attempts at all) — see docs/decisions.md #102. 400 if present but not a valid date.

Description

A read-time aggregation, not a stored record — everything here is derived from the requesting user's own `QuizAttempt` rows (`score`/`total_questions`), same "no new model" approach as the Collection stats endpoint. Response: `{"date": "YYYY-MM-DD", "today": {...}, "career": {...}}`, each of `today`/`career` shaped `{"attempts", "correct", "total_questions", "accuracy", "by_mode": [{"mode", "attempts", "correct", "total_questions", "accuracy"}, ...]}`. `date` is the day `today` was actually filtered to — the caller's own `date` echoed back, or the resolved default when they omitted it, so the frontend never has to separately compute or guess which day it's looking at. `career` has no date filter. `accuracy` is `correct / total_questions`, `null` (not `0`) when `total_questions` is 0 — "never played" is distinct from "played and got 0% right". `by_mode` always lists all four `quiz_mode` values, even at zero attempts. `correct`/`total_questions` are summed across attempts rather than each attempt's own percentage being averaged, so quizzes of different lengths (3/5/7 questions) combine correctly without a separate bucket per length — see docs/decisions.md #097.

Requires authentication (scoped to `request.user`, same pattern as every other quiz-attempts view).

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
