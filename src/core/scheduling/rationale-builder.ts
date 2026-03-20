/**
 * Rationale builder for scheduling suggestions.
 *
 * Constructs a structured, human-readable rationale object that explains
 * *why* a particular suggestion was generated. The rationale is stored as
 * JSONB on the suggestions table and displayed in the scheduler UI.
 */

import type { ConstraintResult } from './constraint-evaluator.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface RationaleInput {
  /** Per-factor weighted score breakdown from the ranking algorithm. */
  rankingBreakdown: Record<string, number>;
  /** Results of all constraint evaluations. */
  constraintResults: ConstraintResult[];
  /** Scheduling policies that influenced this suggestion. */
  policyMatches: string[];
  /** The type of suggestion being generated. */
  suggestionType: string;
}

export interface Rationale {
  /** One-sentence human-readable summary. */
  summary: string;
  /** List of inputs/factors that were considered, with their contributions. */
  inputs: string[];
  /** List of constraints evaluated, each with pass/fail status. */
  constraints: string[];
  /** List of scheduling policies that influenced the suggestion. */
  policies: string[];
}

// ─── Friendly Names ──────────────────────────────────────────────────────────

const FACTOR_LABELS: Record<string, string> = {
  timeSinceLastFlight: 'Time since last flight',
  timeUntilNextFlight: 'Time until next scheduled flight',
  totalHours: 'Total flight hours (experience level)',
};

const SUGGESTION_TYPE_LABELS: Record<string, string> = {
  waitlist: 'Waitlist fill',
  reschedule: 'Reschedule alternative',
  discovery: 'Discovery flight',
  next_lesson: 'Next training lesson',
};

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Build a structured rationale for a scheduling suggestion.
 *
 * @param input  Ranking breakdown, constraint results, policy matches, and type.
 * @returns A Rationale object suitable for JSONB storage and UI display.
 */
export function buildRationale(input: RationaleInput): Rationale {
  const { rankingBreakdown, constraintResults, policyMatches, suggestionType } = input;

  // ── Summary ──────────────────────────────────────────────────────────────

  const typeLabel = SUGGESTION_TYPE_LABELS[suggestionType] ?? suggestionType;
  const passedCount = constraintResults.filter((r) => r.passed).length;
  const totalCount = constraintResults.length;

  // Find the top contributing factor
  let topFactor = '';
  let topScore = -Infinity;
  for (const [key, value] of Object.entries(rankingBreakdown)) {
    if (value > topScore) {
      topScore = value;
      topFactor = key;
    }
  }

  const topFactorLabel = getFactorLabel(topFactor);
  const totalScore = Object.values(rankingBreakdown).reduce((a, b) => a + b, 0);

  const summary =
    `${typeLabel} suggestion (score: ${totalScore.toFixed(3)}). ` +
    `Top factor: ${topFactorLabel}. ` +
    `${passedCount}/${totalCount} constraints passed.`;

  // ── Inputs ───────────────────────────────────────────────────────────────

  const inputs: string[] = [];

  for (const [key, value] of Object.entries(rankingBreakdown)) {
    const label = getFactorLabel(key);
    const pct = totalScore > 0 ? ((value / totalScore) * 100).toFixed(1) : '0.0';
    inputs.push(`${label}: ${value.toFixed(4)} (${pct}% of total score)`);
  }

  // Sort by contribution descending for readability
  inputs.sort((a, b) => {
    const aVal = parseFloat(a.split(': ')[1] ?? '0');
    const bVal = parseFloat(b.split(': ')[1] ?? '0');
    return bVal - aVal;
  });

  // ── Constraints ──────────────────────────────────────────────────────────

  const constraints: string[] = constraintResults.map((r) => {
    const status = r.passed ? 'PASS' : 'FAIL';
    return `[${status}] ${r.constraint}: ${r.details}`;
  });

  // ── Policies ─────────────────────────────────────────────────────────────

  const policies: string[] = policyMatches.length > 0
    ? policyMatches.map((p) => p)
    : ['No specific policy overrides applied'];

  return { summary, inputs, constraints, policies };
}

/**
 * Get a human-readable label for a ranking factor key.
 * Custom factors are prefixed with "custom_" and use the remainder as the label.
 */
function getFactorLabel(key: string): string {
  if (key in FACTOR_LABELS) {
    return FACTOR_LABELS[key]!;
  }

  if (key.startsWith('custom_')) {
    const customKey = key.slice(7); // Remove "custom_" prefix
    // Convert camelCase or snake_case to title case
    return customKey
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase());
  }

  // Fallback: convert key to readable form
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}
