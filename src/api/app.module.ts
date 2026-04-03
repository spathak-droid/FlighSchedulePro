import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { FspModule } from './fsp/fsp.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PoliciesModule } from './modules/policies/policies.module.js';
import { ActivityModule } from './modules/activity/activity.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SuggestionsModule } from './modules/suggestions/suggestions.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { DiscoveryModule } from './modules/discovery/discovery.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ResourceLookupModule } from './modules/resources/resource-lookup.module.js';
import { WeatherModule } from './modules/weather/weather.module.js';
import { InsightsModule } from './modules/insights/insights.module.js';
import { DisruptionsModule } from './modules/disruptions/disruptions.module.js';
import { SolverModule } from './modules/solver/solver.module.js';
import { FlightAlertsModule } from './modules/alerts/flight-alerts.module.js';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module.js';
import { SimulationModule } from './modules/simulation/simulation.module.js';
import { AskModule } from './modules/ask/ask.module.js';
import { DirectoryModule } from './modules/directory/directory.module.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { TenantGuard } from './common/guards/tenant.guard.js';
import { RateLimitGuard } from './common/guards/rate-limit.guard.js';
import { AuditInterceptor } from './common/interceptors/audit.interceptor.js';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware.js';
import { StructuredLoggerService } from './common/services/logger.service.js';
import { MockSuggestionsSeeder } from './fsp/mock/mock-suggestions-seeder.js';

@Module({
  imports: [
    // ── Configuration ─────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // ── Background jobs (BullMQ + Redis) ──────────────────────────────
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
          maxRetriesPerRequest: null,
        },
      }),
    }),

    // ── Feature modules ───────────────────────────────────────────────
    FspModule,
    AuthModule,
    PoliciesModule,
    ActivityModule,
    HealthModule,
    SuggestionsModule,
    DashboardModule,
    DiscoveryModule,
    NotificationsModule,
    ResourceLookupModule,
    WeatherModule,
    InsightsModule,
    DisruptionsModule,
    SolverModule,
    FlightAlertsModule,
    FeatureFlagsModule,
    SimulationModule,
    AskModule,
    DirectoryModule,
  ],
  providers: [
    // Global exception filter — catches all unhandled exceptions
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global RateLimitGuard — applies rate limiting to all routes (runs before auth)
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    // Global AuthGuard — applied to all routes; use @Public() to skip
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    // Global TenantGuard — sets RLS context after auth; skips @Public() routes
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    // Global RequestLoggingInterceptor — structured logs + metrics for every request
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    // Global AuditInterceptor — logs all mutation requests to audit_events
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    // Mock suggestions seeder — only active when FSP_MOCK_MODE=true
    // Implements OnModuleInit and no-ops when mock mode is off
    MockSuggestionsSeeder,
    // Structured logger service — available for injection across the app
    StructuredLoggerService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply CorrelationIdMiddleware to all routes.
    // This runs before guards and interceptors, so correlationId is available
    // in AsyncLocalStorage for the entire request lifecycle.
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
