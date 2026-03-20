import { describe, it, expect } from 'vitest';
import {
  rankWaitlistCandidates,
  DEFAULT_RANKING_WEIGHTS,
} from '../../../../src/core/ranking/waitlist-ranker.js';
import type { RankingInput, RankingWeights } from '../../../../src/core/ranking/waitlist-ranker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<RankingInput> & { studentId: string }): RankingInput {
  return {
    timeSinceLastFlight: 48,
    timeUntilNextFlight: 72,
    totalHours: 50,
    customFactors: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rankWaitlistCandidates', () => {
  // ── Empty / single candidate ──────────────────────────────────────────

  it('returns an empty array when there are no candidates', () => {
    const result = rankWaitlistCandidates([], DEFAULT_RANKING_WEIGHTS);
    expect(result).toEqual([]);
  });

  it('returns a single candidate with neutral (0.5) normalization', () => {
    const candidate = makeCandidate({ studentId: 'solo' });
    const result = rankWaitlistCandidates([candidate], DEFAULT_RANKING_WEIGHTS);

    expect(result).toHaveLength(1);
    expect(result[0]!.studentId).toBe('solo');
    // With default weights (0.3 + 0.2 + 0.2) each multiplied by 0.5
    // score = 0.3*0.5 + 0.2*0.5 + 0.2*0.5 = 0.35
    expect(result[0]!.score).toBeCloseTo(0.35, 5);
    expect(result[0]!.breakdown).toHaveProperty('timeSinceLastFlight');
    expect(result[0]!.breakdown).toHaveProperty('timeUntilNextFlight');
    expect(result[0]!.breakdown).toHaveProperty('totalHours');
  });

  // ── Basic ranking with two candidates ─────────────────────────────────

  it('ranks the candidate with longest wait higher (timeSinceLastFlight)', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'recent', timeSinceLastFlight: 10 }),
      makeCandidate({ studentId: 'waiting', timeSinceLastFlight: 100 }),
    ];

    const result = rankWaitlistCandidates(candidates, {
      timeSinceLastFlight: 1.0,
      timeUntilNextFlight: 0,
      totalHours: 0,
      custom: {},
    });

    expect(result[0]!.studentId).toBe('waiting');
    expect(result[1]!.studentId).toBe('recent');
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  it('ranks candidates with no upcoming flight higher (timeUntilNextFlight null)', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'has-flight', timeUntilNextFlight: 24 }),
      makeCandidate({ studentId: 'no-flight', timeUntilNextFlight: null }),
    ];

    const result = rankWaitlistCandidates(candidates, {
      timeSinceLastFlight: 0,
      timeUntilNextFlight: 1.0,
      totalHours: 0,
      custom: {},
    });

    expect(result[0]!.studentId).toBe('no-flight');
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  it('ranks newer students (fewer hours) higher for totalHours factor', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'experienced', totalHours: 200 }),
      makeCandidate({ studentId: 'beginner', totalHours: 10 }),
    ];

    const result = rankWaitlistCandidates(candidates, {
      timeSinceLastFlight: 0,
      timeUntilNextFlight: 0,
      totalHours: 1.0,
      custom: {},
    });

    expect(result[0]!.studentId).toBe('beginner');
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  // ── Default weights ───────────────────────────────────────────────────

  it('default weights produce expected structure', () => {
    expect(DEFAULT_RANKING_WEIGHTS).toEqual({
      timeSinceLastFlight: 0.3,
      timeUntilNextFlight: 0.2,
      totalHours: 0.2,
      custom: {},
    });
  });

  // ── Normalization edge cases ──────────────────────────────────────────

  it('handles all candidates with identical values (min === max)', () => {
    const candidates: RankingInput[] = [
      makeCandidate({
        studentId: 'a',
        timeSinceLastFlight: 50,
        totalHours: 100,
        timeUntilNextFlight: 48,
      }),
      makeCandidate({
        studentId: 'b',
        timeSinceLastFlight: 50,
        totalHours: 100,
        timeUntilNextFlight: 48,
      }),
    ];

    const result = rankWaitlistCandidates(candidates, DEFAULT_RANKING_WEIGHTS);

    expect(result).toHaveLength(2);
    // All candidates should have equal scores when all values are identical
    expect(result[0]!.score).toBeCloseTo(result[1]!.score, 5);
    // Each normalized value should be 0.5 (neutral) when min === max
    expect(result[0]!.breakdown['timeSinceLastFlight']).toBeCloseTo(0.3 * 0.5, 5);
  });

  it('handles all timeUntilNextFlight being null', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'a', timeUntilNextFlight: null }),
      makeCandidate({ studentId: 'b', timeUntilNextFlight: null }),
    ];

    const result = rankWaitlistCandidates(candidates, DEFAULT_RANKING_WEIGHTS);

    // Both should get score 1.0 for this factor (null = max priority)
    expect(result[0]!.breakdown['timeUntilNextFlight']).toBeCloseTo(0.2 * 1.0, 5);
    expect(result[1]!.breakdown['timeUntilNextFlight']).toBeCloseTo(0.2 * 1.0, 5);
  });

  // ── Zero weights ──────────────────────────────────────────────────────

  it('produces zero scores when all weights are zero', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'a' }),
      makeCandidate({ studentId: 'b' }),
    ];

    const zeroWeights: RankingWeights = {
      timeSinceLastFlight: 0,
      timeUntilNextFlight: 0,
      totalHours: 0,
      custom: {},
    };

    const result = rankWaitlistCandidates(candidates, zeroWeights);
    for (const r of result) {
      expect(r.score).toBe(0);
    }
  });

  // ── Custom factors ────────────────────────────────────────────────────

  it('ranks by custom factors when configured', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'low-priority', customFactors: { urgency: 1 } }),
      makeCandidate({ studentId: 'high-priority', customFactors: { urgency: 10 } }),
    ];

    const weights: RankingWeights = {
      timeSinceLastFlight: 0,
      timeUntilNextFlight: 0,
      totalHours: 0,
      custom: { urgency: 1.0 },
    };

    const result = rankWaitlistCandidates(candidates, weights);

    expect(result[0]!.studentId).toBe('high-priority');
    expect(result[0]!.breakdown).toHaveProperty('custom_urgency');
    expect(result[0]!.breakdown['custom_urgency']).toBeGreaterThan(
      result[1]!.breakdown['custom_urgency']!,
    );
  });

  it('handles missing custom factor on a candidate (defaults to 0)', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'has-factor', customFactors: { urgency: 5 } }),
      makeCandidate({ studentId: 'no-factor', customFactors: {} }),
    ];

    const weights: RankingWeights = {
      timeSinceLastFlight: 0,
      timeUntilNextFlight: 0,
      totalHours: 0,
      custom: { urgency: 1.0 },
    };

    const result = rankWaitlistCandidates(candidates, weights);

    expect(result[0]!.studentId).toBe('has-factor');
  });

  // ── Tied scores ───────────────────────────────────────────────────────

  it('returns all candidates even when scores are tied', () => {
    const candidates: RankingInput[] = [
      makeCandidate({
        studentId: 'a',
        timeSinceLastFlight: 50,
        totalHours: 100,
        timeUntilNextFlight: 24,
      }),
      makeCandidate({
        studentId: 'b',
        timeSinceLastFlight: 50,
        totalHours: 100,
        timeUntilNextFlight: 24,
      }),
      makeCandidate({
        studentId: 'c',
        timeSinceLastFlight: 50,
        totalHours: 100,
        timeUntilNextFlight: 24,
      }),
    ];

    const result = rankWaitlistCandidates(candidates, DEFAULT_RANKING_WEIGHTS);

    expect(result).toHaveLength(3);
    const scores = result.map((r) => r.score);
    // All scores should be equal
    expect(scores[0]).toBeCloseTo(scores[1]!, 5);
    expect(scores[1]).toBeCloseTo(scores[2]!, 5);
  });

  // ── Descending sort ───────────────────────────────────────────────────

  it('returns candidates sorted descending by score', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'low', timeSinceLastFlight: 5 }),
      makeCandidate({ studentId: 'high', timeSinceLastFlight: 200 }),
      makeCandidate({ studentId: 'mid', timeSinceLastFlight: 50 }),
    ];

    const result = rankWaitlistCandidates(candidates, DEFAULT_RANKING_WEIGHTS);

    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]!.score).toBeGreaterThanOrEqual(result[i + 1]!.score);
    }
  });

  // ── Breakdown verification ────────────────────────────────────────────

  it('breakdown values sum to the composite score', () => {
    const candidates: RankingInput[] = [
      makeCandidate({
        studentId: 'check',
        timeSinceLastFlight: 72,
        timeUntilNextFlight: 48,
        totalHours: 80,
        customFactors: { urgency: 3 },
      }),
      makeCandidate({
        studentId: 'other',
        timeSinceLastFlight: 24,
        timeUntilNextFlight: null,
        totalHours: 20,
        customFactors: { urgency: 7 },
      }),
    ];

    const weights: RankingWeights = {
      timeSinceLastFlight: 0.3,
      timeUntilNextFlight: 0.2,
      totalHours: 0.2,
      custom: { urgency: 0.1 },
    };

    const result = rankWaitlistCandidates(candidates, weights);

    for (const r of result) {
      const breakdownSum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
      expect(r.score).toBeCloseTo(breakdownSum, 10);
    }
  });

  // ── Mixed null and non-null timeUntilNextFlight ───────────────────────

  it('null timeUntilNextFlight receives max normalized value (1.0)', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'soon', timeUntilNextFlight: 10 }),
      makeCandidate({ studentId: 'later', timeUntilNextFlight: 100 }),
      makeCandidate({ studentId: 'none', timeUntilNextFlight: null }),
    ];

    const weights: RankingWeights = {
      timeSinceLastFlight: 0,
      timeUntilNextFlight: 1.0,
      totalHours: 0,
      custom: {},
    };

    const result = rankWaitlistCandidates(candidates, weights);

    // "none" (null) should have max score (1.0) for this factor
    const noneResult = result.find((r) => r.studentId === 'none')!;
    expect(noneResult.breakdown['timeUntilNextFlight']).toBeCloseTo(1.0, 5);

    // "soon" (10h) inverted: normalize(10, 10, 100) = 0, inverted = 1.0
    // Same as null! Both get 1.0 since 10 is the min and inversion makes it max.
    const soonResult = result.find((r) => r.studentId === 'soon')!;
    expect(soonResult.breakdown['timeUntilNextFlight']).toBeCloseTo(1.0, 5);

    // "later" (100h away) should have lowest score after inversion
    const laterResult = result.find((r) => r.studentId === 'later')!;
    expect(laterResult.breakdown['timeUntilNextFlight']).toBeCloseTo(0.0, 5);

    // Verify "later" is ranked last
    expect(result[result.length - 1]!.studentId).toBe('later');
  });

  // ── Inversion tests ──────────────────────────────────────────────────

  it('inverts timeUntilNextFlight so lower values score higher', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'far', timeUntilNextFlight: 100 }),
      makeCandidate({ studentId: 'near', timeUntilNextFlight: 10 }),
    ];

    const weights: RankingWeights = {
      timeSinceLastFlight: 0,
      timeUntilNextFlight: 1.0,
      totalHours: 0,
      custom: {},
    };

    const result = rankWaitlistCandidates(candidates, weights);

    // "near" has lower time until next flight -> higher priority after inversion
    expect(result[0]!.studentId).toBe('near');
  });

  it('inverts totalHours so lower values score higher', () => {
    const candidates: RankingInput[] = [
      makeCandidate({ studentId: 'veteran', totalHours: 500 }),
      makeCandidate({ studentId: 'newbie', totalHours: 5 }),
    ];

    const weights: RankingWeights = {
      timeSinceLastFlight: 0,
      timeUntilNextFlight: 0,
      totalHours: 1.0,
      custom: {},
    };

    const result = rankWaitlistCandidates(candidates, weights);

    expect(result[0]!.studentId).toBe('newbie');
  });

  // ── Large candidate set ───────────────────────────────────────────────

  it('handles a larger set of candidates correctly', () => {
    const candidates: RankingInput[] = Array.from({ length: 20 }, (_, i) =>
      makeCandidate({
        studentId: `student-${i}`,
        timeSinceLastFlight: i * 10,
        timeUntilNextFlight: i % 2 === 0 ? null : (20 - i) * 5,
        totalHours: i * 15,
        customFactors: { priority: i },
      }),
    );

    const result = rankWaitlistCandidates(candidates, DEFAULT_RANKING_WEIGHTS);

    expect(result).toHaveLength(20);
    // Verify descending sort
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]!.score).toBeGreaterThanOrEqual(result[i + 1]!.score);
    }
  });
});
