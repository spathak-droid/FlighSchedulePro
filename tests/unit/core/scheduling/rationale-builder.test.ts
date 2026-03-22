import { describe, it, expect } from 'vitest';
import { buildRationale } from '../../../../src/core/scheduling/rationale-builder.js';
import type { ConstraintResult } from '../../../../src/core/scheduling/constraint-evaluator.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConstraint(constraint: string, passed: boolean, details = ''): ConstraintResult {
  return { constraint, passed, details: details || `${constraint} ${passed ? 'ok' : 'failed'}` };
}

// ─── buildRationale ─────────────────────────────────────────────────────────

describe('buildRationale', () => {
  it('builds a complete rationale with all sections', () => {
    const rationale = buildRationale({
      rankingBreakdown: {
        timeSinceLastFlight: 0.25,
        totalHours: 0.15,
      },
      constraintResults: [
        makeConstraint('student_availability', true),
        makeConstraint('daylight_hours', true),
      ],
      policyMatches: ['TTL 24h applied'],
      suggestionType: 'waitlist',
    });

    expect(rationale.summary).toContain('Waitlist fill');
    expect(rationale.summary).toContain('score:');
    expect(rationale.summary).toContain('2/2 constraints passed');
    expect(rationale.inputs).toHaveLength(2);
    expect(rationale.constraints).toHaveLength(2);
    expect(rationale.policies).toEqual(['TTL 24h applied']);
  });

  it('uses the correct suggestion type label', () => {
    const types: Record<string, string> = {
      waitlist: 'Waitlist fill',
      reschedule: 'Reschedule alternative',
      discovery: 'Discovery flight',
      next_lesson: 'Next training lesson',
    };

    for (const [type, label] of Object.entries(types)) {
      const rationale = buildRationale({
        rankingBreakdown: { timeSinceLastFlight: 0.1 },
        constraintResults: [],
        policyMatches: [],
        suggestionType: type,
      });
      expect(rationale.summary).toContain(label);
    }
  });

  it('falls back to raw type for unknown suggestion types', () => {
    const rationale = buildRationale({
      rankingBreakdown: { foo: 0.1 },
      constraintResults: [],
      policyMatches: [],
      suggestionType: 'custom_type',
    });
    expect(rationale.summary).toContain('custom_type');
  });

  it('identifies the top contributing factor', () => {
    const rationale = buildRationale({
      rankingBreakdown: {
        timeSinceLastFlight: 0.1,
        totalHours: 0.3,
        timeUntilNextFlight: 0.05,
      },
      constraintResults: [],
      policyMatches: [],
      suggestionType: 'waitlist',
    });

    expect(rationale.summary).toContain('Total flight hours');
  });

  it('computes correct total score in summary', () => {
    const rationale = buildRationale({
      rankingBreakdown: {
        timeSinceLastFlight: 0.2,
        totalHours: 0.3,
      },
      constraintResults: [],
      policyMatches: [],
      suggestionType: 'waitlist',
    });

    expect(rationale.summary).toContain('0.500');
  });

  it('sorts inputs by contribution descending', () => {
    const rationale = buildRationale({
      rankingBreakdown: {
        timeSinceLastFlight: 0.1,
        totalHours: 0.3,
        timeUntilNextFlight: 0.2,
      },
      constraintResults: [],
      policyMatches: [],
      suggestionType: 'waitlist',
    });

    // First input should be totalHours (0.3), then timeUntilNextFlight (0.2)
    expect(rationale.inputs[0]).toContain('Total flight hours');
    expect(rationale.inputs[1]).toContain('Time until next');
    expect(rationale.inputs[2]).toContain('Time since last');
  });

  it('formats constraints with PASS/FAIL status', () => {
    const rationale = buildRationale({
      rankingBreakdown: { factor: 0.5 },
      constraintResults: [
        makeConstraint('student_availability', true, 'Student is available'),
        makeConstraint('daylight_hours', false, 'Outside daylight'),
      ],
      policyMatches: [],
      suggestionType: 'waitlist',
    });

    expect(rationale.constraints[0]).toContain('[PASS]');
    expect(rationale.constraints[0]).toContain('student_availability');
    expect(rationale.constraints[1]).toContain('[FAIL]');
    expect(rationale.constraints[1]).toContain('daylight_hours');
  });

  it('counts passed and failed constraints correctly in summary', () => {
    const rationale = buildRationale({
      rankingBreakdown: { f: 0.1 },
      constraintResults: [
        makeConstraint('a', true),
        makeConstraint('b', false),
        makeConstraint('c', true),
        makeConstraint('d', false),
      ],
      policyMatches: [],
      suggestionType: 'waitlist',
    });

    expect(rationale.summary).toContain('2/4 constraints passed');
  });

  it('shows default policy message when none provided', () => {
    const rationale = buildRationale({
      rankingBreakdown: { f: 0.1 },
      constraintResults: [],
      policyMatches: [],
      suggestionType: 'waitlist',
    });

    expect(rationale.policies).toEqual(['No specific policy overrides applied']);
  });

  it('handles custom_ prefixed factor labels', () => {
    const rationale = buildRationale({
      rankingBreakdown: { custom_preferredInstructor: 0.5 },
      constraintResults: [],
      policyMatches: [],
      suggestionType: 'waitlist',
    });

    // custom_preferredInstructor -> "Preferred Instructor"
    expect(rationale.inputs[0]).toContain('Preferred Instructor');
  });

  it('handles snake_case custom factor labels', () => {
    const rationale = buildRationale({
      rankingBreakdown: { custom_flight_frequency: 0.5 },
      constraintResults: [],
      policyMatches: [],
      suggestionType: 'waitlist',
    });

    expect(rationale.inputs[0]).toContain('Flight frequency');
  });

  it('handles empty ranking breakdown', () => {
    const rationale = buildRationale({
      rankingBreakdown: {},
      constraintResults: [makeConstraint('a', true)],
      policyMatches: [],
      suggestionType: 'reschedule',
    });

    expect(rationale.inputs).toHaveLength(0);
    expect(rationale.summary).toContain('score: 0.000');
  });

  it('computes percentage contributions correctly', () => {
    const rationale = buildRationale({
      rankingBreakdown: {
        timeSinceLastFlight: 0.5,
        totalHours: 0.5,
      },
      constraintResults: [],
      policyMatches: [],
      suggestionType: 'waitlist',
    });

    // Each factor is 50% of total
    for (const input of rationale.inputs) {
      expect(input).toContain('50.0%');
    }
  });
});
