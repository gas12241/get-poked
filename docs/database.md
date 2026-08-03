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
- number
- rarity
- hp
- supertype (Pokémon / Trainer / Energy — lets quiz generation filter to Pokémon-only cards)
- language (default `en`; see docs/decisions.md #006)
- image_small
- image_large
- details (JSON — attacks, weaknesses, resistances, retreat cost, artist, flavor text, national dex numbers, legalities. Render-only data with no current search/filter/query need; see docs/decisions.md #016 for what would trigger promoting a field out of here into its own column/table)

Relationships

Belongs to one Set. Many-to-many with Type (see below).

Constraints

Unique together: (set, number, language) — the same card number can exist once per language within a set.

Indexes

`name`, `rarity`, `supertype` — all three are stated search/filter/quiz requirements.

---

### Type

Purpose

Lookup table for Pokémon energy types (Fire, Water, etc. — a small fixed vocabulary of ~18 values).

Fields

- id
- name

Relationship

Many-to-many with Card, via a join table. Normalized (rather than a JSON array on Card) since type is a stated search/filter requirement over a small fixed set — see docs/decisions.md #016.

---

### Set

Purpose

Stores Pokémon sets.

Fields

- id
- name
- series
- release_date
- language (default `en`; see docs/decisions.md #006)
- imported (boolean, default False — marks whether this set's cards have been fully synced; see docs/decisions.md #008)

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

## Future Tables

Deck

Trade

Achievement
