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
- filtering — `?rarity=`, `?supertype=`, `?set=` (Set id), `?type=` (elemental type name, case-insensitive, e.g. `Fire`); any combination applies as AND
- pagination — `?page=`, `?page_size=` (default 24, max 100)
- sorting — `?ordering=` (`name`, `number`, `rarity`; prefix `-` to reverse)

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

Description

Returns the full list of elemental types (Fire, Water, etc.), unpaginated. Used by the frontend to populate the `type` filter on the Cards endpoint. No authentication required. See docs/decisions.md #028.

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

GET /api/v1/quiz/

Returns a randomly generated quiz.

Params

- `mode` — `guess_card`, `guess_set`, `guess_hp`, etc.
- `rarities` — comma-separated list (e.g. `Ultra Rare,Secret Rare,Special Illustration Rare`) further narrowing the card pool within whatever's already eligible for the mode. Applies to all modes. Omitted or empty means no additional restriction.

Description

Baseline card pool eligibility depends on `mode` and supertype (see ARCHITECTURE.md "Quiz Eligibility & Rarity Filtering"):

- `guess_card` — Pokémon cards, any rarity; Trainer cards, only at/above the special-rarity tier (Ultra Rare, Secret Rare, Special Illustration Rare, and future equivalents); Energy cards excluded.
- `guess_hp` — Pokémon-only, any rarity (Trainer/Energy cards have no HP).
- `guess_set` — same rule as `guess_card`.

The `rarities` param narrows further within that baseline — it cannot make an otherwise-ineligible card (a common Trainer, or any Energy card) eligible. See docs/decisions.md #017.

Status

Planned
