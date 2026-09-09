import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
await mkdir('.data', { recursive: true });
if (!existsSync('.env')) {
  const template = await readFile('.env.example', 'utf8');
  await writeFile(
    '.env',
    template.replace('SESSION_SECRET=', 'SESSION_SECRET=' + randomBytes(48).toString('hex')),
    { mode: 0o600 },
  );
}
const dotenv = await import('dotenv');
dotenv.config({ quiet: true });
await import('../backend/src/config.js');
await import('./migrate.js');
if (process.env.NODE_ENV !== 'production') {
  const { Database } = await import('../backend/src/db.js'),
    { seed } = await import('./seed.js'),
    { defaults } = await import('../backend/src/defaults.js'),
    { default: bcrypt } = await import('bcryptjs');
  const db = new Database();
  try {
    const existing = await db.query("SELECT 1 FROM teams WHERE id='TEAM-001'");
    if (!existing.length) {
      const password = process.env.DEMO_PASSWORD || randomBytes(18).toString('base64url');
      await seed(db, password);
      await db.query('UPDATE competition_settings SET value=$1 WHERE id=1', [
        JSON.stringify({ ...defaults, state: 'RUNNING' }),
      ]);
      const { demoMatch } = await import('./demo-match.js');
      await demoMatch(db, password, process.env.SESSION_SECRET!);
      await writeFile(
        'demo-credentials.txt',
        'DEVELOPMENT DATA ONLY\nTeam IDs: TEAM-001 through TEAM-010\nTeam password: ' +
          password +
          '\n\n',
        { mode: 0o600 },
      );
    }
    if (!(await db.query('SELECT 1 FROM admin_users LIMIT 1')).length) {
      const password = randomBytes(24).toString('base64url');
      await db.query(
        "INSERT INTO admin_users(id,username,password_hash) VALUES($1,'event-admin',$2)",
        [randomUUID(), await bcrypt.hash(password, 12)],
      );
      await writeFile(
        '.data/admin-credentials.txt',
        'LOCAL DEVELOPMENT ADMIN\nUsername: event-admin\nPassword: ' + password + '\n',
        { mode: 0o600 },
      );
    }
    console.log(
      'Demo data ready. Team credentials: demo-credentials.txt. Admin credentials: .data/admin-credentials.txt.',
    );
  } finally {
    await db.close();
  }
}
console.log('Setup complete. Run npm run dev, or npm run build followed by npm run local.');
