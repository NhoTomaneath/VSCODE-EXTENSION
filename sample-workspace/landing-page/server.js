const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database(path.join(__dirname, 'data', 'subscribers.db'));
db.prepare(
  `CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`
).run();

const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/signup', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!GMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid Gmail address.' });
  }

  try {
    db.prepare('INSERT INTO subscribers (email) VALUES (?)').run(email);
    return res.status(201).json({ message: 'Thanks! Your Gmail has been saved.' });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'This Gmail address is already signed up.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Landing page running at http://localhost:${PORT}`);
});
