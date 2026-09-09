ALTER TABLE outbox ADD COLUMN sequence bigserial UNIQUE;
-- statement-break
ALTER TABLE point_transactions ADD COLUMN sequence bigserial UNIQUE;
-- statement-break
CREATE INDEX outbox_sequence_pending ON outbox(sequence) WHERE sent_at IS NULL;
