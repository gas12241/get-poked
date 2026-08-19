# Phase 1

- Repository
- React
- Django
- .gitignore
- README
- CLAUDE.md
- Initial tests

---

# Phase 2

Depends on Phase 1.

Status: Complete — see TODO.md and docs/decisions.md #025/#026.

Database

- Set model
- Card model

Import Pokémon cards

Management command

Backend tests

---

# Phase 3

Depends on Phase 2 (needs Card/Set data to search, filter, and display).

Status: Complete — see TODO.md and docs/decisions.md #027/#028.

Search

Filtering

Pagination

Card details

Frontend tests

---

# Phase 4

Independent — can be built in parallel with Phase 2/3.

Authentication

Google OAuth

Email/password

User profiles

Authentication tests

---

# Phase 5

Depends on Phase 2 (Card model) and Phase 4 (User accounts) — Collections and Favorites reference both.

Collections

Owned cards

Favorites

Statistics

---

# Phase 6

Depends on Phase 2 (Card data to quiz from). Playing a quiz does not require Phase 4; saving a score does (see docs/decisions.md #011).

Quiz System

Guess Pokémon

Guess Set

Guess HP

Image generation

Score tracking

---

# Phase 7

Depends on Phases 1–6 being functionally complete.

Polish

Performance

Caching

Deployment

Documentation
