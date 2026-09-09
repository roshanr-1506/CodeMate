import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export type Query = { query: <T = any>(sql: string, params?: any[]) => Promise<T[]> };
export class Database implements Query {
  private embedded?: PGlite;
  private pool?: pg.Pool;
  private tail: Promise<any> = Promise.resolve();
  constructor(url = process.env.DATABASE_URL ?? '', memory = false) {
    if (url)
      this.pool = new pg.Pool({
        connectionString: url,
        max: 20,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
      });
    else this.embedded = new PGlite(memory ? undefined : resolve('.data/postgres'));
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    return result;
  }
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (this.pool) return (await this.pool.query(sql, params)).rows;
    return this.serial(async () => (await this.embedded!.query<T>(sql, params)).rows);
  }
  async tx<T>(fn: (q: Query) => Promise<T>): Promise<T> {
    if (this.pool) {
      const c = await this.pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(20402026)');
        const value = await fn({ query: async (sql, p = []) => (await c.query(sql, p)).rows });
        await c.query('COMMIT');
        return value;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    }
    return this.serial(() =>
      this.embedded!.transaction(async (t) =>
        fn({
          query: async <T = any>(sql: string, p: any[] = []) => (await t.query<T>(sql, p)).rows,
        }),
      ),
    );
  }
  async migrate() {
    await mkdir('.data', { recursive: true });
    await this.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of (await readdir(resolve('database/migrations')))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      await this.tx(async (q) => {
        if ((await q.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).length) return;
        const sql = await readFile(resolve('database/migrations', name), 'utf8');
        for (const statement of sql.split('-- statement-break'))
          if (statement.trim()) await q.query(statement);
        await q.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      });
    }
  }
  async close() {
    if (this.pool) await this.pool.end();
    if (this.embedded) await this.embedded.close();
  }
}
