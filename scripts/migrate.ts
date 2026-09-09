import 'dotenv/config';
import { Database } from '../backend/src/db.js';
import { defaults } from '../backend/src/defaults.js';
const db = new Database();
await db.migrate();
await db.query(
  'INSERT INTO competition_settings(id,value) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',
  [JSON.stringify(defaults)],
);
await db.close();
console.log('Database migrations applied.');
