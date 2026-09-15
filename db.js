// db.js — sets up a connection pool to Postgres.
// A "pool" means the app reuses a small set of open connections instead of
// opening a new one for every request (which would be slow).
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's free Postgres requires SSL; this works locally too because
  // "rejectUnauthorized: false" just skips certificate checking.
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

module.exports = pool;
