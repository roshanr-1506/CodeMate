import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Core, need, AppError, type Actor } from './core.js';
import type { Query } from '../db.js';
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
export class AuthService {
  constructor(
    public core: Core,
    public secret: string,
    public idleSeconds = 120,
    public ttlHours = 12,
  ) {}
  device(cookie?: string) {
    if (cookie) {
      const [id, sig] = cookie.split('.');
      if (
        id &&
        sig &&
        sig.length === 64 &&
        timingSafeEqual(Buffer.from(sig), Buffer.from(this.sign(id)))
      )
        return cookie;
    }
    const id = randomUUID();
    return id + '.' + this.sign(id);
  }
  sign(s: string) {
    return createHmac('sha256', this.secret).update(s).digest('hex');
  }
  csrf(a: Actor) {
    return this.sign('csrf:' + a.id);
  }
  async cleanup(q: Query) {
    const expired = await q.query(
      "UPDATE team_sessions SET status='EXPIRED' WHERE status='ACTIVE' AND (expires_at<=$1 OR last_heartbeat<=$2) RETURNING *",
      [new Date(this.core.now()), new Date(this.core.now() - this.idleSeconds * 1000)],
    );
    for (const s of expired) {
      await this.core.audit(q, s, 'SESSION_EXPIRED', s.id);
      await this.core.event(q, 'session:' + s.id, 'session:revoked', {});
      if (s.team_id)
        await this.core.event(q, 'team:' + s.team_id, 'team:session_left', { role: s.role });
    }
    await q.query(
      "DELETE FROM matchmaking_queue WHERE team_id NOT IN (SELECT team_id FROM team_sessions WHERE status='ACTIVE' AND role='CHESS')",
    );
  }
  async login(identifier: string, password: string, role: string, deviceCookie?: string) {
    need(['CHESS', 'DEBUGGING', 'ADMIN'].includes(role), 'Select a valid role.');
    const device = this.device(deviceCookie);
    const table = role === 'ADMIN' ? 'admin_users' : 'teams';
    const [account] = await this.core.db.query(
      'SELECT * FROM ' + table + ' WHERE ' + (role === 'ADMIN' ? 'username' : 'id') + '=$1',
      [identifier],
    );
    const valid = await bcrypt.compare(
      password,
      account?.password_hash ?? '$2b$12$k7IxMKPxaWG5AVJoF4DnEef9TZsoRXDLmFW22vf.xEZmqf5RXPMa2',
    );
    need(
      valid && account && (role === 'ADMIN' || (account.enabled && !account.deleted)),
      'Invalid credentials.',
      401,
    );
    const token = randomBytes(32).toString('base64url');
    const session = await this.core.db.tx(async (q) => {
      await this.cleanup(q);
      const [current] = await q.query('SELECT * FROM ' + table + ' WHERE id=$1', [account.id]);
      need(
        current &&
          current.password_hash === account.password_hash &&
          (role === 'ADMIN' || current.enabled),
        'Invalid credentials.',
        401,
      );
      const settings = await this.core.settings(q);
      if (role !== 'ADMIN') {
        const sessions = await q.query(
          "SELECT * FROM team_sessions WHERE team_id=$1 AND status='ACTIVE'",
          [account.id],
        );
        need(sessions.length < 2, 'Maximum active participants reached for this team.', 409);

        const [lock] = await q.query(
          'SELECT role FROM role_locks WHERE team_id=$1 AND device_id=$2 AND round_id=$3',
          [account.id, device, settings.roundId],
        );
        if (!settings.sessionRoleSelection)
          role = lock?.role ?? (sessions.some((s) => s.role === 'CHESS') ? 'DEBUGGING' : 'CHESS');
        need(
          !sessions.some((s) => s.role === role),
          'The ' + role.toLowerCase() + ' role is already active for this team.',
          409,
        );
        need(
          !lock || lock.role === role,
          'Your role is locked for this round. Contact an administrator.',
          409,
        );

        await q.query(
          'INSERT INTO role_locks(team_id,device_id,round_id,role) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [account.id, device, settings.roundId, role],
        );
      }
      const [s] = await q.query(
        'INSERT INTO team_sessions(id,token_hash,team_id,admin_id,role,device_id,expires_at,last_heartbeat) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,team_id,admin_id,role,device_id,expires_at',
        [
          randomUUID(),
          digest(token),
          role === 'ADMIN' ? null : account.id,
          role === 'ADMIN' ? account.id : null,
          role,
          device,
          new Date(this.core.now() + this.ttlHours * 3600000),
          new Date(this.core.now()),
        ],
      );
      await this.core.audit(q, s, 'LOGIN', s.id);
      if (s.team_id) await this.core.event(q, 'team:' + s.team_id, 'team:session_joined', { role });
      return s;
    });
    return { token, device, session, csrf: this.csrf(session) };
  }
  async session(token?: string, heartbeat = false): Promise<Actor> {
    need(token, 'Your session has expired. Please log in again.', 401);
    return this.core.db.tx(async (q) => {
      await this.cleanup(q);
      const [s] = await q.query(
        "SELECT s.id,s.team_id,s.admin_id,s.role,s.device_id,s.expires_at,t.enabled FROM team_sessions s LEFT JOIN teams t ON t.id=s.team_id WHERE token_hash=$1 AND s.status='ACTIVE'",
        [digest(token!)],
      );
      need(
        s && (s.role === 'ADMIN' || s.enabled),
        'Your session has expired. Please log in again.',
        401,
      );
      if (heartbeat)
        await q.query('UPDATE team_sessions SET last_heartbeat=$2 WHERE id=$1', [
          s.id,
          new Date(this.core.now()),
        ]);
      return s;
    });
  }
  async logout(a: Actor) {
    await this.core.db.tx(async (q) => {
      await q.query("UPDATE team_sessions SET status='REVOKED' WHERE id=$1", [a.id]);
      await this.core.audit(q, a, 'LOGOUT', a.id);
      await this.core.event(q, 'session:' + a.id, 'session:revoked', {});
      if (a.team_id)
        await this.core.event(q, 'team:' + a.team_id, 'team:session_left', { role: a.role });
    });
  }
}
