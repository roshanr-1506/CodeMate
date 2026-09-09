# Database
Run npm run migrate. SQL files in database/migrations are tracked in schema_migrations.

| Domain | Tables |
|---|---|
| Identity | teams, admin_users, team_sessions, role_locks |
| Competition | competition_settings |
| Economy | point_transactions, operations, purchases, team_powerups, powerup_uses |
| Content | debugging_questions, debugging_attempts, question_sets, question_set_questions, team_question_unlocks, team_set_unlocks, powerups |
| Chess | chess_matches, chess_players, matchmaking_queue, chess_moves, chess_move_evaluations, chess_events |
| Operations | notifications, audit_logs, outbox, leaderboard_snapshots |

Team credentials are participant identity; there is no redundant participant users table. The shop derives from content/powerups rather than a second shop_items source.

Constraints enforce one active session per team/role, two role slots, one active chess membership and debugging attempt per team, unique match/ply and operation/event identifiers, unique ownership, foreign keys, nonnegative inventory/cost, and ledger balance arithmetic. Immutable triggers protect ledger/audit rows. Monotonic ledger/outbox sequences preserve order.

Questions are snapshotted per attempt and scoring per match. Purchased set membership is locked. Admin deletion archives referenced records. Parameterized SQL and internal allowlists prevent user-selected SQL identifiers.

Production uses pg and a bounded pool; embedded development stores files in .data/postgres. Use pg_dump/pg_restore and test restoration for complete backups. Admin CSV/JSON files are operational extracts, not full disaster-recovery backups.
