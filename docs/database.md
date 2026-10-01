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

Django User model.

---

### CollectionEntry

Purpose

Represents a card a user owns.

Fields

- id
- user
- card
- quantity
- date_added

Relationship

Belongs to one User, belongs to one Card. Unique together: (user, card).

See docs/decisions.md #009 for why this is separate from Favorite.

---

### Favorite

Purpose

Represents a card a user has starred, independent of ownership.

Fields

- id
- user
- card
- date_added

Relationship

Belongs to one User, belongs to one Card. Unique together: (user, card).

---

### QuizAttempt

Purpose

Represents one completed quiz session.

Fields

- id
- user (required — only created for logged-in users; see docs/decisions.md #011)
- quiz_mode
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
- is_correct
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
