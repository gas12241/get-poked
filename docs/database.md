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
- image_small
- image_large

Relationships

Belongs to one Set.

---

### Set

Purpose

Stores Pokémon sets.

Fields

- id
- name
- series
- release_date

Relationship

One Set has many Cards.

---

### User

Django User model.

---

### Collection

Represents a user's collection.

Relationship

Belongs to one User.

Contains many Cards.

---

### CollectionCard

Join table.

Stores

- quantity
- condition
- favorite

---

## Future Tables

Deck

Trade

Achievement

QuizHistory
