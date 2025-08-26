// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me-admin-token";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- SQLite setup ---
const db = new sqlite3.Database(path.join(__dirname, 'quizzes.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 15,
    negative_marking REAL NOT NULL DEFAULT 0.0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL,
    statement TEXT NOT NULL,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS options (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    label TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL,
    name TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    submitted_at INTEGER,
    score REAL DEFAULT 0,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS answers (
    attempt_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    option_id TEXT,
    PRIMARY KEY (attempt_id, question_id),
    FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE SET NULL
  )`);
});

// --- Helpers ---
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: invalid admin token' });
  }
  next();
}

// Seed sample quiz if DB empty
function seedIfEmpty() {
  db.get("SELECT COUNT(*) as cnt FROM quizzes", (err, row) => {
    if (err) return;
    if (row.cnt === 0) {
      const quizId = uuidv4();
      db.run(
        "INSERT INTO quizzes (id, title, subject, duration_minutes, negative_marking) VALUES (?,?,?,?,?)",
        [quizId, "JEE Physics: Kinematics Basics", "Physics", 10, 0.0],
        function (err) {
          if (err) return;
          const q1 = uuidv4();
          const q2 = uuidv4();

          db.run("INSERT INTO questions (id, quiz_id, statement) VALUES (?,?,?)",
            [q1, quizId, "A particle moves with constant acceleration a. If its initial velocity is u, what is the displacement in time t?" ]);
          db.run("INSERT INTO options (id, question_id, label, is_correct) VALUES (?,?,?,?)",
            [uuidv4(), q1, "s = ut + 1/2 at^2", 1]);
          db.run("INSERT INTO options (id, question_id, label, is_correct) VALUES (?,?,?,?)",
            [uuidv4(), q1, "s = u/t + at", 0]);
          db.run("INSERT INTO options (id, question_id, label, is_correct) VALUES (?,?,?,?)",
            [uuidv4(), q1, "s = u^2 + 2as", 0]);
          db.run("INSERT INTO options (id, question_id, label, is_correct) VALUES (?,?,?,?)",
            [uuidv4(), q1, "s = ut^2 + 1/2 a t", 0]);

          db.run("INSERT INTO questions (id, quiz_id, statement) VALUES (?,?,?)",
            [q2, quizId, "For projectile motion with speed u and angle θ, time of flight (neglecting air resistance) is?" ]);
          db.run("INSERT INTO options (id, question_id, label, is_correct) VALUES (?,?,?,?)",
            [uuidv4(), q2, "T = 2u sinθ / g", 1]);
          db.run("INSERT INTO options (id, question_id, label, is_correct) VALUES (?,?,?,?)",
            [uuidv4(), q2, "T = u cosθ / g", 0]);
          db.run("INSERT INTO options (id, question_id, label, is_correct) VALUES (?,?,?,?)",
            [uuidv4(), q2, "T = u / (g sinθ)", 0]);
          db.run("INSERT INTO options (id, question_id, label, is_correct) VALUES (?,?,?,?)",
            [uuidv4(), q2, "T = 2u / (g cosθ)", 0]);
        }
      );
    }
  });
}
seedIfEmpty();

// --- Public API ---

// List quizzes
app.get('/api/quizzes', (req, res) => {
  db.all("SELECT id, title, subject, duration_minutes FROM quizzes", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get quiz with questions
app.get('/api/quizzes/:id', (req, res) => {
  const quizId = req.params.id;
  db.get("SELECT id, title, subject, duration_minutes, negative_marking FROM quizzes WHERE id = ?", [quizId], (err, quiz) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    db.all("SELECT * FROM questions WHERE quiz_id = ?", [quizId], (err, questions) => {
      if (err) return res.status(500).json({ error: err.message });
      const qIds = questions.map(q => q.id);
      if (qIds.length === 0) return res.json({ ...quiz, questions: [] });

      db.all(`SELECT * FROM options WHERE question_id IN (${qIds.map(()=>'?').join(',')})`, qIds, (err, options) => {
        if (err) return res.status(500).json({ error: err.message });
        const byQ = {};
        options.forEach(o => {
          byQ[o.question_id] = byQ[o.question_id] || [];
          byQ[o.question_id].push({ id:o.id, label:o.label });
        });
        const payload = {
          ...quiz,
          questions: questions.map(q => ({
            id: q.id,
            statement: q.statement,
            options: byQ[q.id] || []
          }))
        };
        res.json(payload);
      });
    });
  });
});

// Start attempt
app.post('/api/attempts', (req, res) => {
  const { quiz_id, name } = req.body;
  if (!quiz_id || !name) return res.status(400).json({ error: "quiz_id and name required" });
  const attemptId = uuidv4();
  const started = Date.now();
  db.run("INSERT INTO attempts (id, quiz_id, name, started_at) VALUES (?,?,?,?)",
    [attemptId, quiz_id, name, started], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ attempt_id: attemptId, started_at: started });
    });
});

// Save answer (upsert)
app.post('/api/attempts/:attemptId/answer', (req, res) => {
  const { attemptId } = req.params;
  const { question_id, option_id } = req.body;
  if (!question_id) return res.status(400).json({ error: "question_id required" });

  db.run(`INSERT INTO answers (attempt_id, question_id, option_id)
          VALUES (?,?,?)
          ON CONFLICT(attempt_id, question_id) DO UPDATE SET option_id=excluded.option_id`,
    [attemptId, question_id, option_id || null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    });
});

// Submit attempt and compute score
app.post('/api/attempts/:attemptId/submit', (req, res) => {
  const { attemptId } = req.params;

  db.get("SELECT quiz_id FROM attempts WHERE id = ?", [attemptId], (err, attempt) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    const quizId = attempt.quiz_id;
    db.all("SELECT q.id as qid, o.id as oid, o.is_correct FROM questions q JOIN options o ON o.question_id = q.id WHERE q.quiz_id = ?", [quizId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const correctByQ = {};
      rows.forEach(r => { if (r.is_correct) correctByQ[r.qid] = r.oid; });

      db.all("SELECT question_id, option_id FROM answers WHERE attempt_id = ?", [attemptId], (err, answers) => {
        if (err) return res.status(500).json({ error: err.message });

        const chosenByQ = {};
        answers.forEach(a => { chosenByQ[a.question_id] = a.option_id; });

        db.get("SELECT negative_marking FROM quizzes WHERE id = ?", [quizId], (err, quiz) => {
          if (err) return res.status(500).json({ error: err.message });
          const neg = quiz.negative_marking || 0.0;

          let correct = 0, wrong = 0, total = Object.keys(correctByQ).length;
          Object.keys(correctByQ).forEach(qid => {
            const chosen = chosenByQ[qid];
            if (!chosen) return;
            if (chosen === correctByQ[qid]) correct++; else wrong++;
          });
          const score = correct * 4 - wrong * neg;
          db.run("UPDATE attempts SET submitted_at = ?, score = ? WHERE id = ?", [Date.now(), score, attemptId]);
          res.json({ total, correct, wrong, score });
        });
      });
    });
  });
});

// Get attempt summary
app.get('/api/attempts/:attemptId', (req, res) => {
  const { attemptId } = req.params;
  db.get("SELECT * FROM attempts WHERE id = ?", [attemptId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Attempt not found" });
    res.json(row);
  });
});

// --- Admin endpoints ---

// Create quiz (requires x-admin-token header)
app.post('/api/admin/quizzes', requireAdmin, (req, res) => {
  const { title, subject, duration_minutes=15, negative_marking=0.0, questions=[] } = req.body;
  if (!title || !subject) return res.status(400).json({ error: "title and subject required" });

  const quizId = uuidv4();
  db.run("INSERT INTO quizzes (id, title, subject, duration_minutes, negative_marking) VALUES (?,?,?,?,?)",
    [quizId, title, subject, duration_minutes, negative_marking], function (err) {
      if (err) return res.status(500).json({ error: err.message });

      const qInsert = db.prepare("INSERT INTO questions (id, quiz_id, statement) VALUES (?,?,?)");
      const oInsert = db.prepare("INSERT INTO options (id, question_id, label, is_correct) VALUES (?,?,?,?)");

      questions.forEach(q => {
        const qid = uuidv4();
        qInsert.run(qid, quizId, q.statement);
        (q.options || []).forEach(opt => {
          oInsert.run(uuidv4(), qid, opt.label, opt.is_correct ? 1 : 0);
        });
      });

      qInsert.finalize();
      oInsert.finalize();
      res.status(201).json({ id: quizId });
    });
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
