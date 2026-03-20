import {
  pgTable,
  uuid,
  integer,
  varchar,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operatorId: integer('operator_id').notNull(), // FK: operators(id) - enforced via migration
    flagName: varchar('flag_name', { length: 50 }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    config: jsonb('config').notNull().default({}),
    description: varchar('description', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_feature_flags_operator_flag').on(table.operatorId, table.flagName),
    index('idx_feature_flags_operator').on(table.operatorId),
  ],
);
