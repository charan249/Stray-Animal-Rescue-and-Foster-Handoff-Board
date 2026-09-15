-- schema.sql
-- Run this once against your Postgres database to set up the tables.

-- Every rescue call reported starts here. "status" moves through a fixed set of stages.
-- Claiming a call just means setting claimed_by + status='claimed' — see the claim
-- logic in routes/calls.js for why this prevents two people claiming the same call.
CREATE TABLE IF NOT EXISTS rescue_calls (
    id SERIAL PRIMARY KEY,
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'normal',      -- 'low' | 'normal' | 'urgent'
    status TEXT NOT NULL DEFAULT 'reported',      -- reported | claimed | in_transit | at_clinic | at_foster | resolved
    claimed_by TEXT,                               -- name of the volunteer who claimed it (NULL until claimed)
    reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A running log of what happened to the animal at each stage — this is what stops
-- medical notes from getting lost when the animal moves from clinic to foster home.
-- Every stage change or note gets its own row here, so nothing overwrites history.
CREATE TABLE IF NOT EXISTS handoffs (
    id SERIAL PRIMARY KEY,
    call_id INTEGER NOT NULL REFERENCES rescue_calls(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,          -- e.g. 'picked_up', 'at_clinic', 'at_foster', 'resolved'
    medical_notes TEXT,            -- can be NULL if this entry is just a stage change with no new notes
    recorded_by TEXT,              -- who logged this entry
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handoffs_call_id ON handoffs(call_id);
