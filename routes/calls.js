// routes/calls.js — everything about reporting, claiming, and cancelling rescue calls.
const express = require('express');
const router = express.Router();
const pool = require('../db');

// Helper to notify all clients to refresh the board
const notifyRefresh = (req) => {
  const io = req.app.get('socketio');
  if (io) io.emit('refresh');
};

// GET /api/stats — total number of pets saved (resolved calls).
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) as saved FROM rescue_calls WHERE status = 'resolved'"
    );
    res.json({ saved: parseInt(result.rows[0].saved, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
router.post('/calls', async (req, res) => {
  const { location, description, urgency, photo, latitude, longitude, reported_by_name, reported_by_phone } = req.body;
  if (!location || !description) {
    return res.status(400).json({ error: 'location and description are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO rescue_calls (location, latitude, longitude, description, urgency, photo, reported_by_name, reported_by_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [location, latitude || null, longitude || null, description, urgency || 'normal', photo || null, reported_by_name || null, reported_by_phone || null]
    );
    notifyRefresh(req);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls/:id/claim — race-safe claim.
router.post('/calls/:id/claim', async (req, res) => {
  const { id } = req.params;
  const { claimed_by_name, claimed_by_phone } = req.body;
  if (!claimed_by_name || !claimed_by_phone) {
    return res.status(400).json({ error: 'Both name and phone number are required to claim' });
  }
  try {
    const result = await pool.query(
      `UPDATE rescue_calls
       SET status = 'claimed', claimed_by_name = $1, claimed_by_phone = $2, updated_at = now()
       WHERE id = $3 AND status = 'reported'
       RETURNING *`,
      [claimed_by_name, claimed_by_phone, id]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query('SELECT status, claimed_by_name FROM rescue_calls WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }
      if (existing.rows[0].status === 'cancelled') {
        return res.status(409).json({ error: 'This call was cancelled' });
      }
      return res.status(409).json({
        error: 'This call was already claimed',
        claimed_by: existing.rows[0].claimed_by_name,
      });
    }

    notifyRefresh(req);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls/:id/cancel — edge case: a rescue is called off.
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
    notifyRefresh(req);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/calls/:id/foster-info — set dietary needs / medication schedule.
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
    notifyRefresh(req);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
