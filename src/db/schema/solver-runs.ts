import { pgTable, uuid, integer, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const solverRuns = pgTable('solver_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorId: integer('operator_id').notNull(),
  runType: varchar('run_type', { length: 30 }).notNull(), // 'find_time', 'optimize', 'bulk_schedule'
  inputParams: jsonb('input_params').notNull(),
  resultCount: integer('result_count').notNull().default(0),
  duration: integer('duration').notNull().default(0), // milliseconds
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_solver_runs_operator_created').on(table.operatorId, table.createdAt),
]);
