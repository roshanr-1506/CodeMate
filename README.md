# CodeMate 2.0

**Same Board. Different Game.** Chandigarh University · C Square Club

A self-hostable full-stack competition platform: internal 1v1 chess, real Stockfish analysis, timed debugging MCQs, shared team points, power-ups, premium content and administrator controls. The supplied poster establishes the black, bronze, cream and red identity.

## Quick start

Requires Node.js **22.18+** (24 recommended) and npm.

```sh
npm install
npm run setup
npm run dev
```

Open the exact FRONTEND_URL configured in .env (default http://localhost:5173). The API listens on port 3001.

For one local server:

```sh
npm run build
npm run local
```

Open **http://127.0.0.1:3001**. On Windows, after setup/build, double-click **Start-CodeMate.cmd**. The delivered working folder already contains dependencies and a build. The source ZIP excludes dependencies, databases and private credentials.

First setup creates ten demo teams (TEAM-001 to TEAM-010), a random shared team password in **demo-credentials.txt**, and an **event-admin** account with a random password in **.data/admin-credentials.txt**. It also creates 20 standard questions, five individual premium questions, five 25-question sets, six power-ups and a legal Stockfish-evaluated sample match on a fresh installation.

**Use separate browsers or browser profiles for the two participants.** Tabs in one profile share the session cookie. One team has exactly one Chess slot and one Debugging slot; a third active login is rejected.

Demo content is clearly development data. Replace/review questions before an actual event. Premium sample questions are parameterized advanced tracing exercises across C, C++, Java, Python and JavaScript.

## Included

- bcrypt passwords, HTTP-only cookies, CSRF/Origin checks, heartbeat expiry, role locks, force logout and reassignment.
- Internal matchmaking, legal moves/captures/results, complete chess history and board recovery.
- Configurable capture, move-quality and result scoring; real Stockfish workers, durable retries and farming/resignation guards.
- Private MCQ answers, server deadlines, question snapshots and submission history.
- Transactional shop, six consumable power-ups, individual premium questions and 25-question set ownership.
- Private Socket.IO synchronization, ordered outbox, delayed Debugging leaderboard.
- Poster-themed dashboard, chess board, local Monaco editor, shop, team statistics and administration.
- Team/content/scoring/settings management, monitoring, audit logs and CSV/JSON exports.

## Economy

Net earned = chess earned + debugging earned + administrator adjustments.
Available balance = net earned − purchases + economy refunds.
Leaderboard uses net earned before purchases. Quality penalties reduce earned score. Penalties/reversals may produce a negative balance; purchases cannot overspend. Equal ranks are ordered by Team ID.

## Stack

React 19, TypeScript, Vite, Tailwind CSS, React Router, Lucide, react-chessboard, chess.js, Monaco; Express/Node; PostgreSQL/pg; Socket.IO; bcrypt; Stockfish 17.1.

```text
frontend/src/          Interface, pages, hooks and API client
backend/src/           REST, authentication, services and workers
database/migrations/   PostgreSQL schema and constraints
database/seed/         Development content
scripts/               Setup, admin creation and launchers
tests/                 API/domain/engine/socket/load/browser tests
docs/                  Setup, architecture, deployment and evidence
```

## Database and admin

An empty DATABASE_URL uses persistent embedded PostgreSQL (PGlite) in .data/postgres for development. Production requires standard PostgreSQL, including self-hosted PostgreSQL or Supabase. No paid APIs are required.

```sh
npm run migrate
npm run create-admin
```

Admin creation accepts ADMIN_USERNAME / ADMIN_PASSWORD from the environment, or prompts for a username and generates a password into a private local file. No hardcoded production password exists.

## Verification

```sh
npm test
npm run build
npm run test:e2e
npm run test:load
```

Browser tests use installed Chrome/Edge on Windows or Playwright Chromium. Otherwise run npx playwright install chromium. Tests use isolated databases and accounts.

The completed local stress run used 200 sockets / 100 teams, 50 concurrent 1v1 games and 150 real Stockfish analyses. All 100 concurrent 500 + 100 − 80 balances were 520, with no duplicate transactions or ledger mismatches. This is local functional evidence, not hosted capacity certification.

## Deployment

Docker, Compose, Render and Vercel configuration are included. The simplest deployment serves UI/API from one Node server behind HTTPS. Production requires your database URL, session secret, domain/TLS and host. No deployment or GitHub push was performed.

Read [Setup](docs/SETUP.md), [Architecture](docs/ARCHITECTURE.md), [Database](docs/DATABASE.md), [API](docs/API.md), [Security](docs/SECURITY.md), [Deployment](docs/DEPLOYMENT.md), [Coverage](docs/REQUIREMENTS.md) and [Validation](docs/VALIDATION.md).

## Troubleshooting

- Login: check credentials, role and active sessions; use separate browser profiles.
- Origin error: localhost and 127.0.0.1 are distinct; use the configured origin.
- Pending engine: check monitoring and Retry analysis. Scores are never guessed.
- Cannot end: resolve pending analysis; resume first if paused.
- Database locked/port occupied: stop the previous local server.
- Restricted Windows development tools: use npm run build then npm run local.

Private .env, .data and credential files are excluded from Git. The poster is supplied artwork; its historical event date is not the current round configuration.
