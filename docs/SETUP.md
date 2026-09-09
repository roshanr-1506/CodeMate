# Setup
Install Node.js 22.18+ and npm. In the project directory run npm install, npm run setup, then npm run dev. Open the exact FRONTEND_URL in .env. For the built single-server app run npm run build and npm run local, then open http://127.0.0.1:3001. The Windows launcher uses that same local mode.

Read demo-credentials.txt and .data/admin-credentials.txt for generated development logins. Use different browser profiles for Chess/Debugging. A second team is needed as the chess opponent.

| Variable | Purpose |
|---|---|
| NODE_ENV | development, test or production |
| DATABASE_URL | PostgreSQL URL; empty only for embedded development |
| DATABASE_SSL | true enables certificate-verified database TLS |
| SESSION_SECRET | At least 32 characters; setup generates it |
| FRONTEND_URL | Exact allowed browser origin including port |
| PORT | Server port, default 3001 |
| SESSION_TTL_HOURS | Absolute lifetime, default 12 |
| SESSION_IDLE_SECONDS | Heartbeat expiry, default 120 |
| COOKIE_SAME_SITE | lax default; strict or none if required |
| STOCKFISH_PATH | Optional native UCI executable; blank uses bundled Stockfish |
| ENGINE_WORKERS | Persistent workers, default 2, max 8 |
| ENGINE_QUEUE_SIZE | Durable queue pressure threshold |
| VITE_BACKEND_URL | Public API origin for a separately hosted frontend |
| DEMO_PASSWORD | Optional explicit development seed password |
| ADMIN_USERNAME / ADMIN_PASSWORD | Secure admin creation input |

SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SOCKET_SERVER_URL are optional metadata; core operation needs only the PostgreSQL URL and API origin. No external AI/chess API is used.

For standard PostgreSQL, create an empty database, configure DATABASE_URL, run npm run migrate and npm run create-admin. Development may use npm run seed; production rejects demo seeding. Setup retains existing demo team passwords on repeat runs.

Do not run multiple processes against .data/postgres. Do not put secrets in VITE_ variables or commit .env/.data. Automated and load tests always use isolated databases.
