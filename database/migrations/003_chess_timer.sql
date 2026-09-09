-- Chess timer + anti-cheat support
-- statement-break
ALTER TABLE chess_matches ADD COLUMN white_time_ms integer;
-- statement-break
ALTER TABLE chess_matches ADD COLUMN black_time_ms integer;
-- statement-break
ALTER TABLE chess_matches ADD COLUMN last_move_at timestamptz;
-- statement-break
ALTER TABLE chess_matches ADD COLUMN time_control text NOT NULL DEFAULT 'UNTIMED';
-- statement-break
CREATE TABLE anticheat_violations(id text PRIMARY KEY, team_id text NOT NULL REFERENCES teams(id), session_id text NOT NULL, violation_type text NOT NULL CHECK(violation_type IN ('TAB_SWITCH','FULLSCREEN_EXIT')), metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE INDEX anticheat_team ON anticheat_violations(team_id, created_at DESC);
