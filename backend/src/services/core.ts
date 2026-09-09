import { randomUUID, createHash } from 'node:crypto';
import { Database, type Query } from '../db.js';
import { defaults } from '../defaults.js';
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function need(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new AppError(status, message);
}
export type Actor = {
  id: string;
  team_id: string;
  role: 'CHESS' | 'DEBUGGING' | 'ADMIN';
  admin_id?: string;
  device_id: string;
  expires_at: string;
};
export type Settings = typeof defaults;
export class Core {
  constructor(
    public db: Database,
    public now: () => number = Date.now,
  ) {}
  async settings(q: Query = this.db): Promise<Settings> {
    return (
      (await q.query('SELECT value FROM competition_settings WHERE id=1'))[0]?.value ?? defaults
    );
  }
  async audit(
    q: Query,
    a: Partial<Actor> | null,
    action: string,
    referenceId: string | null = null,
    metadata: any = {},
  ) {
    await q.query(
      'INSERT INTO audit_logs(id,team_id,session_id,role,action,reference_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        randomUUID(),
        a?.team_id ?? null,
        a?.id ?? null,
        a?.role ?? null,
        action,
        referenceId,
        JSON.stringify(metadata),
      ],
    );
  }
  async event(q: Query, room: string, event: string, payload: any) {
    await q.query('INSERT INTO outbox(id,room,event,payload) VALUES($1,$2,$3,$4)', [
      randomUUID(),
      room,
      event,
      JSON.stringify(payload),
    ]);
  }
  async notify(q: Query, teamId: string, message: string) {
    const n = { id: randomUUID(), message, created_at: new Date(this.now()).toISOString() };
    await q.query('INSERT INTO notifications(id,team_id,message) VALUES($1,$2,$3)', [
      n.id,
      teamId,
      message,
    ]);
    await this.event(q, 'team:' + teamId, 'notification:new', n);
  }
  async active(q: Query, shop = false) {
    const s = await this.settings(q);
    need(
      s.state === 'RUNNING',
      s.state === 'PAUSED'
        ? 'Competition Paused'
        : s.state === 'ENDED'
          ? 'Competition has ended.'
          : 'Competition has not started.',
      409,
    );
    if (s.endsAt) need(this.now() < Date.parse(s.endsAt), 'Competition has ended.', 409);
    if (shop) need(s.shopOpen, 'The shop is closed.', 409);
    return s;
  }
  async authorize(q: Query, a: Actor, role?: string) {
    const [session] = await q.query(
      "SELECT s.*,t.enabled FROM team_sessions s LEFT JOIN teams t ON t.id=s.team_id WHERE s.id=$1 AND s.status='ACTIVE' AND s.expires_at>$2",
      [a.id, new Date(this.now())],
    );
    need(
      session &&
        session.team_id === a.team_id &&
        session.role === a.role &&
        (a.role === 'ADMIN' || session.enabled),
      'Your session has expired. Please log in again.',
      401,
    );
    if (role) need(a.role === role, 'This action is unavailable for your role.', 403);
  }
  async operation(q: Query, a: Actor, id: string, request: any, action: () => Promise<any>) {
    need(
      typeof id === 'string' && id.length >= 8 && id.length <= 100,
      'A valid operationId is required.',
    );
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const [existing] = await q.query(
      'SELECT * FROM operations WHERE team_id=$1 AND operation_id=$2',
      [a.team_id, id],
    );
    if (existing) {
      need(
        existing.fingerprint === fingerprint,
        'This operationId was already used for a different request.',
        409,
      );
      return existing.response;
    }
    const response = await action();
    await q.query(
      'INSERT INTO operations(team_id,operation_id,fingerprint,response) VALUES($1,$2,$3,$4)',
      [a.team_id, id, fingerprint, JSON.stringify(response)],
    );
    return response;
  }
}
