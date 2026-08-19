# Deployment (AWS Learning Sketch)

## Purpose

This is a rough plan for getting this project running on AWS, written as a learning exercise (see ROADMAP.md Phase 7 — "Deployment"). It is not a production-hardening guide, and it is not yet implemented — nothing described here has been built.

The goal is to touch the core AWS services this project naturally maps to, without jumping straight to container orchestration:

- **EC2** — runs Django
- **RDS (Postgres)** — the database, matching the project's Postgres-only rule (see docs/decisions.md)
- **S3 + CloudFront** — hosts the built React static files
- **IAM / Security Groups** — access control between the above

A more "cloud-native" second pass (ECS/Fargate instead of a raw EC2 instance) is a reasonable follow-up once this simpler version works end-to-end.

---

## Architecture

```
Browser
  │
  ├── CloudFront ── S3 (React static build)
  │
  └── EC2 (Django + Gunicorn) ── RDS (Postgres)
```

The frontend is a static build (`npm run build`) served from S3/CloudFront — it never needs a Node server in production. Django runs on EC2 behind Gunicorn. RDS is a separate managed instance, not installed on the EC2 box itself.

---

## Steps

### 1. RDS (Postgres)

- Create a `db.t3.micro` Postgres instance (free-tier eligible).
- Note the endpoint, port, database name, and credentials — these map directly to `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` in `backend/.env`.
- Security group: only allow inbound Postgres traffic (5432) from the EC2 instance's security group, not `0.0.0.0/0`.

### 2. EC2 (Django)

- Launch a `t3.micro` instance (free-tier eligible), Ubuntu or Amazon Linux.
- Install Python 3.11, clone the repo, `pip install -r requirements.txt`.
- Install and configure Gunicorn (not `manage.py runserver` — that's dev-only) behind Nginx as a reverse proxy.
- `.env` on the instance: `DEBUG=False`, `ALLOWED_HOSTS` set to the instance's domain/IP, `DB_HOST` pointing at the RDS endpoint, `CORS_ALLOWED_ORIGINS` including the CloudFront domain.
- Run `python manage.py migrate` and `python manage.py sync_cards` once, against RDS.
- Security group: allow inbound 443 (and 80 if redirecting to HTTPS) from anywhere; SSH (22) only from your own IP.

### 3. S3 + CloudFront (React)

- `npm run build` locally, producing `frontend/dist/`.
- Upload `dist/` to an S3 bucket configured for static hosting.
- Put a CloudFront distribution in front of the bucket for HTTPS and CDN caching.
- `frontend/.env` at build time: `VITE_API_BASE_URL` pointing at the EC2/Django domain.

### 4. Secrets

- `SECRET_KEY`, `DB_PASSWORD`, `POKEMON_TCG_API_KEY` must never be committed — same rule as local dev (see backend/.env.example).
- For a learning deployment, setting them as environment variables directly on the EC2 instance is fine. AWS Secrets Manager or Parameter Store is the "do it properly" upgrade, worth trying once the basic version works.

---

## Cost & cleanup

Everything above fits in the AWS free tier (EC2 `t3.micro`, RDS `db.t3.micro`, S3, CloudFront), but:

- The RDS free tier is time-limited (12 months from account creation), not permanent.
- Nothing here is free indefinitely — **stop or terminate the EC2 instance and delete the RDS instance when not actively using them** to avoid ongoing charges.

---

## Deliberately not covered here

- Auto-scaling, load balancing across multiple EC2 instances — not needed for a single-user learning deployment.
- CI/CD to auto-deploy on push — a reasonable follow-up once manual deployment works.
- Containers (ECS/Fargate) — a good second-pass exercise once this raw-EC2 version is understood.
