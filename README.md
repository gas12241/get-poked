# Pokémon Card Collection & Quiz App

## Overview

A full-stack web application built with React and Django that allows users to:

- Browse every English-language Pokémon TCG card
- Search by Pokémon, set, rarity, type, and more
- Create and manage personal collections
- Sign in with Google or email/password
- Play quiz games using Pokémon card images

---

## Features

### Collection Manager

- Search every card
- View detailed card information
- Track owned cards
- Favorite cards
- Collection statistics

### Quiz Modes

- Guess the Card
- Guess the Set
- Guess the HP
- Future quiz modes

---

## Technology

Frontend

- React
- TypeScript
- Vite
- React Query (server state)
- Zustand (client state)

Backend

- Django
- Django REST Framework

Database

- PostgreSQL (planned)

Authentication

- Google OAuth
- Email & Password

Testing

- Django Tests
- React Testing Library
- Vitest

---

## Project Structure

frontend/
backend/
docs/

---

## Setup

### Prerequisites

- Python 3.11
- Node 22
- PostgreSQL, running locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

Create the database and user (matching whatever you put in `.env` below):

```bash
createdb get_poked
createuser get_poked
```

Copy the environment template and fill in the blanks:

```bash
cp .env.example .env
```

- `SECRET_KEY` — any long random string for local dev
- `DB_PASSWORD` — the password for the Postgres user you created
- `POKEMON_TCG_API_KEY` — get one at https://dev.pokemontcg.io/ (needed to run the card sync; the app itself works without it)
- `FRONTEND_URL` — defaults to `http://localhost:5173`; only matters for links sent by email (e.g. account verification)
- `DEFAULT_FROM_EMAIL` — the "from" address on those emails; in dev they print to the console instead of sending (`EMAIL_BACKEND` defaults to the console backend)

Apply migrations:

```bash
python manage.py migrate
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
```

---

## Running

Backend (from `backend/`, with the virtualenv active):

```bash
python manage.py runserver
```

Runs at http://localhost:8000. Health check: http://localhost:8000/api/v1/health/

Frontend (from `frontend/`):

```bash
npm run dev
```

Runs at http://localhost:5173.

Populate the card database (optional, one-time — pulls from the live Pokémon TCG API):

```bash
python manage.py sync_cards
```

Check and fix broken card image URLs (optional maintenance — a handful of cards' images 404 on the upstream image host; see docs/decisions.md #039):

```bash
python manage.py check_card_images
```

---

## Running Tests

Backend (from `backend/`, with the virtualenv active):

```bash
python manage.py test
```

Frontend (from `frontend/`):

```bash
npm run test:run
```
