-- schema.sql
-- Run this once against your Postgres database to set up the tables.

CREATE TABLE IF NOT EXISTS rescue_calls (
    id SERIAL PRIMARY KEY,
    location TEXT NOT NULL,
    description TEXT NOT NULL,          -- animal condition / situation description
    photo TEXT,                          -- base64-encoded image (kept small/compressed client-side; see TRADEOFFS.md)
    urgency TEXT NOT NULL DEFAULT 'normal',      -- 'low' | 'normal' | 'urgent'
    status TEXT NOT NULL DEFAULT 'reported',      -- reported | claimed | picked_up | at_clinic | at_foster | resolved | cancelled
    claimed_by TEXT,
    dietary_needs TEXT,                  -- set once the animal reaches foster care (nullable until known)
    medication_schedule TEXT,            -- free-text schedule, e.g. "Amoxicillin 250mg, 2x daily with food"
    reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only history of stage changes and medical notes.
CREATE TABLE IF NOT EXISTS handoffs (
    id SERIAL PRIMARY KEY,
    call_id INTEGER NOT NULL REFERENCES rescue_calls(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    medical_notes TEXT,
    recorded_by TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per daily foster check-in: did meds get given today, is the animal worsening.
CREATE TABLE IF NOT EXISTS daily_checkins (
    id SERIAL PRIMARY KEY,
    call_id INTEGER NOT NULL REFERENCES rescue_calls(id) ON DELETE CASCADE,
    checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
    medication_given BOOLEAN NOT NULL DEFAULT false,
    condition_worsening BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    recorded_by TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- one check-in per animal per day keeps this a toggle, not a spam log
    UNIQUE (call_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_handoffs_call_id ON handoffs(call_id);
CREATE INDEX IF NOT EXISTS idx_checkins_call_id ON daily_checkins(call_id);
