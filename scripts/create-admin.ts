import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { randomUUID, randomBytes } from 'node:crypto';
import { Database } from '../backend/src/db.js';
import { writeFile } from 'node:fs/promises';
const prompt = createInterface({ input: stdin, output: stdout });
const username = process.env.ADMIN_USERNAME || (await prompt.question('Admin username: '));
const generated = !process.env.ADMIN_PASSWORD;
const password = process.env.ADMIN_PASSWORD || randomBytes(24).toString('base64url');
prompt.close();
if (!/^[A-Za-z0-9_-]{3,80}$/.test(username) || password.length < 16)
  throw new Error('Use a 3–80 character username and an admin password of at least 16 characters.');
const db = new Database();
try {
  await db.migrate();
  await db.tx(async (q) => {
    await q.query('INSERT INTO admin_users(id,username,password_hash) VALUES($1,$2,$3)', [
      randomUUID(),
      username,
      await bcrypt.hash(password, 12),
    ]);
    await q.query('INSERT INTO audit_logs(id,action,metadata) VALUES($1,$2,$3)', [
      randomUUID(),
      'ADMIN_CREATED',
      JSON.stringify({ username }),
    ]);
  });
  if (generated) {
    await writeFile(
      '.data/admin-credentials.txt',
      'Admin username: ' + username + '\nPassword: ' + password + '\nKeep this file private.\n',
      { mode: 0o600 },
    );
    console.log('Administrator created. Generated credentials: .data/admin-credentials.txt');
  } else console.log('Administrator created.');
} finally {
  await db.close();
}
