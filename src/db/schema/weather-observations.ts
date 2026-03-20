import { pgTable, uuid, varchar, integer, decimal, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const weatherObservations = pgTable('weather_observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: varchar('location_id', { length: 50 }).notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 6 }).notNull(),
  longitude: decimal('longitude', { precision: 10, scale: 6 }).notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  temperature: decimal('temperature', { precision: 6, scale: 2 }),
  windSpeed: decimal('wind_speed', { precision: 6, scale: 2 }),
  windGust: decimal('wind_gust', { precision: 6, scale: 2 }),
  windDirection: integer('wind_direction'),
  visibility: decimal('visibility', { precision: 8, scale: 2 }), // statute miles
  cloudCover: integer('cloud_cover'), // percentage 0-100
  weatherCode: integer('weather_code'),
  flightCategory: varchar('flight_category', { length: 10 }), // VFR, MVFR, IFR, LIFR
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_weather_observations_location_time').on(table.locationId, table.observedAt),
]);
