// routes/handoffs.js — tracking an animal's journey and medical notes after pickup.
const express = require('express');
const router = express.Router();
const pool = require('../db');

const VALID_STAGES = ['picked_up', 'at_clinic', 'at_foster', 'resolved'];

// GET /api/calls/:id/handoffs — full history for one animal, oldest first.
router.get('/calls/:id/handoffs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM handoffs WHERE call_id = $1 ORDER BY recorded_at ASC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls/:id/handoffs — log a stage change and/or medical notes.
// Body: { stage, medical_notes, recorded_by }
// This ADDS a new row rather than overwriting — that's what keeps history intact.
router.post('/calls/:id/handoffs', async (req, res) => {
  const { id } = req.params;
  const { stage, medical_notes, recorded_by } = req.body;

  if (!stage || !VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Make sure the call actually exists before logging a handoff for it.
    const callCheck = await client.query('SELECT id FROM rescue_calls WHERE id = $1', [id]);
    if (callCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Call not found' });
    }

    const handoff = await client.query(
      `INSERT INTO handoffs (call_id, stage, medical_notes, recorded_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, stage, medical_notes || null, recorded_by || null]
    );

    // Keep rescue_calls.status in sync with the latest stage so the board
    // list view doesn't need to join against handoffs just to show status.
    await client.query(
      `UPDATE rescue_calls SET status = $1, updated_at = now() WHERE id = $2`,
      [stage, id]
    );

    await client.query('COMMIT');
    res.status(201).json(handoff.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
