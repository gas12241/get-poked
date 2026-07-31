# API Documentation

## Overview

The React frontend communicates exclusively with the Django REST API.

The frontend should never directly access the Pokémon TCG API.

---

## Authentication

### Google OAuth

POST /api/auth/google/

Description

Authenticates a user using Google OAuth.

Status

Planned

---

### Login

POST /api/auth/login/

Status

Planned

---

### Logout

POST /api/auth/logout/

Status

Planned

---

## Cards

### Get Cards

GET /api/cards/

Purpose

Returns a paginated list of cards.

Supports

- search
- filtering
- pagination
- sorting

Status

Planned

---

### Get Card

GET /api/cards/{id}/

Status

Planned

---

## Sets

GET /api/sets/

Status

Planned

---

## Collections

GET /api/collections/

POST /api/collections/

DELETE /api/collections/{id}

Status

Planned

---

## Quiz

GET /api/quiz/

Returns a randomly generated quiz.

Status

Planned
