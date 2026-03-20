'use client';

import { useState, Fragment, useRef, useEffect } from 'react';
import gsap from 'gsap';
import type { Suggestion } from '@/lib/types';
import RationalePanel from './rationale-panel';

interface SuggestionTableProps {
  suggestions: Suggestion[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  actionLoadingId?: string | null;
}

function formatTimeRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const date = s.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const startTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date}, ${startTime}\u2013${endTime}`;
  } catch {
    return `${start} - ${end}`;
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

export default function SuggestionTable({
  suggestions,
  loading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onApprove,
  onDecline,
  actionLoadingId,
}: SuggestionTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const animatedRef = useRef(false);

  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
  const allPendingSelected =
    pendingSuggestions.length > 0 && pendingSuggestions.every((s) => selectedIds.has(s.id));

  // GSAP: stagger rows on data load
  useEffect(() => {
    if (!tbodyRef.current || suggestions.length === 0 || loading) return;
    const rows = tbodyRef.current.querySelectorAll('tr.suggestion-row');
    gsap.fromTo(
      rows,
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: 0.3,
        ease: 'power2.out',
        stagger: 0.03,
      },
    );
    animatedRef.current = true;
  }, [suggestions, loading]);

  if (loading) {
    return (
      <div style={styles.wrapper}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '40px' }}>&nbsp;</th>
              <th>Type</th>
              <th>Student</th>
              <th>Time</th>
              <th>Instructor</th>
              <th>Aircraft</th>
              <th style={{ width: '100px' }}>Score</th>
              <th style={{ width: '140px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                <td>
                  <div className="skeleton" style={{ width: 16, height: 16, borderRadius: 4 }} />
                </td>
                <td>
                  <div className="skeleton" style={{ width: 70, height: 22, borderRadius: 10 }} />
                </td>
                <td>
                  <div className="skeleton" style={{ width: 120, height: 14, borderRadius: 4 }} />
                </td>
                <td>
                  <div className="skeleton" style={{ width: 160, height: 14, borderRadius: 4 }} />
                </td>
                <td>
                  <div className="skeleton" style={{ width: 90, height: 14, borderRadius: 4 }} />
                </td>
                <td>
                  <div className="skeleton" style={{ width: 70, height: 14, borderRadius: 4 }} />
                </td>
                <td>
                  <div className="skeleton" style={{ width: 60, height: 6, borderRadius: 3 }} />
                </td>
                <td>
                  <div className="skeleton" style={{ width: 100, height: 28, borderRadius: 6 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div style={styles.emptyState}>
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </svg>
        <p style={styles.emptyTitle}>No suggestions found</p>
        <p style={styles.emptyText}>Try adjusting your filters or check back later.</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <table>
        <thead>
          <tr>
            <th style={{ width: '40px' }}>
              <input
                type="checkbox"
                checked={allPendingSelected}
                onChange={onToggleSelectAll}
                title="Select all pending"
              />
            </th>
            <th>Type</th>
            <th>Student</th>
            <th>Time</th>
            <th>Instructor</th>
            <th>Aircraft</th>
            <th style={{ width: '100px' }}>Score</th>
            <th style={{ width: '140px' }}>Actions</th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {suggestions.map((s) => {
            const isExpanded = expandedId === s.id;
            const isPending = s.status === 'pending';
            const isAutoApproved = s.status === 'approved' && s.approvedBy === 'system-auto';
            const isActionLoading = actionLoadingId === s.id;
            const scorePercent =
              s.rankingScore !== undefined ? Math.round(Number(s.rankingScore)) : null;

            return (
              <Fragment key={s.id}>
                <tr className="suggestion-row" style={{ opacity: 0 }}>
                  <td>
                    {isPending && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => onToggleSelect(s.id)}
                      />
                    )}
                  </td>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span className={`badge badge-${s.type}`}>{typeLabel(s.type)}</span>
                      {isAutoApproved && (
                        <span style={styles.autoApprovedBadge}>Auto-approved</span>
                      )}
                    </div>
                  </td>
                  <td style={styles.studentCell}>{s.studentName || '\u2014'}</td>
                  <td style={styles.timeCell}>{formatTimeRange(s.proposedStart, s.proposedEnd)}</td>
                  <td>{s.instructorName || '\u2014'}</td>
                  <td>{s.aircraftRegistration || '\u2014'}</td>
                  <td>
                    {scorePercent !== null ? (
                      <div style={styles.scoreCol}>
                        <div style={styles.scoreTrack}>
                          <div
                            style={{
                              ...styles.scoreFill,
                              width: `${scorePercent}%`,
                            }}
                          />
                        </div>
                        <span style={styles.scoreText}>{scorePercent}%</span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>{'\u2014'}</span>
                    )}
                  </td>
                  <td>
                    <div style={styles.actionCell}>
                      {isPending && (
                        <>
                          <button
                            className="btn btn-ghost-success btn-sm"
                            onClick={() => onApprove(s.id)}
                            disabled={isActionLoading}
                            style={styles.actionBtn}
                            title="Approve"
                          >
                            {isActionLoading ? (
                              <span className="spinner" style={{ width: 14, height: 14 }} />
                            ) : (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                          <button
                            className="btn btn-ghost-danger btn-sm"
                            onClick={() => onDecline(s.id)}
                            disabled={isActionLoading}
                            style={styles.actionBtn}
                            title="Decline"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        style={styles.actionBtn}
                        title={isExpanded ? 'Hide rationale' : 'Show rationale'}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                          }}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={8} style={styles.expandedRow}>
                      <RationalePanel rationale={s.rationale} defaultOpen={true} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    overflow: 'auto',
    boxShadow: 'var(--shadow)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 20px',
    gap: '12px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
  },
  emptyTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  },
  emptyText: {
    fontSize: '0.875rem',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
  studentCell: {
    fontWeight: 500,
    color: 'var(--color-text)',
  },
  timeCell: {
    whiteSpace: 'nowrap' as const,
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
  },
  scoreCol: {
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
    flexShrink: 0,
  },
  scoreFill: {
    height: '100%',
    background: '#3b82f6',
    borderRadius: '3px',
    transition: 'width 0.4s ease',
  },
  scoreText: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap' as const,
  },
  actionCell: {
    display: 'flex',
    gap: '2px',
    flexWrap: 'nowrap' as const,
  },
  actionBtn: {
    padding: '6px 8px',
    minWidth: '32px',
  },
  expandedRow: {
    background: 'var(--color-surface-elevated)',
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border)',
  },
  autoApprovedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: '#c084fc',
    background: 'rgba(168, 85, 247, 0.15)',
    border: '1px solid rgba(168, 85, 247, 0.25)',
    borderRadius: '10px',
    whiteSpace: 'nowrap' as const,
  },
};
