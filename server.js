// server.js — entry point. This starts the web server.
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pool = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '2mb' })); // lets us read JSON bodies from fetch() requests; bumped for base64 photos
app.use(express.static('public')); // serves our HTML/CSS/JS frontend from the "public" folder

// Attach io to the app so routes can use it
app.set('socketio', io);

// Migration: Ensure columns exist for precise location and contact info
(async () => {
  try {
    // Location
    await pool.query('ALTER TABLE rescue_calls ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION');
    await pool.query('ALTER TABLE rescue_calls ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION');

    // Reporting info
    await pool.query('ALTER TABLE rescue_calls ADD COLUMN IF NOT EXISTS reported_by_name TEXT');
    await pool.query('ALTER TABLE rescue_calls ADD COLUMN IF NOT EXISTS reported_by_phone TEXT');

    // Claim info
    await pool.query('ALTER TABLE rescue_calls ADD COLUMN IF NOT EXISTS claimed_by_name TEXT');
    await pool.query('ALTER TABLE rescue_calls ADD COLUMN IF NOT EXISTS claimed_by_phone TEXT');

    // Caretaker snapshot for the board
    await pool.query('ALTER TABLE rescue_calls ADD COLUMN IF NOT EXISTS current_caretaker_name TEXT');
    await pool.query('ALTER TABLE rescue_calls ADD COLUMN IF NOT EXISTS current_caretaker_phone TEXT');

    // Handoff and Check-in contact info
    await pool.query('ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS recorded_by_phone TEXT');
    await pool.query('ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS recorded_by_phone TEXT');

    console.log('Database migration: All location, contact, and caretaker columns verified.');
  } catch (err) {
    console.error('Database migration failed:', err.message);
  }
})();

app.use('/api', require('./routes/calls'));
app.use('/api', require('./routes/handoffs'));
app.use('/api', require('./routes/checkins'));

// A basic health check route — now also confirms the database is reachable.
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM rescue_calls');
    res.json({ status: 'ok', message: 'Server and database are both up', call_count: result.rows[0].count });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

io.on('connection', (socket) => {
  console.log('Client connected to socket:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected'));
});
