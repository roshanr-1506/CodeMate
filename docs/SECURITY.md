# Security
The implementation uses bcrypt, hashed random session tokens, signed browser device cookies, HTTP-only cookies, Secure cookies in production, explicit SameSite policy, exact Origin verification and session-bound CSRF on mutations.

Services recheck session/role/team ownership in transactions. Scores, chess, timers, answers, purchases and inventory are server-authoritative. SQL parameters and admin identifier allowlists prevent injection. Helmet, request size limits, login/HTTP/socket rate limits, CSV formula protection and private exports are included. Active answer keys and live engine scores/suggestions are not returned to participants.

The role lock is browser-device continuity, not hardware identity: clearing cookies can create a new device identifier. The two active role slots still hold. External engine consultation or assistance from other devices cannot be proven or prevented by this application alone.

The supported production topology is a single API instance. Horizontal replicas require a shared socket adapter and distributed limiter. The global transaction gate is intentional and must be benchmarked before increasing scale.

Competition controls and admin edits record reasons/audit entries. Resetting passwords/disabling teams revokes sessions. Forced reassignment requires fresh login. Ledger/audit rows are immutable and changes are compensating transactions.

Keep .env, credential files and .data private. Do not place secrets in frontend VITE_ values. Demo/test accounts are not production event configuration. Local tests do not replace deployment-specific security/resilience review.
