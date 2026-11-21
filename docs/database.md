# Database Design

## Philosophy

Pokémon card information is stored locally.

The Pokémon TCG API is used only for importing and synchronizing data.

---

## Tables

### Card

Purpose

Stores every Pokémon card.

Fields

- id
- tcg_id
- name
- name_ascii (diacritic-stripped copy of `name`, e.g. "Poké Vital A" -> "Poke Vital A" — kept in sync by `Card.save()`, read-only in practice. Lets search match a name typed without accents against a stored name that has them; see docs/decisions.md #060)
- number
- rarity
- hp
- supertype (Pokémon / Trainer / Energy — lets quiz generation filter to Pokémon-only cards)
- language (default `en`; see docs/decisions.md #006)
- image_small
- image_large
- artist
- national_pokedex_numbers (array of ints — empty on Trainer/Energy cards)
- subtypes (array of strings — evolution stage/card category, e.g. `["Basic"]`, `["Item"]`. Distinct from `type`/`Type` below, which is elemental type)
- evolves_from (single string, blank on non-Pokémon cards)
- evolves_to (array of strings — a Pokémon can branch into multiple evolutions, e.g. Eevee)
- tcgplayer_url / cardmarket_url (link to the live pricing page — not the price itself; see docs/decisions.md #025 for why the link is kept but the pricing numbers are not)
- details (JSON — retreat cost, converted retreat cost, legalities, rules (Trainer rule text). Render-only data with no current search/filter/query need; see docs/decisions.md #016 for what would trigger promoting a field out of here into its own column/table. Everything else originally slated for this blob — artist, national dex numbers, subtypes, evolution fields, attacks/weaknesses/resistances — has since been promoted to real columns/tables; see docs/decisions.md #025)

Relationships

Belongs to one Set. Many-to-many with Type (see below). Has many Attack, Weakness, Resistance (see below).

Constraints

No (set, number, language) uniqueness — an earlier assumption, disproven by real sync data (see docs/decisions.md #026). `tcg_id` is the actual uniqueness guarantee.

Indexes

`name`, `name_ascii`, `rarity`, `supertype` — all four are stated search/filter/quiz requirements.

---

### Type

Purpose

Lookup table for Pokémon energy types (Fire, Water, etc. — a small fixed vocabulary of ~18 values).

Fields

- id
- name

Relationship

Many-to-many with Card, via a join table. Normalized (rather than a JSON array on Card) since type is a stated search/filter requirement over a small fixed set — see docs/decisions.md #016. Also referenced by Weakness and Resistance below (same elemental-type vocabulary).

---

### Attack

Purpose

Represents one attack printed on a card. A card can have zero or more.

Fields

- id
- card
- name
- cost (JSON array of energy type name strings, e.g. `["Metal", "Metal", "Colorless"]` — an ordered multiset, doesn't map cleanly to a Type M2M)
- converted_energy_cost
- damage
- text
- order (position among the card's attacks)

Relationship

Belongs to one Card. Recreated (deleted and reinserted) on every sync of that card, rather than diffed — see docs/decisions.md #025.

---

### Weakness

Purpose

Represents one weakness printed on a card.

Fields

- id
- card
- type
- value (e.g. `"×2"`)

Relationship

Belongs to one Card, references one Type. Recreated on every sync of that card.

---

### Resistance

Purpose

Represents one resistance printed on a card.

Fields

- id
- card
- type
- value (e.g. `"-20"`)

Relationship

Belongs to one Card, references one Type. Recreated on every sync of that card.

---

### Set

Purpose

Stores Pokémon sets.

Fields

- id
- tcg_id (the Pokémon TCG API's own set identifier, e.g. `"base1"` — required for the sync command to resolve which local Set a card belongs to; a gap in this doc caught while building the sync command, see docs/decisions.md #025)
- name
- series
- release_date
- language (default `en`; see docs/decisions.md #006)
- imported (boolean, default False — marks whether this set's cards have been fully synced; see docs/decisions.md #008)
- image_symbol / image_logo (real columns, not JSON — ARCHITECTURE.md's "Guess the Set" quiz mode names a use for the symbol specifically)
- details (JSON — ptcgoCode, legalities, printedTotal, total, updatedAt. Render-only, same treatment as Card's `details`; `updatedAt` is available here for a possible future "detect changed sets automatically" enhancement, not built yet — see docs/decisions.md #025)

Relationship

One Set has many Cards.

---

### User

Custom `core.User` model (`AbstractUser` subclass, `AUTH_USER_MODEL`), not Django's default — see docs/decisions.md #067.

Fields

- id
- email (unique) — the login identifier (`USERNAME_FIELD`)
- username (unique, independently of email) — re-added (see docs/decisions.md #071) as a required, separately-unique *display* identifier, not a credential; chosen at signup, auto-generated from the email local-part for any account created without one (Google sign-in, `createsuperuser`, direct `create_user()` calls)
- password (hashed, inherited from `AbstractUser`) — a Google-only account (see docs/decisions.md #069) has an *unusable* password (`set_password(None)`, Django's own convention), not a null one; `has_usable_password()` is how that's checked, not a stored field, so it doesn't appear in this list
- is_verified — gates login for email/password accounts; auto-true for Google OAuth accounts
- is_staff / is_superuser / is_active — inherited, Django admin/permissions as usual
- first_name / last_name — inherited; editable via the profile page (`GET`/`PATCH /api/v1/me/`, docs/decisions.md #070), populated from Google's own profile data on a Google sign-up
- date_joined, last_login — inherited; `date_joined` is shown on the profile page as "Member since ..."
- avatar — optional `ImageField` (see docs/decisions.md #073); uploaded via `PATCH /api/v1/me/` as `multipart/form-data`, center-cropped and resized to a fixed 256×256 JPEG on upload; `null` when the user hasn't set one, in which case the frontend shows a generated initials placeholder instead of calling the backend
- google_sub (unique, nullable) — Google's own stable per-account ID (the verified token's `sub` claim); `null` for any account that's never signed in with Google. `GoogleLoginView` matches on this first, falling back to email only for accounts that signed in before this field existed (see docs/decisions.md #074) — email alone isn't a safe long-term link to a Google identity, since it can change (docs/decisions.md #075)
- deleted_at (nullable timestamp) — soft-delete marker (see docs/decisions.md #076); `null` means active. Set by `DELETE /api/v1/me/`, cleared automatically on the next successful login (password or Google) within `ACCOUNT_DELETION_GRACE_PERIOD_DAYS` (30). `is_active` is deliberately untouched by deletion — the account must still be able to log in normally, since logging in is the restore action. Permanent removal only happens via the separate `purge_deleted_accounts` management command, past the grace period
- auto_remove_favorite_on_collect (boolean, default `False`) — opt-in setting, editable via `PATCH /api/v1/me/`. When `True`, adding a card to the collection also removes any existing `Favorite` for that card (`CollectionEntrySerializer.create`), and turning the setting on does a one-time cleanup of cards that are already both owned and favorited (`UserSerializer.update`). See docs/decisions.md #084

---

### CollectionEntry

Lives in the `collection` app (see docs/decisions.md #077 for why that app is singular, not plural).

Purpose

Represents a card a user owns.

Fields

- id
- user — `on_delete=CASCADE` (deleting the account deletes its collection entries too, same as `QuizAttempt.user`)
- card — `on_delete=PROTECT` (a card can never be deleted while someone owns it, same as `QuizAttemptAnswer.card`)
- quantity — `PositiveSmallIntegerField`, default 1, enforced `>= 1` at the serializer level (removing an entry is a `DELETE`, not `quantity: 0`)
- date_added

Relationship

Belongs to one User, belongs to one Card. Unique together: (user, card) — constraint name `unique_collection_entry_per_user_per_card`.

See docs/decisions.md #009 for why this is separate from Favorite, #077 for how it was actually built.

---

### Favorite

Also in the `collection` app, alongside `CollectionEntry`.

Purpose

Represents a card a user has starred, independent of ownership.

Fields

- id
- user — `on_delete=CASCADE`
- card — `on_delete=PROTECT`
- date_added

Relationship

Belongs to one User, belongs to one Card. Unique together: (user, card) — constraint name `unique_favorite_per_user_per_card`.

See docs/decisions.md #077.

---

### QuizAttempt

Purpose

Represents one completed quiz session.

Fields

- id
- user (required — only created for logged-in users; see docs/decisions.md #011)
- quiz_mode
- difficulty (added for the history list — see docs/decisions.md #088; defaults to "medium" purely for pre-existing rows to migrate cleanly, every new row sets it for real)
- score (cached total correct, to avoid recomputing from QuizAttemptAnswer on every read)
- total_questions
- completed_at

Relationship

Belongs to one User. Has many QuizAttemptAnswer.

---

### QuizAttemptAnswer

Purpose

Represents one question within a quiz attempt.

Fields

- id
- quiz_attempt
- card
- guess (the user's actual raw answer, added so correctness can be independently re-checked server-side rather than trusted from the client — see docs/decisions.md #088; defaults to "" purely for pre-existing rows)
- is_correct (server-derived from `guess`, not client-writable)
- time_taken_seconds
- order (position within the attempt)

Relationship

Belongs to one QuizAttempt, references one Card.

See docs/decisions.md #012 for why this tracks per-question detail rather than session-level only.

---

### HoroscopePull

Purpose

Represents one user's daily card pull.

Fields

- id
- user (required — same reasoning as QuizAttempt)
- pull_date (the UTC calendar date this pull belongs to — the actual once-per-day guarantee; see Constraints)
- pulled_at (exact timestamp, for display/ordering)

Relationship

Belongs to one User. Has many HoroscopeCard.

Constraints

Unique together: (user, pull_date) — enforced at the database level (not just in application logic), so a user can never end up with two pulls for the same UTC day. See docs/decisions.md #061.

---

### HoroscopeCard

Purpose

Represents one of the 7 cards in a horoscope pull.

Fields

- id
- pull
- card
- supertype (the slot's role — "Pokémon" / "Trainer" / "Energy")
- rarity_tier ("common" / "mid" / "chase" — the tier actually rolled for this slot, stored rather than re-derived from the card's live rarity; see docs/decisions.md #061)
- order (0-4 = the 5 Pokémon slots, 5 = Trainer, 6 = Energy)

Relationship

Belongs to one HoroscopePull, references one Card (PROTECT — a card referenced by a historical pull can't be deleted, same as QuizAttemptAnswer).

---

## Future Tables

Deck

Trade

Achievement
