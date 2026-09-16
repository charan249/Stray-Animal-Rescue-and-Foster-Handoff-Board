// routes/calls.js — everything about reporting, claiming, and cancelling rescue calls.
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/calls — list all calls, newest first.
router.get('/calls', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM rescue_calls ORDER BY reported_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls — report a new rescue call.
// Body: { location, description, urgency, photo }
// "photo" is an optional base64 data-URL string, compressed client-side before sending
// (see public/app.js) to stay usable on low-bandwidth mobile connections.
router.post('/calls', async (req, res) => {
  const { location, description, urgency, photo } = req.body;
  if (!location || !description) {
    return res.status(400).json({ error: 'location and description are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO rescue_calls (location, description, urgency, photo)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [location, description, urgency || 'normal', photo || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls/:id/claim — race-safe claim.
// Body: { claimed_by }
// One atomic UPDATE, guarded by WHERE status='reported', so only one concurrent
// request can win even if two drivers tap "claim" at the same instant.
router.post('/calls/:id/claim', async (req, res) => {
  const { id } = req.params;
  const { claimed_by } = req.body;
  if (!claimed_by) {
    return res.status(400).json({ error: 'claimed_by is required' });
  }
  try {
    const result = await pool.query(
      `UPDATE rescue_calls
       SET status = 'claimed', claimed_by = $1, updated_at = now()
       WHERE id = $2 AND status = 'reported'
       RETURNING *`,
      [claimed_by, id]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query('SELECT status, claimed_by FROM rescue_calls WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }
      if (existing.rows[0].status === 'cancelled') {
        return res.status(409).json({ error: 'This call was cancelled' });
      }
      return res.status(409).json({
        error: 'This call was already claimed',
        claimed_by: existing.rows[0].claimed_by,
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls/:id/cancel — edge case: a rescue is called off (animal already
// helped by someone else, false alarm, etc). Blocked once an animal is already
// resolved, so a completed case can't accidentally be cancelled after the fact.
router.post('/calls/:id/cancel', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE rescue_calls
       SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND status != 'resolved' AND status != 'cancelled'
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'This call cannot be cancelled (already resolved or already cancelled)' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/calls/:id/foster-info — set dietary needs / medication schedule.
// Body: { dietary_needs, medication_schedule }
// Separate from handoffs because this is current-state info ("what the foster
// needs to know right now"), not a historical log entry.
router.patch('/calls/:id/foster-info', async (req, res) => {
  const { id } = req.params;
  const { dietary_needs, medication_schedule } = req.body;
  try {
    const result = await pool.query(
      `UPDATE rescue_calls
       SET dietary_needs = COALESCE($1, dietary_needs),
           medication_schedule = COALESCE($2, medication_schedule),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [dietary_needs || null, medication_schedule || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
