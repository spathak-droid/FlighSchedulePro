'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import gsap from 'gsap';
import { api } from '@/lib/api';
import type { ActivityEvent, PaginatedResponse } from '@/lib/types';

function relativeTime(timestamp: string): string {
  try {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return timestamp;
  }
}

function eventMeta(eventType: string): {
  label: string;
  dotColor: string;
  badgeBg: string;
  badgeColor: string;
} {
  const map: Record<
    string,
    { label: string; dotColor: string; badgeBg: string; badgeColor: string }
  > = {
    suggestion_approved: {
      label: 'Approved',
      dotColor: '#22c55e',
      badgeBg: 'rgba(34,197,94,0.1)',
      badgeColor: '#16a34a',
    },
    suggestion_declined: {
      label: 'Declined',
      dotColor: '#ef4444',
      badgeBg: 'rgba(239,68,68,0.1)',
      badgeColor: '#dc2626',
    },
    suggestion_expired: {
      label: 'Expired',
      dotColor: '#6b7280',
      badgeBg: 'rgba(100,116,139,0.1)',
      badgeColor: '#64748b',
    },
    suggestion_created: {
      label: 'Created',
      dotColor: '#3b82f6',
      badgeBg: 'rgba(59,130,246,0.1)',
      badgeColor: '#2563eb',
    },
    suggestion_auto_approved: {
      label: 'Auto-Approved',
      dotColor: '#22c55e',
      badgeBg: 'rgba(34,197,94,0.1)',
      badgeColor: '#16a34a',
    },
    suggestion_auto_approve_blocked: {
      label: 'Auto-Approve Blocked',
      dotColor: '#f59e0b',
      badgeBg: 'rgba(245,158,11,0.1)',
      badgeColor: '#d97706',
    },
    'suggestion.expired': {
      label: 'Expired',
      dotColor: '#6b7280',
      badgeBg: 'rgba(100,116,139,0.1)',
      badgeColor: '#64748b',
    },
    bulk_approve: {
      label: 'Bulk Approve',
      dotColor: '#22c55e',
      badgeBg: 'rgba(34,197,94,0.1)',
      badgeColor: '#16a34a',
    },
    bulk_decline: {
      label: 'Bulk Decline',
      dotColor: '#ef4444',
      badgeBg: 'rgba(239,68,68,0.1)',
      badgeColor: '#dc2626',
    },
    policy_updated: {
      label: 'Policy',
      dotColor: '#f59e0b',
      badgeBg: 'rgba(245,158,11,0.1)',
      badgeColor: '#d97706',
    },
    flight_cancelled: {
      label: 'Cancellation',
      dotColor: '#ef4444',
      badgeBg: 'rgba(239,68,68,0.1)',
      badgeColor: '#dc2626',
    },
    flight_completed: {
      label: 'Flight Done',
      dotColor: '#22c55e',
      badgeBg: 'rgba(34,197,94,0.1)',
      badgeColor: '#16a34a',
    },
    student_no_show: {
      label: 'No-Show',
      dotColor: '#f59e0b',
      badgeBg: 'rgba(245,158,11,0.1)',
      badgeColor: '#d97706',
    },
    disruption_detected: {
      label: 'Disruption',
      dotColor: '#ef4444',
      badgeBg: 'rgba(239,68,68,0.1)',
      badgeColor: '#dc2626',
    },
    maintenance_alert: {
      label: 'Maintenance',
      dotColor: '#f59e0b',
      badgeBg: 'rgba(245,158,11,0.1)',
      badgeColor: '#d97706',
    },
    instructor_unavailable: {
      label: 'Instructor Out',
      dotColor: '#8b5cf6',
      badgeBg: 'rgba(139,92,246,0.1)',
      badgeColor: '#7c3aed',
    },
  };
  return (
    map[eventType] || {
      label: eventType.replace(/_/g, ' '),
      dotColor: '#6b7280',
      badgeBg: 'rgba(100,116,139,0.1)',
      badgeColor: '#64748b',
    }
  );
}

interface ActivityFeedProps {
  compact?: boolean;
  refreshInterval?: number;
}

