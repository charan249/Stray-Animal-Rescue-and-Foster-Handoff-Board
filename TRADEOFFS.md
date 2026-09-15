# Trade-offs & Design Notes

## The core problem: preventing duplicate claims

The riskiest failure mode described in the brief is two drivers showing up to
the same call. A naive fix — check status in the app, then write — leaves a
race window: two requests can both read "unclaimed" before either writes.

**Solution:** claiming is a single atomic SQL statement —
`UPDATE rescue_calls SET status='claimed', claimed_by=$1 WHERE id=$2 AND status='reported'`.
Postgres guarantees only one concurrent request can match that `WHERE`
clause. The loser gets a `409 Conflict` with the name of whoever won. This
was tested by firing two simultaneous claim requests at the same call —
exactly one succeeds, every time, regardless of timing.

This mattered more than anything else in the brief, so most of the design
time went here rather than into UI polish.

## Preventing lost medical notes

The second failure mode is medical instructions disappearing when an animal
moves from clinic to foster. The fix is structural, not a feature: `handoffs`
is an **append-only log**, not a field that gets overwritten. Every stage
change is a new row. A note written by a clinic vet stays visible in full
after three more stage changes happen — verified directly against the API.

## Simplifications from a "full" version

- **No authentication.** Anyone with the link can report, claim, or update a
  call. For a 48-hour prototype this keeps volunteers from getting locked
  out by a login flow. In production this needs at least a shared PIN or
  named-volunteer login, since `claimed_by` / `recorded_by` are currently
  free-text fields — reliable enough to demo, not enough to trust for real
  accountability.
- **No notifications.** A dispatcher doesn't get pinged when a new urgent
  call comes in; the board must be actively watched. A real version would
  need push notifications or SMS for urgent calls.
- **No photo uploads.** Rescue calls and medical notes are text-only. Photos
  would meaningfully help identification but add file storage complexity
  out of scope for 48 hours.
- **No undo / edit history on claims.** If someone claims a call by mistake,
  there's no "unclaim" button yet — a rescue coordinator would need direct
  DB access to fix it. Deliberately left out to keep the claim logic's
  correctness guarantee simple and auditable.
- **Single flat call list**, no map view or filtering by area. Useful, but
  secondary to the core coordination problem.
- **No SMS/phone intake.** The brief mentions rescue calls arriving as
  actual phone calls; this prototype assumes someone transcribes the call
  into the form. A production version would likely integrate with a phone
  system or at minimum a dedicated intake number.

## What I'd build next with more time

Named volunteer accounts (so `claimed_by` isn't just a trusted text field),
push notifications for urgent calls, and a simple "unclaim" / reassign path
for mis-claims — in that order, since they compound on the two guarantees
already in place rather than replacing them.
