import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

const { Pool } = pg;

let _pool: pg.Pool | undefined;
let _db: NodePgDatabase<typeof schema> | undefined;

function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/fsp_scheduler',
    });
  }
  return _pool;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = drizzle(getPool(), { schema });
    }
    return Reflect.get(_db, prop, receiver);
  },
});

export type Database = NodePgDatabase<typeof schema>;
