# Rescue & Foster Handoff Board

A coordination board for a volunteer-run animal rescue network. Lets volunteers
log rescue calls, claim pickups without duplicate dispatches, and track an
animal's medical notes as it moves from rescue → clinic → foster home.

## Features

- **Report a call** — location, description, urgency.
- **Claim a call** — atomic, race-safe: two volunteers can never claim the
  same call, even if they tap "claim" at the exact same instant.
- **Handoff log** — an append-only history per animal (picked up → at clinic
  → at foster → resolved), each entry optionally carrying medical notes.
  Notes are never overwritten, so nothing gets lost in the handoff.

## Tech stack

- Node.js + Express (backend, minimal framework, no build step)
- PostgreSQL (database)
- Plain HTML/CSS/vanilla JS (frontend, no framework)

## Local setup

1. Install dependencies:
   ```
   npm install
   ```
2. Set up a PostgreSQL database (locally, or a free instance on
   [Render](https://render.com) / [Neon](https://neon.tech)).
3. Copy `.env.example` to `.env` and fill in your `DATABASE_URL`:
   ```
   cp .env.example .env
   ```
4. Apply the schema:
   ```
   psql "$DATABASE_URL" -f schema.sql
   ```
5. Start the server:
   ```
   npm start
   ```
6. Open `http://localhost:3000`.

## Deploying (Render, free tier)

1. Push this repo to GitHub.
2. On Render: **New → Web Service**, connect the repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. On Render: **New → PostgreSQL** (free tier), copy its internal connection
   string.
4. In the web service's **Environment** tab, set `DATABASE_URL` to that
   connection string.
5. Open a **Shell** on the Postgres instance (or connect with `psql` from
   your machine) and run `schema.sql` against it once.
6. Deploy. Your live URL will be `https://<your-service-name>.onrender.com`.

## API summary

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/calls` | List all calls |
| POST | `/api/calls` | Report a new call |
| POST | `/api/calls/:id/claim` | Claim a call (race-safe) |
| GET | `/api/calls/:id/handoffs` | Get an animal's handoff history |
| POST | `/api/calls/:id/handoffs` | Log a stage change / medical notes |

See `TRADEOFFS.md` for design decisions and known limitations.