export default function ActivityFeed({
  compact = false,
  refreshInterval = 30000,
}: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const fetchEvents = useCallback(
    async (pageNum: number, append: boolean) => {
      try {
        const res = await api.get<PaginatedResponse<ActivityEvent>>('/activity', {
          page: pageNum,
          pageSize: compact ? 10 : 20,
        });
        if (append) {
          setEvents((prev) => [...prev, ...res.data]);
        } else {
          setEvents(res.data);
        }
        setHasMore(
          res.data.length > 0 &&
            res.pagination.page * res.pagination.pageSize < res.pagination.total,
        );
      } catch {
        // Silently fail for activity feed
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [compact],
  );

  useEffect(() => {
    fetchEvents(1, false);
  }, [fetchEvents]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchEvents(1, false);
      setPage(1);
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchEvents, refreshInterval]);

  // GSAP stagger animation on items
  useEffect(() => {
    if (!listRef.current || events.length === 0) return;
    const items = listRef.current.querySelectorAll('.activity-feed-item');
    const newItems = Array.from(items).slice(prevCountRef.current);
    if (newItems.length > 0) {
      gsap.fromTo(
        newItems,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out', stagger: 0.04 },
      );
    }
    prevCountRef.current = events.length;
  }, [events]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    setLoadingMore(true);
    fetchEvents(nextPage, true);
  }

  const containerStyle = compact ? styles.containerCompact : styles.container;
  const headerStyle = compact ? styles.headerCompact : styles.header;
  const titleStyle = compact ? styles.titleCompact : styles.title;
  const listStyle = compact ? styles.listCompact : styles.list;

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>Recent Activity</h3>
        </div>
        <div style={styles.loadingState}>
          <span className="spinner" />
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>Recent Activity</h3>
        </div>
        <div style={styles.emptyState}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p style={styles.emptyText}>No recent activity</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>Recent Activity</h3>
      </div>
      <div ref={listRef} style={listStyle}>
        {events.map((event) => {
          const meta = eventMeta(event.eventType);
          return (
            <div key={event.id} className="activity-feed-item" style={styles.item}>
              <div style={styles.timelineCol}>
                <div
                  style={{
                    ...styles.dot,
                    background: meta.dotColor,
                    boxShadow: `0 0 8px ${meta.dotColor}40`,
                  }}
                />
                <div style={styles.line} />
              </div>
              <div style={styles.content}>
                <div style={styles.itemHeader}>
                  <span
                    style={{
                      ...styles.badge,
                      background: meta.badgeBg,
                      color: meta.badgeColor,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span style={styles.timestamp}>{relativeTime(event.timestamp)}</span>
                </div>
                <p style={styles.summary}>{event.summary}</p>
                {/* Show constraint details for auto-approve events */}
                {event.details && (event.eventType === 'suggestion_auto_approved' || event.eventType === 'suggestion_auto_approve_blocked') && (
                  <div style={styles.detailsBox}>
                    {event.details.riskLevel && (
                      <span style={{
                        ...styles.detailTag,
                        color: event.details.riskLevel === 'low' ? '#16a34a' : event.details.riskLevel === 'medium' ? '#d97706' : '#dc2626',
                        background: event.details.riskLevel === 'low' ? 'rgba(34,197,94,0.1)' : event.details.riskLevel === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                      }}>
                        Risk: {event.details.riskLevel as string}
                      </span>
                    )}
                    {event.details.riskThreshold && (
                      <span style={styles.detailTag}>
                        Threshold: {event.details.riskThreshold as string}
                      </span>
                    )}
                    {event.details.constraintsPassed && (
                      <span style={{...styles.detailTag, color: '#16a34a', background: 'rgba(34,197,94,0.08)'}}>
                        4-layer check passed
                      </span>
                    )}
                    {event.details.layerSummary && (
                      <>
                        {(event.details.layerSummary as Record<string, unknown>).regulatory === false && (
                          <span style={{...styles.detailTag, color: '#dc2626', background: 'rgba(239,68,68,0.08)'}}>
                            Regulatory: FAIL
                          </span>
                        )}
                        {(event.details.layerSummary as Record<string, unknown>).safety === false && (
                          <span style={{...styles.detailTag, color: '#dc2626', background: 'rgba(239,68,68,0.08)'}}>
                            Safety: FAIL
                          </span>
                        )}
                        {(event.details.layerSummary as Record<string, unknown>).operator === false && (
                          <span style={{...styles.detailTag, color: '#d97706', background: 'rgba(245,158,11,0.08)'}}>
                            Operator Policy: FAIL
                          </span>
                        )}
                      </>
                    )}
                    {event.details.failedConstraints && (event.details.failedConstraints as string[]).length > 0 && (
                      <div style={styles.failedList2}>
                        {(event.details.failedConstraints as string[]).slice(0, 3).map((fc: string, i: number) => (
                          <div key={i} style={styles.failedItem2}>{fc}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {event.actor && <p style={styles.actor}>{event.actor}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <div style={styles.loadMore}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{ width: '100%' }}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  containerCompact: {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border)',
  },
  headerCompact: {
    padding: '10px 8px',
    borderBottom: '1px solid var(--color-border)',
  },
  title: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  },
  titleCompact: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    margin: 0,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  list: {
    maxHeight: '500px',
    overflowY: 'auto' as const,
    padding: '8px 20px',
  },
  listCompact: {
    overflowY: 'auto' as const,
    padding: '8px',
  },
  item: {
    display: 'flex',
    gap: '14px',
    paddingBottom: '16px',
    position: 'relative' as const,
  },
  timelineCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    width: '10px',
    flexShrink: 0,
    paddingTop: '4px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  line: {
    flex: 1,
    width: '1px',
    background: 'var(--color-border)',
    marginTop: '6px',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap' as const,
  },
  timestamp: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap' as const,
  },
  summary: {
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    margin: 0,
    wordBreak: 'break-word' as const,
    overflowWrap: 'anywhere' as const,
  },
  actor: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
    wordBreak: 'break-word' as const,
  },
  loadMore: {
    padding: '12px 20px',
    borderTop: '1px solid var(--color-border)',
  },
  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '10px',
  },
  emptyText: {
    fontSize: '0.8rem',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
  detailsBox: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginTop: '6px',
  },
  detailTag: {
    display: 'inline-block',
    fontSize: '0.62rem',
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: '4px',
    color: 'var(--color-text-muted)',
    background: 'rgba(100,116,139,0.08)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
    whiteSpace: 'nowrap' as const,
  },
  failedList2: {
    width: '100%',
    marginTop: '4px',
  },
  failedItem2: {
    fontSize: '0.68rem',
    color: 'var(--color-text-muted)',
    padding: '2px 0',
    borderLeft: '2px solid rgba(239,68,68,0.3)',
    paddingLeft: '8px',
    marginBottom: '2px',
    lineHeight: 1.4,
    wordBreak: 'break-word' as const,
  },
};
