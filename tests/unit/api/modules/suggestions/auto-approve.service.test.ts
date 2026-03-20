import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database module BEFORE importing the service
// ---------------------------------------------------------------------------

vi.mock('../../../../../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../../../src/db/schema/index.js', () => ({
  suggestions: {
    id: 'id',
    operatorId: 'operatorId',
    status: 'status',
    rationale: 'rationale',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ type: 'eq', val })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { db } from '../../../../../src/db/index.js';
import { AutoApproveService } from '../../../../../src/api/modules/suggestions/auto-approve.service.js';
import type { FeatureFlagService } from '../../../../../src/api/modules/feature-flags/feature-flag.service.js';
import type { SuggestionsService } from '../../../../../src/api/modules/suggestions/suggestions.service.js';
import type { AuditService } from '../../../../../src/api/modules/activity/audit.service.js';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createMockFeatureFlagService(): FeatureFlagService {
  return {
    isEnabled: vi.fn().mockResolvedValue(true),
    getConfig: vi.fn().mockResolvedValue({ riskThreshold: 'low' }),
    listFlags: vi.fn().mockResolvedValue([]),
    setFlag: vi.fn().mockResolvedValue({}),
    seedDefaultFlags: vi.fn().mockResolvedValue(undefined),
  } as unknown as FeatureFlagService;
}

function createMockSuggestionsService(): SuggestionsService {
  return {
    approve: vi.fn().mockResolvedValue({}),
  } as unknown as SuggestionsService;
}

function createMockAuditService(): AuditService {
  return {
    create: vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;
}

function createPendingSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sug-1',
    operatorId: 1,
    status: 'pending',
    rationale: { aiEnriched: true, riskLevel: 'low' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoApproveService', () => {
  let service: AutoApproveService;
  let featureFlagService: FeatureFlagService;
  let suggestionsService: SuggestionsService;
  let auditService: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();

    featureFlagService = createMockFeatureFlagService();
    suggestionsService = createMockSuggestionsService();
    auditService = createMockAuditService();

    service = new AutoApproveService(
      featureFlagService,
      suggestionsService,
      auditService,
    );
  });

  // ── Feature flag check ────────────────────────────────────────────────

  it('rejects when auto_approve flag is not enabled', async () => {
    vi.mocked(featureFlagService.isEnabled).mockResolvedValue(false);

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain('auto_approve flag is not enabled');
    expect(suggestionsService.approve).not.toHaveBeenCalled();
  });

  // ── Suggestion not found ──────────────────────────────────────────────

  it('rejects when suggestion is not found', async () => {
    // DB returns empty array (no suggestion found)
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([]);

    const result = await service.checkAndAutoApprove(1, 'nonexistent');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain('suggestion not found');
  });

  // ── Status check ──────────────────────────────────────────────────────

  it('rejects when suggestion status is not pending', async () => {
    const suggestion = createPendingSuggestion({ status: 'approved' });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("'approved'");
    expect(result.reason).toContain('not \'pending\'');
  });

  it('rejects when suggestion status is expired', async () => {
    const suggestion = createPendingSuggestion({ status: 'expired' });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('rejects when suggestion status is declined', async () => {
    const suggestion = createPendingSuggestion({ status: 'declined' });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain('declined');
  });

  // ── AI enrichment check ───────────────────────────────────────────────

  it('rejects when suggestion has not been AI-enriched', async () => {
    const suggestion = createPendingSuggestion({
      rationale: { aiEnriched: false, riskLevel: 'low' },
    });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain('not been AI-enriched');
  });

  it('rejects when rationale is null', async () => {
    const suggestion = createPendingSuggestion({ rationale: null });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain('not been AI-enriched');
  });

  // ── Risk level check ──────────────────────────────────────────────────

  it('rejects when suggestion has no risk level', async () => {
    const suggestion = createPendingSuggestion({
      rationale: { aiEnriched: true },
    });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain('no risk level');
  });

  it('rejects high-risk suggestion when threshold is low', async () => {
    const suggestion = createPendingSuggestion({
      rationale: { aiEnriched: true, riskLevel: 'high' },
    });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);
    vi.mocked(featureFlagService.getConfig).mockResolvedValue({ riskThreshold: 'low' });

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("'high'");
    expect(result.reason).toContain("'low'");
  });

  it('rejects medium-risk suggestion when threshold is low', async () => {
    const suggestion = createPendingSuggestion({
      rationale: { aiEnriched: true, riskLevel: 'medium' },
    });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);
    vi.mocked(featureFlagService.getConfig).mockResolvedValue({ riskThreshold: 'low' });

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("'medium'");
  });

  it('rejects high-risk suggestion when threshold is medium', async () => {
    const suggestion = createPendingSuggestion({
      rationale: { aiEnriched: true, riskLevel: 'high' },
    });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);
    vi.mocked(featureFlagService.getConfig).mockResolvedValue({ riskThreshold: 'medium' });

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("'high'");
  });

  // ── Successful auto-approval ──────────────────────────────────────────

  it('auto-approves a low-risk, AI-enriched, pending suggestion', async () => {
    const suggestion = createPendingSuggestion();
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(true);
    expect(result.reason).toContain('Auto-approved');
    expect(result.reason).toContain("'low'");

    // Verify approve was called
    expect(suggestionsService.approve).toHaveBeenCalledWith(1, 'sug-1', 'system-auto', '');

    // Verify audit event was created
    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 1,
        eventType: 'suggestion_auto_approved',
        entityType: 'suggestion',
        entityId: 'sug-1',
        actorId: 'system-auto',
      }),
    );
  });

  it('auto-approves medium-risk suggestion when threshold is medium', async () => {
    const suggestion = createPendingSuggestion({
      rationale: { aiEnriched: true, riskLevel: 'medium' },
    });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);
    vi.mocked(featureFlagService.getConfig).mockResolvedValue({ riskThreshold: 'medium' });

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(true);
    expect(result.reason).toContain("'medium'");
  });

  it('auto-approves low-risk suggestion when threshold is medium', async () => {
    const suggestion = createPendingSuggestion({
      rationale: { aiEnriched: true, riskLevel: 'low' },
    });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);
    vi.mocked(featureFlagService.getConfig).mockResolvedValue({ riskThreshold: 'medium' });

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(true);
  });

  // ── Approve failure ───────────────────────────────────────────────────

  it('returns failure when approve call throws', async () => {
    const suggestion = createPendingSuggestion();
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);
    vi.mocked(suggestionsService.approve).mockRejectedValue(new Error('FSP API error'));

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain('auto-approve failed');
    expect(result.reason).toContain('FSP API error');
  });

  // ── Default risk threshold ────────────────────────────────────────────

  it('defaults to low risk threshold when config has no riskThreshold', async () => {
    const suggestion = createPendingSuggestion({
      rationale: { aiEnriched: true, riskLevel: 'medium' },
    });
    vi.mocked(db.select().from('').where('').limit as any).mockResolvedValue([suggestion]);
    vi.mocked(featureFlagService.getConfig).mockResolvedValue({});

    const result = await service.checkAndAutoApprove(1, 'sug-1');

    // Medium risk should NOT pass with default 'low' threshold
    expect(result.autoApproved).toBe(false);
    expect(result.reason).toContain("'medium'");
  });
});
