// server.js — entry point. This starts the web server.
require('dotenv').config();
const express = require('express');
const pool = require('./db');

const app = express();
app.use(express.json()); // lets us read JSON bodies from fetch() requests
app.use(express.static('public')); // serves our HTML/CSS/JS frontend from the "public" folder

app.use('/api', require('./routes/calls'));
app.use('/api', require('./routes/handoffs'));

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
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
