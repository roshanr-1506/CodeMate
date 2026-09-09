# Deployment
## One-origin Node deployment
Build and serve the frontend/API from one Node process behind HTTPS:
```sh
npm ci
npm run build
npm run migrate
npm run create-admin
npm start
```
Set NODE_ENV=production, DATABASE_URL, SESSION_SECRET (32+ random characters), and FRONTEND_URL=https://your-domain.example. Enable DATABASE_SSL when required by the provider; verification remains enabled. Forward WebSocket upgrades at the reverse proxy. PORT defaults to 3001.

## Docker / Compose
Set private POSTGRES_PASSWORD, SESSION_SECRET and an HTTPS FRONTEND_URL. Use a URL-safe database password or encode reserved URL characters in DATABASE_URL.
```sh
docker compose build
docker compose up -d db
docker compose run --rm app node .data/tools/scripts/migrate.js
docker compose run --rm -e ADMIN_USERNAME=operator -e ADMIN_PASSWORD app node .data/tools/scripts/create-admin.js
docker compose up -d app
```
Set ADMIN_PASSWORD securely in your shell before the admin command. If omitted, the generated credential file is inside that one-off container; mount a private .data directory to retain it. The runtime image is non-root. Configure TLS and backups. Docker execution was not tested on this Windows host because Docker is unavailable.

## Supabase / Render
Use your PostgreSQL provider's connection string. render.yaml defines a Docker-backed Node service; supply secrets and the exact frontend origin. Apply migrations and create the administrator before opening the event. HTTP, WebSockets and child Stockfish processes require a persistent Node runtime. Avoid process sleeping during the event; measure host CPU/database capacity.

## Vercel frontend
The root vercel.json builds dist/frontend and serves SPA routes. Set VITE_BACKEND_URL=https://api.your-domain.example at build time and FRONTEND_URL=https://app.your-domain.example on the backend. Same-site HTTPS custom domains work with COOKIE_SAME_SITE=lax.

Unrelated frontend/API sites require COOKIE_SAME_SITE=none with Secure cookies, and some browsers block third-party cookies. Prefer same-site domains or one origin. The browser connects directly to the API; WebSockets do not run inside a serverless frontend function.

## Engine / operations
Blank STOCKFISH_PATH uses bundled portable Stockfish. A native UCI executable may be selected by absolute path. Engine workers persist; HTTP requests do not spawn one engine each. Durable pending work is retried without guessed scores.

Before a live event, verify two role logins, HTTPS/cookies, service health, engine recovery, scoring/guard settings, snapshot delay and scheduled end. Rehearse end/finalization with no pending analysis and test PostgreSQL backup restoration. Benchmark on the actual host.

No hosting account, DNS record, production database or external deployment was created.
