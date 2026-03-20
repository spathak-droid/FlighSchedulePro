import { Injectable, Logger } from '@nestjs/common';
import { FeatureFlagService } from '../feature-flags/feature-flag.service.js';
import { SuggestionsService } from './suggestions.service.js';
import { AuditService } from '../activity/audit.service.js';
import { db } from '../../../db/index.js';
import { suggestions } from '../../../db/schema/index.js';
import { eq, and } from 'drizzle-orm';

export interface AutoApproveResult {
  autoApproved: boolean;
  reason: string;
}

@Injectable()
export class AutoApproveService {
  private readonly logger = new Logger(AutoApproveService.name);

  constructor(
    private readonly featureFlagService: FeatureFlagService,
    private readonly suggestionsService: SuggestionsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Check if a suggestion qualifies for automatic approval and approve it if so.
   *
   * Safety conditions (ALL must be met):
   * 1. `auto_approve` feature flag is enabled for the operator
   * 2. Suggestion status is `pending`
   * 3. Suggestion rationale has `aiEnriched === true`
   * 4. Suggestion rationale has a `riskLevel` that meets the threshold
   *
   * The risk threshold is configurable via the flag config:
   * - { riskThreshold: 'low' } — only auto-approve low-risk (default)
   * - { riskThreshold: 'medium' } — auto-approve low and medium risk
   */
  async checkAndAutoApprove(operatorId: number, suggestionId: string): Promise<AutoApproveResult> {
    // 1. Check if auto_approve flag is enabled
    const isEnabled = await this.featureFlagService.isEnabled(operatorId, 'auto_approve');
    if (!isEnabled) {
      return { autoApproved: false, reason: 'auto_approve flag is not enabled' };
    }

    // 2. Load the suggestion
    const [suggestion] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.id, suggestionId), eq(suggestions.operatorId, operatorId)))
      .limit(1);

    if (!suggestion) {
      return { autoApproved: false, reason: 'suggestion not found' };
    }

    if (suggestion.status !== 'pending') {
      return {
        autoApproved: false,
        reason: `suggestion status is '${suggestion.status}', not 'pending'`,
      };
    }

    // 3. Check AI enrichment
    const rationale = suggestion.rationale as Record<string, unknown> | null;
    if (!rationale || rationale.aiEnriched !== true) {
      return { autoApproved: false, reason: 'suggestion has not been AI-enriched' };
    }

    // 4. Check risk level against threshold
    const riskLevel = rationale.riskLevel as string | undefined;
    if (!riskLevel) {
      return { autoApproved: false, reason: 'suggestion has no risk level' };
    }

    const flagConfig = await this.featureFlagService.getConfig(operatorId, 'auto_approve');
    const riskThreshold = (flagConfig.riskThreshold as string) ?? 'low';

    const allowedRiskLevels: string[] = riskThreshold === 'medium' ? ['low', 'medium'] : ['low'];

    if (!allowedRiskLevels.includes(riskLevel)) {
      return {
        autoApproved: false,
        reason: `risk level '${riskLevel}' does not meet threshold '${riskThreshold}'`,
      };
    }

    // All conditions met — auto-approve
    try {
      // Use empty FSP token — mock mode doesn't need a real token
      const fspToken = '';

      await this.suggestionsService.approve(operatorId, suggestionId, 'system-auto', fspToken);

      // Create specific audit event for auto-approval
      await this.auditService.create({
        operatorId,
        eventType: 'suggestion_auto_approved',
        entityType: 'suggestion',
        entityId: suggestionId,
        actorId: 'system-auto',
        data: {
          riskLevel,
          riskThreshold,
          aiEnriched: true,
          autoApproveReason: `Risk level '${riskLevel}' meets threshold '${riskThreshold}'`,
        },
      });

      this.logger.log(
        `Auto-approved suggestion ${suggestionId} for operator ${operatorId} (risk: ${riskLevel}, threshold: ${riskThreshold})`,
      );

      return {
        autoApproved: true,
        reason: `Auto-approved: risk level '${riskLevel}' meets threshold '${riskThreshold}'`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Auto-approve failed for suggestion ${suggestionId}: ${errorMsg}`);
      return {
        autoApproved: false,
        reason: `auto-approve failed: ${errorMsg}`,
      };
    }
  }
}
