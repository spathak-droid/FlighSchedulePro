'use client';

import { useState, useRef } from 'react';
import type { Suggestion } from '@/lib/types';
import RationalePanel from './rationale-panel';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  loading?: boolean;
}

const OPERATOR_TZ = 'America/Los_Angeles';

function formatTimeRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const date = s.toLocaleDateString('en-US', {
      timeZone: OPERATOR_TZ,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const startTime = s.toLocaleTimeString('en-US', { timeZone: OPERATOR_TZ, hour: 'numeric', minute: '2-digit' });
    const endTime = e.toLocaleTimeString('en-US', { timeZone: OPERATOR_TZ, hour: 'numeric', minute: '2-digit' });
    return `${date}, ${startTime} \u2013 ${endTime}`;
  } catch {
    return `${start} - ${end}`;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-US', { timeZone: OPERATOR_TZ, weekday: 'short', month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-US', { timeZone: OPERATOR_TZ, hour: 'numeric', minute: '2-digit' })
    );
  } catch {
    return iso;
  }
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    waitlist: 'Waitlist',
    reschedule: 'Reschedule',
    discovery: 'Discovery',
    next_lesson: 'Next Lesson',
  };
  return labels[type] || type;
}

const TYPE_BORDER_COLORS: Record<string, string> = {
  waitlist: '#3b82f6',
  reschedule: '#f59e0b',
  discovery: '#a855f7',
  next_lesson: '#14b8a6',
};

export default function SuggestionCard({
  suggestion,
  onApprove,
  onDecline,
  loading,
}: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isPending = suggestion.status === 'pending';
  const borderColor = TYPE_BORDER_COLORS[suggestion.type] || '#3b82f6';
  const scorePercent =
    suggestion.rankingScore !== undefined ? Math.round(Number(suggestion.rankingScore)) : null;
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={cardRef}
      style={{
        ...styles.card,
        borderLeftColor: borderColor,
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span className={`badge badge-${suggestion.type}`}>{typeLabel(suggestion.type)}</span>
          <span style={styles.studentName}>{suggestion.studentName || 'Unknown Student'}</span>
        </div>
        <div style={styles.headerRight}>
          {scorePercent !== null && (
            <div style={styles.scoreWrapper}>
              <div style={styles.scoreTrack}>
                <div
                  style={{
                    ...styles.scoreFill,
                    width: `${scorePercent}%`,
                  }}
                />
              </div>
              <span style={styles.scoreLabel}>{scorePercent}%</span>
            </div>
          )}
          <span className={`badge badge-${suggestion.status}`}>{suggestion.status}</span>
        </div>
      </div>

      {/* Time */}
      <div style={styles.timeRow}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        {formatTimeRange(suggestion.proposedStart, suggestion.proposedEnd)}
      </div>

      {/* Details */}
      <div style={styles.details}>
        {suggestion.instructorName && (
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Instructor</span>
            <span style={styles.detailValue}>{suggestion.instructorName}</span>
          </div>
        )}
        {suggestion.aircraftRegistration && (
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Aircraft</span>
            <span style={styles.detailValue}>{suggestion.aircraftRegistration}</span>
          </div>
        )}
        {suggestion.activityType && (
          <div style={styles.detailItem}>
            <span style={styles.detailLabel}>Activity</span>
            <span style={styles.detailValue}>{suggestion.activityType}</span>
          </div>
        )}
        <div style={styles.detailItem}>
          <span style={styles.detailLabel}>Expires</span>
          <span style={styles.detailValue}>{formatTime(suggestion.expiresAt)}</span>
        </div>
      </div>

      {/* Rationale */}
      {suggestion.rationale && (
        <div style={styles.rationaleWrapper}>
          <RationalePanel rationale={suggestion.rationale} defaultOpen={expanded} />
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div style={styles.actions}>
          <button
            className="btn btn-success btn-sm"
            onClick={() => onApprove(suggestion.id)}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : null}
            Approve
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onDecline(suggestion.id)}
            disabled={loading}
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderLeft: '3px solid #3b82f6',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: 'var(--shadow)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  studentName: {
    fontWeight: 600,
    fontSize: '0.95rem',
    color: 'var(--color-text)',
  },
  scoreWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  scoreTrack: {
    width: '48px',
    height: '5px',
    background: 'var(--color-border)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    background: '#3b82f6',
    borderRadius: '3px',
    transition: 'width 0.4s ease',
  },
  scoreLabel: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  timeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    marginBottom: '16px',
    fontWeight: 500,
  },
  details: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  detailLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
  },
  detailValue: {
    fontSize: '0.825rem',
    color: 'var(--color-text-secondary)',
  },
  rationaleWrapper: {
    marginBottom: '16px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    paddingTop: '12px',
    borderTop: '1px solid var(--color-border)',
  },
};
