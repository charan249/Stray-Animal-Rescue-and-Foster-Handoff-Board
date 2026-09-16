// routes/handoffs.js — tracking an animal's journey and medical notes after pickup.
const express = require('express');
const router = express.Router();
const pool = require('../db');

const VALID_STAGES = ['picked_up', 'at_clinic', 'at_foster', 'resolved'];

// Helper to notify all clients to refresh the board
const notifyRefresh = (req) => {
  const io = req.app.get('socketio');
  if (io) io.emit('refresh');
};

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
// Body: { stage, medical_notes, recorded_by_name, recorded_by_phone }
router.post('/calls/:id/handoffs', async (req, res) => {
  const { id } = req.params;
  let { stage, medical_notes, recorded_by_name, recorded_by_phone } = req.body;

  if (!stage || !VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(', ')}` });
  }

  // --- Mandatory Medical Documentation ---
  if (stage === 'at_foster' && (!medical_notes || medical_notes.trim() === '')) {
    return res.status(400).json({ error: 'Medical notes are required for foster placement.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Handle Automatic Driver Attribution for 'picked_up'
    if (stage === 'picked_up') {
      const driver = await client.query(
        'SELECT claimed_by_name, claimed_by_phone FROM rescue_calls WHERE id = $1',
        [id]
      );
      if (driver.rows.length > 0) {
        recorded_by_name = recorded_by_name || driver.rows[0].claimed_by_name;
        recorded_by_phone = recorded_by_phone || driver.rows[0].claimed_by_phone;
      }
    }

    // Make sure the call actually exists before logging a handoff for it.
    const callCheck = await client.query('SELECT id FROM rescue_calls WHERE id = $1', [id]);
    if (callCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Call not found' });
    }

    const handoff = await client.query(
      `INSERT INTO handoffs (call_id, stage, medical_notes, recorded_by, recorded_by_phone)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, stage, medical_notes || null, recorded_by_name || null, recorded_by_phone || null]
    );

    // 2. Caretaker Sync: Update the snapshot in rescue_calls for fast rendering
    await client.query(
      `UPDATE rescue_calls
       SET status = $1,
           current_caretaker_name = COALESCE($2, current_caretaker_name),
           current_caretaker_phone = COALESCE($3, current_caretaker_phone),
           updated_at = now()
       WHERE id = $4`,
      [stage, recorded_by_name, recorded_by_phone, id]
    );

    await client.query('COMMIT');
    notifyRefresh(req);
    res.status(201).json(handoff.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Handoff Error:', err);
    res.status(500).json({ error: 'Internal server error while updating rescue status.' });
  } finally {
    client.release();
  }
});

module.exports = router;
