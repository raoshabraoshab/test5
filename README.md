# JEE Quiz App (Node + Express + SQLite + Vanilla JS)

## Quickstart
```bash
# 1) Extract and install
npm install

# 2) (Optional) set admin token
cp .env.example .env
# edit ADMIN_TOKEN in .env

# 3) Run
npm start
# Open http://localhost:3000
```

A sample Physics quiz is auto-seeded.

## Admin: Create a quiz
Send a POST request:
```
POST /api/admin/quizzes
Headers: x-admin-token: <ADMIN_TOKEN>
Body (json):
{
  "title": "JEE Chemistry: Atomic Structure",
  "subject": "Chemistry",
  "duration_minutes": 15,
  "negative_marking": 1.0,
  "questions": [
    {
      "statement": "Which quantum number describes the shape of orbital?",
      "options": [
        {"label": "Azimuthal (l)", "is_correct": true},
        {"label": "Principal (n)"},
        {"label": "Magnetic (m)"},
        {"label": "Spin (s)"}
      ]
    }
  ]
}
```
Use a REST client like Postman or curl.

## Deploy to Render/railway (free-tier friendly)
- Add a new Web Service from your Git repo
- Build Command: `npm install`
- Start Command: `npm start`
- Add ENV: `ADMIN_TOKEN=...`
- Persistent SQLite is basic; for production, use Postgres and a proper migration system.
