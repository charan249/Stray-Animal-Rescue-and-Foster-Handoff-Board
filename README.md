# Rescue & Foster Handoff Board

A coordination board for a volunteer-run animal rescue network. Lets volunteers
log rescue calls with a photo, claim pickups without duplicate dispatches, and
track an animal's diet, medications, and daily condition as it moves from
rescue → clinic → foster home. No sign-up required to view or claim a rescue.

## Features

- **Report a call** — location, condition, urgency, optional photo (compressed
  client-side for low-bandwidth mobile use).
- **Claim a call** — atomic, race-safe: two volunteers can never claim the
  same call, even at the exact same instant. Board polls every 8s so drivers
  see claims land without a manual refresh.
- **Cancel a call** — for false alarms; blocked once a call is resolved.
- **Foster info** — dietary needs and medication schedule, shown prominently
  once an animal is in clinic/foster care.
- **Daily check-in toggle** — foster hosts mark meds given / flag worsening
  condition, once per day (re-saving updates today's entry, no duplicates).
- **Handoff log** — an append-only history per animal, so medical notes never
  get overwritten as the animal moves stages.
- **Filterable dashboard** — three tabs: Open Emergencies, In Transit, Foster
  Care.

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
5. (Optional but recommended) Load realistic demo data covering every stage:
   ```
   node seed.js
   ```
6. Start the server:
   ```
   npm start
   ```
7. Open `http://localhost:3000`.

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
| POST | `/api/calls` | Report a new call (with optional photo) |
| POST | `/api/calls/:id/claim` | Claim a call (race-safe) |
| POST | `/api/calls/:id/cancel` | Cancel a call (blocked if resolved/cancelled) |
| PATCH | `/api/calls/:id/foster-info` | Set dietary needs / medication schedule |
| GET | `/api/calls/:id/handoffs` | Get an animal's handoff history |
| POST | `/api/calls/:id/handoffs` | Log a stage change / medical notes |
| GET | `/api/calls/:id/checkins` | Get daily check-in history |
| POST | `/api/calls/:id/checkins` | Log/update today's check-in (meds given, worsening flag) |

Also included: `seed.js` — populates realistic demo data across every stage
(open emergency, claimed, in transit, at clinic, at foster, resolved,
cancelled) so the workflow is visible immediately. Run with `node seed.js`.

See `TRADEOFFS.md` for design decisions and known limitations.
