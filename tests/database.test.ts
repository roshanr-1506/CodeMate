import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../backend/src/db.js';
import { defaults } from '../backend/src/defaults.js';
test('PostgreSQL migration is repeatable and constraints exist', async () => {
  const db = new Database('', true);
  try {
    await db.migrate();
    await db.migrate();
    await db.query('INSERT INTO competition_settings(id,value) VALUES(1,$1)', [
      JSON.stringify(defaults),
    ]);
    assert.equal(
      (await db.query('SELECT count(*)::int AS count FROM schema_migrations'))[0].count,
      2,
    );
    assert.equal(
      (await db.query("SELECT value->>'state' AS state FROM competition_settings"))[0].state,
      'WAITING',
    );
  } finally {
    await db.close();
  }
});
