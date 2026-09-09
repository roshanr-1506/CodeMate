# Validation evidence
The production build passes. The automated suite contains 18 passing database, domain, HTTP, security, real-engine and real-socket tests. Both isolated browser scenarios pass, including two-role gameplay/purchases/reconnection and poster/mobile layout.

Tests use real application services and PostgreSQL semantics, not fake scoring endpoints. Engine tests execute Stockfish, verifying independent +90 queen capture / +8 Excellent entries and a genuine -5 mate-conceding blunder.

Run npm test, npm run build, npm run test:e2e and npm run test:load. Browser/load fixtures use isolated databases. Monaco is dynamically loaded on the debugging page; its editor bundle is intentionally larger than the general interface.

## Final local load run
The recorded validation/load-test.json contains:
- 100 teams, 200 successful HTTP logins and 200 concurrent Socket.IO clients.
- 200 successful authenticated HTTP team reads from the same network.
- 50 simultaneous chess games and 150 real Stockfish analyses using two workers.
- 850 measured operations.
- All 100 concurrent 500 + 100 - 80 balances equal to 520.
- Zero ledger mismatches and zero duplicate transactions.
- p50 507 ms, p95 1,183 ms, maximum 1,453 ms on this host.

The test used isolated embedded PostgreSQL (PGlite) on the user's Windows device. These results do not establish hosted PostgreSQL, Internet, multi-replica or hosting-plan capacity. The load runner deliberately cannot alter the local event database.

## Browser evidence
validation/ contains desktop landing/chess/debugging/admin and mobile landing/dashboard images. Browser assertions include no page errors and no horizontal page overflow at 390 px.

## Scope of verification
A fresh local setup is checked separately. External deployment, Docker execution, remote PostgreSQL load, production TLS/domain setup, production backup restore and independent security review were not performed. Deployment procedures and configuration are included.
