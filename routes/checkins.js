// routes/checkins.js — daily foster check-in toggle: meds given, condition worsening.
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/calls/:id/checkins — full check-in history for one animal.
router.get('/calls/:id/checkins', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM daily_checkins WHERE call_id = $1 ORDER BY checkin_date DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls/:id/checkins — log or update TODAY's check-in.
// Body: { medication_given, condition_worsening, notes, recorded_by }
// Uses UPSERT on (call_id, checkin_date) so hitting "check in" twice in one day
// updates today's entry instead of creating duplicates — a foster host correcting
// an earlier toggle shouldn't produce two rows for the same day.
router.post('/calls/:id/checkins', async (req, res) => {
  const { id } = req.params;
  const { medication_given, condition_worsening, notes, recorded_by } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO daily_checkins (call_id, medication_given, condition_worsening, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (call_id, checkin_date)
       DO UPDATE SET
         medication_given = EXCLUDED.medication_given,
         condition_worsening = EXCLUDED.condition_worsening,
         notes = EXCLUDED.notes,
         recorded_by = EXCLUDED.recorded_by,
         recorded_at = now()
       RETURNING *`,
      [id, !!medication_given, !!condition_worsening, notes || null, recorded_by || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Call not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
