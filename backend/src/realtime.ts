import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { parse } from 'cookie';
import type { AuthService } from './services/auth.js';
import type { ChessService } from './services/chess.js';
import type { Core } from './services/core.js';
export function realtime(
  server: HttpServer,
  core: Core,
  auth: AuthService,
  chess: ChessService,
  origin: string,
) {
  const io = new Server(server, {
    cors: { origin, credentials: true },
    maxHttpBufferSize: 16384,
    allowRequest: (req, done) =>
      done(
        null,
        req.headers.origin
          ? req.headers.origin === origin
          : req.headers['sec-fetch-site'] === 'same-origin' &&
              req.headers.host === new URL(origin).host,
      ),
  });
  io.use(async (socket, next) => {
    try {
      const a = await auth.session(parse(socket.handshake.headers.cookie ?? '').cm_session, true);
      socket.data.actor = a;
      next();
    } catch {
      next(new Error('Your session has expired. Please log in again.'));
    }
  });
  io.on('connection', (socket) => {
    const a = socket.data.actor;
    socket.join('leaderboard:' + a.role);
    socket.join('session:' + a.id);
    if (a.team_id) socket.join('team:' + a.team_id);
    if (a.role === 'CHESS') socket.join('chess-team:' + a.team_id);
    if (a.role === 'ADMIN') socket.join('admin');
    let requests = 0;
    const rateTimer = setInterval(() => (requests = 0), 1000);
    socket.on('chess:move_requested', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (++requests > 5) return ack({ error: 'Too many move requests.' });
      try {
        await auth.session(parse(socket.handshake.headers.cookie ?? '').cm_session, true);
        ack(await chess.move(a, payload.matchId, payload));
      } catch (e: any) {
        ack({ error: e.message });
      }
    });
    socket.on('chess:reconnect', async (id, ack) => {
      if (typeof ack !== 'function') return;
      try {
        await auth.session(parse(socket.handshake.headers.cookie ?? '').cm_session, true);
        ack(await chess.get(a, id));
      } catch (e: any) {
        ack({ error: e.message });
      }
    });
    const heartbeat = setInterval(async () => {
      try {
        await auth.session(parse(socket.handshake.headers.cookie ?? '').cm_session, true);
      } catch {
        socket.emit('session:revoked', {});
        socket.disconnect(true);
      }
    }, 25000);
    socket.on('disconnect', () => {
      clearInterval(heartbeat);
      clearInterval(rateTimer);
    });
  });
  let busy = false;
  const deliver = async () => {
    if (busy) return;
    busy = true;
    try {
      const rows = await core.db.query(
        'SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY sequence LIMIT 200',
      );
      for (const row of rows) {
        io.to(row.room).emit(row.event, { ...row.payload, eventId: row.id });
        if (row.event === 'session:revoked') io.in(row.room).disconnectSockets(true);
        await core.db.query('UPDATE outbox SET sent_at=now() WHERE id=$1', [row.id]);
      }
    } catch (e) {
      console.error('Outbox delivery deferred:', e);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(deliver, 100);
  return {
    io,
    deliver,
    stop: async () => {
      clearInterval(timer);
      while (busy) await new Promise((r) => setTimeout(r, 10));
      await new Promise<void>((r) => io.close(() => r()));
    },
  };
}
