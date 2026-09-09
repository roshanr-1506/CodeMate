# Architecture
The database/backend owns scores, sessions, board state, legality, answers, timers, inventory and rank. React submits intentions and renders verified state.

## Transactions
Express checks cookie authentication, Origin and CSRF. Services recheck role/session/ownership and competition state inside a transaction. Every mutation acquires one PostgreSQL transaction advisory lock. This intentionally serializes short state transitions and prevents cross-domain races. Password hashing and Stockfish computation run outside the lock.

This conservative single mutation gate is a throughput tradeoff. The supported topology is one Node API instance plus PostgreSQL and a bounded engine pool. Horizontal API replication additionally needs a shared Socket.IO adapter and distributed rate limiting. PGlite serializes its single development connection and uses the same SQL schema.

## Points
Team-scoped operation fingerprints reject reusing an ID for different input. Globally unique ledger event IDs independently prevent duplicate scoring. Debit/purchase/ownership/outbox commit together. Ledger and audit triggers reject update/delete; corrections are compensating entries.

## Chess and Stockfish
The server reconstructs all stored moves from initial FEN, retaining repetition history. It verifies player, turn, expected ply and legality through chess.js. Match rules are snapshotted. Capture, quality, checkmate and result are separate entries.

Persistent UCI processes evaluate before/after positions through a database-backed queue with recoverable leases and retries. Only the worker count is active in memory; durable pending records are retained beyond the pressure threshold. Failure stays pending and never becomes a guessed penalty.

UCI values are from the side to move, so the mover's loss is max(0, before + after). Mate is mapped to a signed large score. Default Mistake includes 200 centipawns; Blunder starts above 200. Opening guard suppresses positive quality bonuses, not captures or penalties. Early resignation compensates both teams' entire match score and voids unfinished analysis. No king capture is allowed.

## Debugging and economy
Attempts snapshot content/answer/reward and store server deadlines. Correct answers, explanations and hints are omitted until authorized reveal. A team has one active question and one attempt per question per round.

Freeze extends the deadline and sets frozen_until; effective remaining time stays constant during the freeze. Round caps/final-window limits are checked at the server. Extra Time extends without freezing. Option elimination selects only incorrect choices. Inventory consumption and activation records are atomic.

## Real-time/recovery
Transactional outbox sequence defines delivery order. Delivery is at least once; events have IDs and the UI refetches authoritative state. Socket rooms derive solely from authenticated team/role/session; clients cannot choose arbitrary rooms. Reconnection restores match, attempt, inventory and score. Revocation disconnects the session room.

## Competition/ranking
Pause blocks gameplay and score application. Resume shifts deadlines, remaining freeze intervals and scheduled end by the pause duration. Engine computation may complete while paused, but application waits.

End requires pending analysis to resolve, locks scores, expires active questions and closes unfinished games without inventing winners. Scheduled end stops new actions, drains accepted analysis, then finalizes. Round changes preserve earned history and ownership.

Rank uses net earned before spending, then Team ID. Five-second persisted snapshots support the delayed Debugging shop-window view. There is no live fallback while delayed standings warm up.
