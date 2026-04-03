'use client';

import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { api } from '@/lib/api';
import type { InsightsData } from '@/lib/types';

interface InsightsResponse {
  data: InsightsData;
}

export default function InsightsPanel() {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasAnimatedCards = useRef(false);

  useEffect(() => {
    fetchInsights();
  }, []);

  async function fetchInsights() {
    try {
      const res = await api.get<InsightsResponse>('/insights');
      setInsights(res.data);
    } catch {
      setError('Failed to load student insights.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await api.post<InsightsResponse>('/insights/refresh', {});
      setInsights(res.data);
      setError('');
    } catch {
      setError('Failed to refresh insights.');
    } finally {
      setRefreshing(false);
    }
  }

  // GSAP: cards stagger animation
  useEffect(() => {
    if (!insights || !panelRef.current) return;
    const cards = panelRef.current.querySelectorAll('.insight-card');
    if (hasAnimatedCards.current) {
      gsap.set(cards, { opacity: 1, y: 0, scale: 1 });
      return;
    }
    hasAnimatedCards.current = true;
    gsap.fromTo(
      cards,
      { opacity: 0, y: 12, scale: 0.95 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.35,
        ease: 'power2.out',
        stagger: 0.1,
      },
    );
  }, [insights]);

  function toggleCard(cardId: string) {
    setExpandedCard((prev) => (prev === cardId ? null : cardId));
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>Student Insights</h3>
        </div>
        <div style={styles.grid}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="insight-card" style={{ ...styles.card, opacity: 0.5 }}>
              <div
                className="skeleton"
                style={{ width: 120, height: 12, borderRadius: 4, marginBottom: 12 }}
              />
              <div className="skeleton" style={{ width: 60, height: 32, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !insights) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>Student Insights</h3>
        </div>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  if (!insights) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Student Insights</h3>
          <p style={styles.subtitle}>Training progress and engagement overview</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn btn-sm"
          style={styles.refreshBtn}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div ref={panelRef} style={styles.grid}>
        {/* Inactive Students Card */}
        <div
          className="insight-card"
          style={{ ...styles.card, borderTopColor: '#f59e0b' }}
          onClick={() => toggleCard('inactive')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && toggleCard('inactive')}
        >
          <div style={styles.cardHeader}>
            <div
              style={{
                ...styles.cardIcon,
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h4 style={styles.cardTitle}>Inactive Students</h4>
              <p style={styles.cardDesc}>No flight in 14+ days, no upcoming</p>
            </div>
          </div>
          <div style={styles.cardCount}>{insights.inactive.length}</div>
          <div style={styles.expandHint}>
            {expandedCard === 'inactive' ? 'Click to collapse' : 'Click to expand'}
          </div>

          {expandedCard === 'inactive' && insights.inactive.length > 0 && (
            <div style={styles.expandedList} onClick={(e) => e.stopPropagation()}>
              {insights.inactive.map((s) => (
                <div key={s.studentId} style={styles.studentRow}>
                  <span style={styles.studentName}>{s.studentName}</span>
                  <span style={{ ...styles.studentMeta, color: '#f59e0b' }}>
                    {s.daysSinceLastFlight}d since last flight
                  </span>
                </div>
              ))}
            </div>
          )}
          {expandedCard === 'inactive' && insights.inactive.length === 0 && (
            <div style={styles.emptyState}>All students are actively flying</div>
          )}
        </div>

        {/* Checkride Ready Card */}
        <div
          className="insight-card"
          style={{ ...styles.card, borderTopColor: '#22c55e' }}
          onClick={() => toggleCard('checkride')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && toggleCard('checkride')}
        >
          <div style={styles.cardHeader}>
            <div
              style={{
                ...styles.cardIcon,
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <h4 style={styles.cardTitle}>Checkride Ready</h4>
              <p style={styles.cardDesc}>90%+ enrollment completion</p>
            </div>
          </div>
          <div style={styles.cardCount}>{insights.checkrideReady.length}</div>
          <div style={styles.expandHint}>
            {expandedCard === 'checkride' ? 'Click to collapse' : 'Click to expand'}
          </div>

          {expandedCard === 'checkride' && insights.checkrideReady.length > 0 && (
            <div style={styles.expandedList} onClick={(e) => e.stopPropagation()}>
              {insights.checkrideReady.map((s) => (
                <div key={s.studentId} style={styles.studentRow}>
                  <span style={styles.studentName}>{s.studentName}</span>
                  <span style={{ ...styles.studentMeta, color: '#22c55e' }}>
                    {s.completedLessons}/{s.totalLessons} lessons ({s.enrollmentProgress.toFixed(0)}
                    %)
                  </span>
                </div>
              ))}
            </div>
          )}
          {expandedCard === 'checkride' && insights.checkrideReady.length === 0 && (
            <div style={styles.emptyState}>No students near checkride yet</div>
          )}
        </div>

        {/* At Risk Card */}
        <div
          className="insight-card"
          style={{ ...styles.card, borderTopColor: '#ef4444' }}
          onClick={() => toggleCard('atRisk')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && toggleCard('atRisk')}
        >
          <div style={styles.cardHeader}>
            <div
              style={{
                ...styles.cardIcon,
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h4 style={styles.cardTitle}>At Risk</h4>
              <p style={styles.cardDesc}>Increasing gaps between flights</p>
            </div>
          </div>
          <div style={styles.cardCount}>{insights.atRisk.length}</div>
          <div style={styles.expandHint}>
            {expandedCard === 'atRisk' ? 'Click to collapse' : 'Click to expand'}
          </div>

          {expandedCard === 'atRisk' && insights.atRisk.length > 0 && (
            <div style={styles.expandedList} onClick={(e) => e.stopPropagation()}>
              {insights.atRisk.map((s) => (
                <div key={s.studentId} style={styles.studentRow}>
                  <span style={styles.studentName}>{s.studentName}</span>
                  <span style={{ ...styles.studentMeta, color: '#ef4444' }}>{s.riskReason}</span>
                </div>
              ))}
            </div>
          )}
          {expandedCard === 'atRisk' && insights.atRisk.length === 0 && (
            <div style={styles.emptyState}>No at-risk students detected</div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  title: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  refreshBtn: {
    fontSize: '0.75rem',
    padding: '4px 12px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  errorBox: {
    background: 'var(--color-danger-glow)',
    color: '#dc2626',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '16px',
  },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderTop: '3px solid #3b82f6',
    borderRadius: '12px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s ease, transform 0.15s ease',
    userSelect: 'none' as const,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  cardIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  },
  cardDesc: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
    margin: 0,
    marginTop: '2px',
  },
  cardCount: {
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
    marginBottom: '4px',
  },
  expandHint: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
  expandedList: {
    marginTop: '12px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '12px',
  },
  studentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  studentName: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--color-text)',
  },
  studentMeta: {
    fontSize: '0.7rem',
    fontWeight: 500,
  },
  emptyState: {
    marginTop: '12px',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '12px',
    fontSize: '0.8rem',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
  },
};
