# Coverage and decisions
| Areas of supplied specification | Implementation |
|---|---|
| Identity, roles, dashboard, UI | Poster-themed landing/login, two-role sessions, dashboard, arenas, shop, leaderboard, team statistics and responsive admin |
| Points/concurrency | Immutable ledger, atomic state transitions, separate earned/balance, semantic idempotency |
| Internal chess | Matchmaking, react-chessboard, chess.js legality/history/repetition, captures and results |
| Engine/guards | Real Stockfish pool, leases/retries, independent scoring entries, opening and resignation guards |
| Debugging/economy | PostgreSQL MCQs, server timer, all six power-ups, individual ownership and 25-question mixed-language sets |
| Real-time/recovery | Private sockets, ordered outbox, snapshot refetch, delayed ranking and activity |
| Administration | Team/session/content/scoring/settings management, audited lifecycle, monitoring and exports |
| Security/data | Cookie/Origin/CSRF/RBAC, validated actions, migrations, foreign keys and unique constraints |
| Delivery/testing | Setup/admin scripts, local launcher, Docker/Render/Vercel files, API/domain/engine/socket/browser/load tests |

Explicit choices:
- King value means checkmate, never king capture.
- Ranking uses net earned before purchases; balance is separate.
- Mistake includes 200 centipawns; Blunder begins above 200.
- Role continuity is a signed browser cookie, not hardware identity.
- Tabs share a profile's cookie; two participants need separate profiles/devices.
- Same-set repurchase is disabled; sold set membership is locked.
- Referenced records are archived rather than physically deleted.
- End closes unfinished games without inventing a winner and waits for pending engine work.
- Round changes preserve historical points/ownership.
- Durable pending work is not discarded when the queue pressure threshold is exceeded.
- One API instance is supported. Distributed sockets/rate limiting are not claimed.
- 100 two-person teams imply 200 users and 50 simultaneous 1v1 games. LOAD_TEAMS=200 exercises 100 games with 400 users.
- Demo content requires organizer review before a real contest.
- The delivered system is local; the user controls deployment and GitHub publication.

The browser workflow covers the two roles, third login rejection, matchmaking/moves, shared capture/debugging points, real Freeze Time pause, premium purchases, 25 questions/five languages, delayed standings, transaction uniqueness, admin logout and reconnect. Additional integration tests execute exact +90/+8 separate real-engine entries, a real -5 blunder, all captures and result bonuses, early-resignation compensation, expiry, caps, duplicate operations and engine recovery. Together these exercise the supplied extended end-to-end checklist without exposing engine internals to participants.
