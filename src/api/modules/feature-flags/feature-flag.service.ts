import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../../db/index.js';
import { featureFlags } from '../../../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

/**
 * Default feature flags provisioned for every new operator.
 * Flags that are `enabled: false` represent opt-in autonomous features.
 */
const DEFAULT_FLAGS: Array<{
  flagName: string;
  enabled: boolean;
  config: Record<string, unknown>;
  description: string;
}> = [
  {
    flagName: 'ai_rationale',
    enabled: true,
    config: {},
    description: 'AI-generated rationale on suggestions',
  },
  {
    flagName: 'risk_assessment',
    enabled: true,
    config: {},
    description: 'Risk level classification on suggestions',
  },
  {
    flagName: 'auto_approve',
    enabled: true,
    config: { riskThreshold: 'low' },
    description: 'Autonomous approval of low-risk suggestions',
  },
  {
    flagName: 'disruption_detection',
    enabled: true,
    config: {},
    description: 'Weather/maintenance disruption alerts',
  },
  {
    flagName: 'weather_integration',
    enabled: true,
    config: {},
    description: 'Live weather data integration',
  },
  {
    flagName: 'student_insights',
    enabled: true,
    config: {},
    description: 'Inactive/checkride/at-risk student detection',
  },
  {
    flagName: 'fleet_optimization',
    enabled: false,
    config: {},
    description: 'Fleet utilization analysis',
  },
];

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);

  /**
   * Check if a feature flag is enabled for the given operator.
   * Returns false if the flag does not exist.
   */
  async isEnabled(operatorId: number, flagName: string): Promise<boolean> {
    const [flag] = await db
      .select({ enabled: featureFlags.enabled })
      .from(featureFlags)
      .where(and(eq(featureFlags.operatorId, operatorId), eq(featureFlags.flagName, flagName)))
      .limit(1);

    return flag?.enabled ?? false;
  }

  /**
   * Get the config JSONB for a specific flag.
   * Returns an empty object if the flag does not exist.
   */
  async getConfig(operatorId: number, flagName: string): Promise<Record<string, unknown>> {
    const [flag] = await db
      .select({ config: featureFlags.config })
      .from(featureFlags)
      .where(and(eq(featureFlags.operatorId, operatorId), eq(featureFlags.flagName, flagName)))
      .limit(1);

    return (flag?.config as Record<string, unknown>) ?? {};
  }

  /**
   * List all feature flags for an operator.
   */
  async listFlags(operatorId: number) {
    return db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.operatorId, operatorId))
      .orderBy(featureFlags.flagName);
  }

  /**
   * Upsert a feature flag for an operator.
   * Creates the flag if it doesn't exist, updates it otherwise.
   */
  async setFlag(
    operatorId: number,
    flagName: string,
    enabled: boolean,
    config?: Record<string, unknown>,
  ) {
    const now = new Date();

    // Check if flag exists
    const [existing] = await db
      .select({ id: featureFlags.id })
      .from(featureFlags)
      .where(and(eq(featureFlags.operatorId, operatorId), eq(featureFlags.flagName, flagName)))
      .limit(1);

    if (existing) {
      // Update existing flag
      const updateData: Record<string, unknown> = {
        enabled,
        updatedAt: now,
      };
      if (config !== undefined) {
        updateData.config = config;
      }

      const [updated] = await db
        .update(featureFlags)
        .set(updateData)
        .where(and(eq(featureFlags.operatorId, operatorId), eq(featureFlags.flagName, flagName)))
        .returning();

      this.logger.log(
        `Feature flag '${flagName}' for operator ${operatorId} updated: enabled=${enabled}`,
      );

      return updated;
    }

    // Insert new flag
    const [created] = await db
      .insert(featureFlags)
      .values({
        operatorId,
        flagName,
        enabled,
        config: config ?? {},
        updatedAt: now,
      })
      .returning();

    this.logger.log(
      `Feature flag '${flagName}' for operator ${operatorId} created: enabled=${enabled}`,
    );

    return created;
  }

  /**
   * Seed default feature flags for a new operator.
   * Skips flags that already exist (idempotent).
   */
  async seedDefaultFlags(operatorId: number): Promise<void> {
    const existing = await this.listFlags(operatorId);
    const existingNames = new Set(existing.map((f) => f.flagName));

    const toInsert = DEFAULT_FLAGS.filter((f) => !existingNames.has(f.flagName));

    if (toInsert.length > 0) {
      await db.insert(featureFlags).values(
        toInsert.map((f) => ({
          operatorId,
          flagName: f.flagName,
          enabled: f.enabled,
          config: f.config,
          description: f.description,
        })),
      );
      this.logger.log(`Seeded ${toInsert.length} default feature flags for operator ${operatorId}`);
    }

    // Ensure auto_approve is enabled for demo (update if it was seeded as false previously)
    if (process.env.FSP_MOCK_MODE === 'true') {
      const autoApproveFlag = existing.find((f) => f.flagName === 'auto_approve');
      if (autoApproveFlag && !autoApproveFlag.enabled) {
        await db
          .update(featureFlags)
          .set({ enabled: true, updatedAt: new Date() })
          .where(
            and(
              eq(featureFlags.operatorId, operatorId),
              eq(featureFlags.flagName, 'auto_approve'),
            ),
          );
        this.logger.log(`Enabled auto_approve flag for operator ${operatorId} (mock mode)`);
      }
    }
  }
}
