CREATE TABLE teams(id text PRIMARY KEY, name text NOT NULL, password_hash text NOT NULL, enabled boolean NOT NULL DEFAULT true, deleted boolean NOT NULL DEFAULT false, balance integer NOT NULL DEFAULT 0, chess_earned integer NOT NULL DEFAULT 0, debugging_earned integer NOT NULL DEFAULT 0, other_earned integer NOT NULL DEFAULT 0, spent integer NOT NULL DEFAULT 0 CHECK(spent>=0), created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE admin_users(id text PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE team_sessions(id text PRIMARY KEY, token_hash text NOT NULL UNIQUE, team_id text REFERENCES teams(id), admin_id text REFERENCES admin_users(id), role text NOT NULL CHECK(role IN ('CHESS','DEBUGGING','ADMIN')), device_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_heartbeat timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','REVOKED')), metadata jsonb NOT NULL DEFAULT '{}', CHECK((role='ADMIN' AND admin_id IS NOT NULL AND team_id IS NULL) OR (role<>'ADMIN' AND team_id IS NOT NULL AND admin_id IS NULL)));
-- statement-break
CREATE UNIQUE INDEX active_team_role ON team_sessions(team_id,role) WHERE status='ACTIVE' AND team_id IS NOT NULL;
-- statement-break
CREATE INDEX session_heartbeat ON team_sessions(status,last_heartbeat);
-- statement-break
CREATE TABLE role_locks(team_id text NOT NULL REFERENCES teams(id),device_id text NOT NULL,round_id integer NOT NULL,role text NOT NULL CHECK(role IN ('CHESS','DEBUGGING')),PRIMARY KEY(team_id,device_id,round_id));
-- statement-break
CREATE TABLE competition_settings(id integer PRIMARY KEY CHECK(id=1),value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE point_transactions(id text PRIMARY KEY,team_id text NOT NULL REFERENCES teams(id),type text NOT NULL,source text NOT NULL CHECK(source IN ('CHESS','DEBUGGING','ECONOMY','ADMIN')),amount integer NOT NULL,balance_before integer NOT NULL,balance_after integer NOT NULL,reference_id text NOT NULL,operation_id text NOT NULL UNIQUE,description text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),CHECK(balance_after=balance_before+amount));
-- statement-break
CREATE INDEX ledger_team_time ON point_transactions(team_id,created_at DESC);
-- statement-break
CREATE FUNCTION forbid_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable record: use a compensating transaction'; END $$;
-- statement-break
CREATE TRIGGER ledger_immutable BEFORE UPDATE OR DELETE ON point_transactions FOR EACH ROW EXECUTE FUNCTION forbid_immutable_change();
-- statement-break
CREATE TABLE audit_logs(id text PRIMARY KEY,team_id text REFERENCES teams(id),session_id text,role text,action text NOT NULL,reference_id text,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE INDEX audit_time ON audit_logs(created_at DESC);
-- statement-break
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_immutable_change();
-- statement-break
CREATE TABLE operations(team_id text NOT NULL REFERENCES teams(id),operation_id text NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(team_id,operation_id));
-- statement-break
CREATE TABLE notifications(id text PRIMARY KEY,team_id text NOT NULL REFERENCES teams(id),message text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE outbox(id text PRIMARY KEY,room text NOT NULL,event text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz);
-- statement-break
CREATE INDEX pending_outbox ON outbox(created_at) WHERE sent_at IS NULL;
-- statement-break
CREATE TABLE debugging_questions(id text PRIMARY KEY,title text NOT NULL,prompt text NOT NULL,language text NOT NULL,code_snippet text NOT NULL,options jsonb NOT NULL CHECK(jsonb_array_length(options)=4),correct_answer integer NOT NULL CHECK(correct_answer BETWEEN 0 AND 3),difficulty text NOT NULL CHECK(difficulty IN ('Easy','Medium','Hard','Expert')),points integer NOT NULL CHECK(points>0),time_limit integer NOT NULL CHECK(time_limit BETWEEN 10 AND 3600),category text NOT NULL,explanation text NOT NULL,hint text NOT NULL,premium boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE question_sets(id text PRIMARY KEY,name text NOT NULL,description text NOT NULL,price integer NOT NULL DEFAULT 500 CHECK(price>=0),points_per_question integer NOT NULL DEFAULT 50 CHECK(points_per_question>0),active boolean NOT NULL DEFAULT true);
-- statement-break
CREATE TABLE question_set_questions(set_id text NOT NULL REFERENCES question_sets(id),question_id text NOT NULL REFERENCES debugging_questions(id),PRIMARY KEY(set_id,question_id),UNIQUE(question_id));
-- statement-break
CREATE TABLE debugging_attempts(id text PRIMARY KEY,team_id text NOT NULL REFERENCES teams(id),question_id text NOT NULL REFERENCES debugging_questions(id),round_id integer NOT NULL,question_snapshot jsonb NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,submitted_at timestamptz,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CORRECT','INCORRECT','EXPIRED','SKIPPED')),answer integer CHECK(answer BETWEEN 0 AND 3),frozen_until timestamptz,removed_options jsonb NOT NULL DEFAULT '[]',hint_revealed boolean NOT NULL DEFAULT false,UNIQUE(team_id,question_id,round_id));
-- statement-break
CREATE UNIQUE INDEX one_active_attempt ON debugging_attempts(team_id) WHERE status='ACTIVE';
-- statement-break
CREATE INDEX attempts_expiration ON debugging_attempts(expires_at) WHERE status='ACTIVE';
-- statement-break
CREATE TABLE powerups(id text PRIMARY KEY,name text NOT NULL,description text NOT NULL,cost integer NOT NULL CHECK(cost>=0),effect text NOT NULL CHECK(effect IN ('FREEZE','HALF','BLAST','EXTRA','SKIP','HINT')),duration integer NOT NULL DEFAULT 30 CHECK(duration BETWEEN 1 AND 300),usage_limit integer NOT NULL DEFAULT 1 CHECK(usage_limit BETWEEN 1 AND 10),active boolean NOT NULL DEFAULT true);
-- statement-break
CREATE TABLE team_powerups(team_id text NOT NULL REFERENCES teams(id),powerup_id text NOT NULL REFERENCES powerups(id),quantity integer NOT NULL DEFAULT 0 CHECK(quantity>=0),PRIMARY KEY(team_id,powerup_id));
-- statement-break
CREATE TABLE purchases(id text PRIMARY KEY,team_id text NOT NULL REFERENCES teams(id),kind text NOT NULL CHECK(kind IN ('POWERUP','QUESTION','SET')),item_id text NOT NULL,cost integer NOT NULL CHECK(cost>=0),operation_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(team_id,operation_id));
-- statement-break
CREATE TABLE team_question_unlocks(team_id text NOT NULL REFERENCES teams(id),question_id text NOT NULL REFERENCES debugging_questions(id),purchase_id text NOT NULL REFERENCES purchases(id),PRIMARY KEY(team_id,question_id));
-- statement-break
CREATE TABLE team_set_unlocks(team_id text NOT NULL REFERENCES teams(id),set_id text NOT NULL REFERENCES question_sets(id),purchase_id text NOT NULL REFERENCES purchases(id),PRIMARY KEY(team_id,set_id));
-- statement-break
CREATE TABLE powerup_uses(id text PRIMARY KEY,team_id text NOT NULL REFERENCES teams(id),attempt_id text NOT NULL REFERENCES debugging_attempts(id),powerup_id text NOT NULL REFERENCES powerups(id),round_id integer NOT NULL,duration integer NOT NULL DEFAULT 0,operation_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(team_id,operation_id));
-- statement-break
CREATE TABLE chess_matches(id text PRIMARY KEY,white_team text NOT NULL REFERENCES teams(id),black_team text NOT NULL REFERENCES teams(id),initial_fen text NOT NULL,fen text NOT NULL,ply integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED')),result text,termination text,score_void boolean NOT NULL DEFAULT false,scoring_snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,CHECK(white_team<>black_team));
-- statement-break
CREATE TABLE chess_players(team_id text PRIMARY KEY REFERENCES teams(id),match_id text NOT NULL REFERENCES chess_matches(id),color text NOT NULL CHECK(color IN ('w','b')),UNIQUE(match_id,color));
-- statement-break
CREATE TABLE matchmaking_queue(team_id text PRIMARY KEY REFERENCES teams(id),created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE chess_moves(id text PRIMARY KEY,match_id text NOT NULL REFERENCES chess_matches(id),ply integer NOT NULL,team_id text NOT NULL REFERENCES teams(id),player_color text NOT NULL,from_square text NOT NULL,to_square text NOT NULL,san text NOT NULL,uci text NOT NULL,fen_before text NOT NULL,fen_after text NOT NULL,captured_piece text,operation_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(match_id,ply),UNIQUE(team_id,operation_id));
-- statement-break
CREATE TABLE chess_move_evaluations(move_id text PRIMARY KEY REFERENCES chess_moves(id),status text NOT NULL DEFAULT 'PENDING_ANALYSIS' CHECK(status IN ('PENDING_ANALYSIS','PROCESSING','COMPLETE','VOID')),evaluation_before integer,evaluation_after integer,evaluation_loss integer,classification text,points integer NOT NULL DEFAULT 0,attempts integer NOT NULL DEFAULT 0,next_retry_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,last_error text,completed_at timestamptz);
-- statement-break
CREATE INDEX engine_queue ON chess_move_evaluations(status,next_retry_at);
-- statement-break
CREATE TABLE chess_events(id text PRIMARY KEY,match_id text NOT NULL REFERENCES chess_matches(id),event_id text NOT NULL UNIQUE,type text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE TABLE leaderboard_snapshots(id text PRIMARY KEY,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
-- statement-break
CREATE INDEX leaderboard_snapshot_time ON leaderboard_snapshots(created_at DESC);
