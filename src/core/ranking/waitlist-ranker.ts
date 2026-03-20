/**
 * Waitlist ranking algorithm.
 *
 * Ranks candidates for a schedule opening using configurable weighted factors.
 * Each factor is normalized to [0, 1] across all candidates via min-max
 * normalization, then multiplied by the corresponding weight and summed.
 *
 * Priority logic:
 *   - timeSinceLastFlight: higher is better (student waiting longest gets priority)
 *   - timeUntilNextFlight: null (no upcoming) = max score; lower value = higher score
 *   - totalHours: lower is better (newer students get more help)
 *   - custom factors: higher raw value = higher score (interpreted as priority signals)
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface RankingInput {
  studentId: string;
  /** Hours since student's last flight. Higher = waited longer. */
  timeSinceLastFlight: number;
  /** Hours until student's next scheduled flight. null = nothing scheduled. */
  timeUntilNextFlight: number | null;
  /** Total flight hours logged by the student. */
  totalHours: number;
  /** Operator-defined custom ranking factors (higher raw value = higher priority). */
  customFactors: Record<string, number>;
}

export interface RankingWeights {
  /** Weight for time-since-last-flight factor. Default 0.3. */
  timeSinceLastFlight: number;
  /** Weight for time-until-next-flight factor. Default 0.2. */
  timeUntilNextFlight: number;
  /** Weight for total-hours factor. Default 0.2. */
  totalHours: number;
  /** Weights for operator-defined custom factors. */
  custom: Record<string, number>;
}

export interface RankedCandidate {
  studentId: string;
  /** Composite weighted score in [0, 1]. */
  score: number;
  /** Per-factor contribution to the final score (weight * normalized value). */
  breakdown: Record<string, number>;
}

// ─── Default Weights ─────────────────────────────────────────────────────────

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  timeSinceLastFlight: 0.3,
  timeUntilNextFlight: 0.2,
  totalHours: 0.2,
  custom: {},
};

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Min-max normalize a value into [0, 1].
 * When min === max every candidate is equal, so return 0.5 (neutral).
 */
function minMaxNormalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

/**
 * Rank waitlist candidates by weighted scoring.
 *
 * @param candidates  Array of students with raw factor values.
 * @param weights     Per-factor weights (need not sum to 1 — scores are comparable
 *                    within a single ranking call regardless).
 * @returns  Candidates sorted descending by composite score, each with a
 *           detailed breakdown suitable for rationale construction.
 */
export function rankWaitlistCandidates(
  candidates: RankingInput[],
  weights: RankingWeights,
): RankedCandidate[] {
  if (candidates.length === 0) return [];

  // If only one candidate, they get full score
  if (candidates.length === 1) {
    const c = candidates[0]!;
    const breakdown: Record<string, number> = {
      timeSinceLastFlight: weights.timeSinceLastFlight * 0.5,
      timeUntilNextFlight: weights.timeUntilNextFlight * 0.5,
      totalHours: weights.totalHours * 0.5,
    };
    for (const [key, w] of Object.entries(weights.custom)) {
      breakdown[`custom_${key}`] = w * 0.5;
    }
    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return [{ studentId: c.studentId, score, breakdown }];
  }

  // ── Step 1: Compute min/max for each factor across all candidates ────────

  let minTimeSinceLast = Infinity;
  let maxTimeSinceLast = -Infinity;

  // For timeUntilNextFlight, null means "no upcoming flight" — we need a
  // sentinel that is larger than any real value so it can receive max score
  // after inversion. We'll replace nulls after computing min/max of non-null values.
  const nonNullTimeUntilNext: number[] = [];

  let minTotalHours = Infinity;
  let maxTotalHours = -Infinity;

  const customMins: Record<string, number> = {};
  const customMaxes: Record<string, number> = {};

  for (const c of candidates) {
    // timeSinceLastFlight
    if (c.timeSinceLastFlight < minTimeSinceLast) minTimeSinceLast = c.timeSinceLastFlight;
    if (c.timeSinceLastFlight > maxTimeSinceLast) maxTimeSinceLast = c.timeSinceLastFlight;

    // timeUntilNextFlight
    if (c.timeUntilNextFlight !== null) {
      nonNullTimeUntilNext.push(c.timeUntilNextFlight);
    }

    // totalHours
    if (c.totalHours < minTotalHours) minTotalHours = c.totalHours;
    if (c.totalHours > maxTotalHours) maxTotalHours = c.totalHours;

    // custom factors
    for (const [key, value] of Object.entries(c.customFactors)) {
      if (!(key in customMins) || value < customMins[key]!) {
        customMins[key] = value;
      }
      if (!(key in customMaxes) || value > customMaxes[key]!) {
        customMaxes[key] = value;
      }
    }
  }

  // For timeUntilNextFlight: compute min/max of the non-null values.
  // If ALL are null, every candidate scores equally (0.5 after normalize).
  let minTimeUntilNext = 0;
  let maxTimeUntilNext = 0;
  const allTimeUntilNextNull = nonNullTimeUntilNext.length === 0;

  if (!allTimeUntilNextNull) {
    minTimeUntilNext = Math.min(...nonNullTimeUntilNext);
    maxTimeUntilNext = Math.max(...nonNullTimeUntilNext);
  }

  // ── Step 2: Score each candidate ─────────────────────────────────────────

  const scored: RankedCandidate[] = candidates.map((c) => {
    const breakdown: Record<string, number> = {};

    // timeSinceLastFlight: higher raw → higher normalized → higher score
    const normTimeSinceLast = minMaxNormalize(
      c.timeSinceLastFlight,
      minTimeSinceLast,
      maxTimeSinceLast,
    );
    breakdown['timeSinceLastFlight'] = weights.timeSinceLastFlight * normTimeSinceLast;

    // timeUntilNextFlight: null → max score (1.0); otherwise invert (lower raw → higher score)
    let normTimeUntilNext: number;
    if (c.timeUntilNextFlight === null) {
      // No upcoming flight — highest priority
      normTimeUntilNext = 1.0;
    } else if (allTimeUntilNextNull) {
      // Shouldn't reach here, but defensive: neutral score
      normTimeUntilNext = 0.5;
    } else {
      // Invert: lower timeUntilNext → higher score
      const raw = minMaxNormalize(c.timeUntilNextFlight, minTimeUntilNext, maxTimeUntilNext);
      normTimeUntilNext = 1.0 - raw;
    }
    breakdown['timeUntilNextFlight'] = weights.timeUntilNextFlight * normTimeUntilNext;

    // totalHours: lower raw → higher priority → invert
    const normTotalHours = minMaxNormalize(c.totalHours, minTotalHours, maxTotalHours);
    breakdown['totalHours'] = weights.totalHours * (1.0 - normTotalHours);

    // Custom factors: higher raw → higher score (direct)
    for (const [key, w] of Object.entries(weights.custom)) {
      const raw = c.customFactors[key] ?? 0;
      const cMin = customMins[key] ?? 0;
      const cMax = customMaxes[key] ?? 0;
      const norm = minMaxNormalize(raw, cMin, cMax);
      breakdown[`custom_${key}`] = w * norm;
    }

    // Sum all breakdown values for composite score
    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

    return { studentId: c.studentId, score, breakdown };
  });

  // ── Step 3: Sort descending by score ─────────────────────────────────────

  scored.sort((a, b) => b.score - a.score);

  return scored;
}
