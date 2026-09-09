# REST and Socket API
All /api routes except POST /auth/login require the HTTP-only cm_session cookie. Mutations also require the exact configured Origin and the X-CSRF-Token returned by login or GET /auth/session. Send application/json.

Gameplay operations require operationId (8–100 characters). Retry the same request with the same ID after network loss. A different payload under that ID is rejected.

## Authentication / team
- POST /api/auth/login: {identifier,password,role: CHESS|DEBUGGING|ADMIN}
- GET /api/auth/session; POST /api/auth/heartbeat; POST /api/auth/logout
- GET /api/team, /api/team/score, /api/team/activity, /api/team/statistics, /api/team/powerups
- GET /api/settings, /api/notifications, /api/leaderboard

Leaderboard returns {rows,asOf,delaySeconds,warming}, filtered by role.

## Chess
- GET /api/chess/matchmaking
- POST /api/chess/matchmaking/join: {operationId}
- POST /api/chess/matchmaking/cancel
- GET /api/chess/matches
- GET /api/chess/matches/:id and /api/chess/matches/:id/moves
- POST /api/chess/matches/:id/move: {from,to,promotion?,expectedPly,operationId}
- POST /api/chess/matches/:id/resign: {operationId}

Promotion is q/r/b/n. Participant live history excludes engine values and suggestions.

## Debugging
- GET /api/debug/questions: metadata/ownership/status
- POST /api/debug/questions/:id/start: {operationId}
- GET /api/debug/current
- GET /api/debug/questions/:id: currently started question only
- POST /api/debug/questions/:id/submit: {answer:0|1|2|3,operationId}
- GET /api/debug/history

Only POST starts a timer. GET does not create attempts. Active payloads omit answer/explanation/hint until authorized reveal. Submission/expiry records are persisted.

## Shop
- GET /api/shop, /api/powerups
- POST /api/shop/purchase: {kind:POWERUP|QUESTION|SET,itemId,operationId}
- POST /api/powerups/:id/use: {attemptId,operationId}
- GET /api/premium/questions and /api/premium/sets
- POST /api/premium/questions/:id/unlock: {operationId}
- POST /api/premium/sets/:id/purchase: {operationId}

## Admin
ADMIN is required for every read, mutation and export.
- GET /api/admin/{teams|sessions|questions|question-sets|powerups|shop|scoring|settings|transactions|audit|monitoring|matches|purchases}
- POST /api/admin/{teams|questions|question-sets|powerups}: {value,reason}
- PUT /api/admin/{resource}/:id: {value,reason}
- DELETE /api/admin/{resource}/:id: {reason}; archives referenced records
- PUT /api/admin/scoring or /api/admin/settings: {value,reason}
- POST /api/admin/control: {action:START|PAUSE|RESUME|END,reason}
- POST /api/admin/adjust: {teamId,amount,reason,operationId}
- POST /api/admin/sessions/:id/revoke: {reason,newRole?:CHESS|DEBUGGING}
- POST /api/admin/analysis/retry: {reason}
- GET /api/admin/export/:dataset?format=csv|json

Export datasets: teams, scores, leaderboard, chess-matches, chess-moves, debugging-attempts, transactions, purchases, powerups, audit, questions, question-sets. Team exports exclude credential hashes/tokens.

## Socket.IO
Connect with credentials and allowed Origin. There is no arbitrary room-join endpoint.
Events: team:score_updated, team:balance_updated, team:session_joined, team:session_left, team:powerup_updated, team:purchase_completed, notification:new, session:revoked, chess:match_found, chess:move_accepted, chess:piece_captured, chess:move_evaluated, chess:match_completed, debugging:question_started, debugging:answer_submitted, debugging:question_expired, competition:updated, leaderboard:updated.

Client chess:move_requested uses the move payload plus matchId and receives an acknowledgement. chess:reconnect returns a verified owned match snapshot. Outbox event IDs support duplicate handling.

## Status / errors
GET /health returns server/database/socket/engine status and timestamp. Detailed monitoring is admin-only.
400 invalid input; 401 session; 403 role/Origin/CSRF; 404 unavailable; 409 state/ownership/idempotency; 422 illegal move; 429 rate limit; 500 unexpected server failure. Client responses do not include internal stack traces.
