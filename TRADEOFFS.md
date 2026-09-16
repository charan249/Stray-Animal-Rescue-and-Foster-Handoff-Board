# Trade-offs & Design Notes

## Preventing duplicate claims

Claiming is one atomic SQL statement:
`UPDATE rescue_calls SET status='claimed', claimed_by=$1 WHERE id=$2 AND status='reported'`.
Postgres guarantees only one concurrent request can match that `WHERE` clause,
so two drivers tapping "claim" at the same instant cannot both win. The loser
gets a clear rejection naming who got there first. Verified by firing two
simultaneous claim requests at the same call in testing — exactly one
succeeds, every time.

## "Real-time" interpreted as polling, not WebSockets

The brief asks for a "real-time claim button." Given the free-tier and
simplicity constraints, this is built as: an atomic, instant-feedback claim
API (no delay, no race window) plus a lightweight 8-second poll (`setInterval`
+ `fetch`) that refreshes the board so a driver sees another driver's claim
land without a manual reload. A full WebSocket/pub-sub layer would give
sub-second sync but adds real complexity (persistent connections, free-tier
hosting sleep/wake cycles on Render) for a coordination board where an
8-second delay in seeing someone *else's* claim doesn't cause the actual
failure mode — the atomic claim logic is what prevents the duplicate-trip
outcome, not the refresh speed.

## Photos stored as compressed base64, not a file storage service

The constraint is zero-cost storage with no extra sign-up. Rather than adding
an S3/Cloudinary account, photos are compressed client-side (downscaled to
700px wide, JPEG at 60% quality — typically well under 100KB) and stored
directly as a base64 string in Postgres. This keeps the free-tier footprint
to just the one database and works fine at prototype scale. It would not
scale to hundreds of photos (the free Postgres tier caps at ~1GB) — a real
version should move to a dedicated object store once volume grows.

## Foster info vs. handoff log — two different tables on purpose

Dietary needs and medication schedule live directly on `rescue_calls` as
current-state fields (settable once, updated in place) rather than the
`handoffs` log. The log is a *history* of what happened; diet/meds are *what
a foster host needs to know right now*. Mixing them would mean the frontend
has to hunt through history to find the latest instruction — a real risk for
the exact failure mode (lost medical info) the brief is about.

## Daily check-in is a toggle, not a log entry

A check-in upserts on `(call_id, checkin_date)` — hitting "save" twice in one
day updates today's entry rather than creating duplicates. This matches how
the brief describes it ("daily check-in toggle"), and avoids a foster host's
corrected entry getting buried under an earlier mistaken one.

## Edge cases handled

- **Cancelled rescues**: a call can be cancelled unless it's already resolved
  or already cancelled (checked at the DB level, not just in the UI) — an
  already-completed case can't be retroactively cancelled, and a cancelled
  call can't then be claimed (returns a clear "this call was cancelled"
  instead of a generic error).
- **Missed medication doses**: the check-in toggle defaults to unchecked, so
  a day with no check-in is visibly distinguishable from a day where meds
  were confirmed given — nothing defaults to "looks fine."
- **Race on claim**: covered above — this was the primary edge case to get
  right.

## What was intentionally left out

- **No authentication or accounts** — required by the brief (no sign-up to
  claim an urgent rescue). `claimed_by` / `recorded_by` are trusted free-text
  fields; good enough for a volunteer network on a shared link, not for
  contested accountability.
- **No push notifications** for new urgent calls — the polling refresh
  surfaces new calls within 8 seconds of a manual glance at the board, but
  won't wake up a phone that's locked. Would need a service worker or SMS
  integration next.
- **No map view** — the dashboard is filtered by stage, not geography.
  Useful next step, secondary to the core claim/handoff problem.
- **No edit/undo on a claim** once made (only cancel). Deliberately narrow to
  keep the claim guarantee simple and auditable rather than adding a
  re-assignment flow under time pressure.

## What I'd build next with more time

Push notifications for new urgent calls, a lightweight PIN per volunteer
(short of full accounts) so claims/check-ins aren't pure free-text, and a
map view layered on top of the existing stage filters.
