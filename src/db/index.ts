import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { Logger } from '@nestjs/common';
import * as schema from './schema/index.js';

const { Pool } = pg;

const dbLogger = new Logger('DbPool');

let _pool: pg.Pool | undefined;
let _db: NodePgDatabase<typeof schema> | undefined;

function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/fsp_scheduler',
      // Connection pool robustness settings
      max: Number(process.env.DB_POOL_MAX ?? 20),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    // Handle pool-level errors so they don't crash the process as unhandled exceptions
    _pool.on('error', (err: Error) => {
      dbLogger.error(`Unexpected error on idle client: ${err.message}`);
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

/**
 * Gracefully close the database connection pool.
 * Should be called during application shutdown.
 */
export async function closeDbPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
    _db = undefined;
  }
}

export type Database = NodePgDatabase<typeof schema>;
