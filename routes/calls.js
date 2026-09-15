// routes/calls.js — everything about reporting and claiming rescue calls.
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
// Body: { location, description, urgency }
router.post('/calls', async (req, res) => {
  const { location, description, urgency } = req.body;
  if (!location || !description) {
    return res.status(400).json({ error: 'location and description are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO rescue_calls (location, description, urgency)
       VALUES ($1, $2, $3) RETURNING *`,
      [location, description, urgency || 'normal']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls/:id/claim — the important one.
// Body: { claimed_by: "volunteer name" }
//
// WHY THIS IS RACE-SAFE:
// Instead of doing "check status, then update" as two separate steps (which
// leaves a gap where two requests can both pass the check before either
// writes), we do it in ONE atomic SQL statement: update the row ONLY IF
// it's still 'reported'. Postgres guarantees only one concurrent request
// can win this update. Whichever request's WHERE clause matches zero rows
// lost the race — even if both requests arrived at the exact same millisecond.
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
      // Either the call doesn't exist, or someone else already claimed it.
      // We distinguish the two so the frontend can show the right message.
      const existing = await pool.query('SELECT status, claimed_by FROM rescue_calls WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Call not found' });
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

module.exports = router;
