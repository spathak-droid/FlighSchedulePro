'use client';

import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { api } from '@/lib/api';
import type { DashboardStats, WeeklyFlightHour, QueueHealth } from '@/lib/types';
import WeatherWidget from '@/components/weather-widget';
import InsightsPanel from '@/components/insights-panel';
import FlightAlertsList from '@/components/flight-alerts-list';


function AnimatedNumber({ value, duration = 0.8 }: { value: number | null | undefined; duration?: number }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const numValue = Number(value) || 0;

  useEffect(() => {
    if (!spanRef.current) return;
    const obj = { val: 0 };
    gsap.to(obj, {
      val: numValue,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        if (spanRef.current) {
          spanRef.current.textContent = Math.round(Number(obj.val)).toString();
        }
      },
    });
  }, [numValue, duration]);

  return <span ref={spanRef}>0</span>;
}

function AnimatedPercentage({ value, duration = 0.8 }: { value: number | null | undefined; duration?: number }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const numValue = Number(value) || 0;

  useEffect(() => {
    if (!spanRef.current) return;
    const obj = { val: 0 };
    gsap.to(obj, {
      val: numValue,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        if (spanRef.current) {
          spanRef.current.textContent = Number(obj.val).toFixed(1) + '%';
        }
      },
    });
  }, [numValue, duration]);

  return <span ref={spanRef}>0%</span>;
}

/* ── Weekly Flight Hours Chart ─────────────────────────────────────────────── */

function WeeklyFlightHoursChart({ data }: { data: WeeklyFlightHour[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const maxHours = Math.max(...data.map((d) => d.hours), 1);

  useEffect(() => {
    if (!chartRef.current) return;
    const bars = chartRef.current.querySelectorAll('.bar-fill');
    gsap.fromTo(
      bars,
      { scaleY: 0 },
      {
        scaleY: 1,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.06,
      },
    );
  }, [data]);

  function formatDayLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <h3 style={styles.chartTitle}>Weekly Flight Hours</h3>
        <span style={styles.chartSubtitle}>Past 7 days</span>
      </div>
      <div ref={chartRef} style={styles.chartContainer}>
        {data.map((day) => {
          const pct = maxHours > 0 ? (day.hours / maxHours) * 100 : 0;
          return (
            <div key={day.date} style={styles.barColumn}>
              <span style={styles.barValue}>{day.hours}h</span>
              <div style={styles.barTrack}>
                <div
                  className="bar-fill"
                  style={{
                    ...styles.barFill,
                    height: `${Math.max(pct, 4)}%`,
                    transformOrigin: 'bottom',
                  }}
                />
              </div>
              <span style={styles.barLabel}>{formatDayLabel(day.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Queue Health Indicator ────────────────────────────────────────────────── */

function QueueHealthIndicator({ health }: { health: QueueHealth }) {
  const sf = (v: unknown): string => { const n = Number(v); return isFinite(n) ? n.toFixed(1) : '0.0'; };

  // Green: oldest < 4h, Yellow: 4-12h, Red: > 12h
  let healthColor = '#22c55e';
  let healthLabel = 'Healthy';
  if ((health?.oldestPendingAge ?? 0) > 12) {
    healthColor = '#ef4444';
    healthLabel = 'Needs Attention';
  } else if ((health?.oldestPendingAge ?? 0) > 4) {
    healthColor = '#f59e0b';
    healthLabel = 'Moderate';
  }

  return (
    <div className="stat-card" style={{ ...styles.statCardStyle, borderTopColor: healthColor }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3>Queue Health</h3>
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '10px',
            color: healthColor,
            backgroundColor: `${healthColor}20`,
            textTransform: 'uppercase' as const,
          }}
        >
          {healthLabel}
        </span>
      </div>
      <div style={styles.healthMetrics}>
        <div style={styles.healthMetric}>
          <span style={styles.healthMetricValue}>{health?.pendingCount ?? 0}</span>
          <span style={styles.healthMetricLabel}>Pending</span>
        </div>
        <div style={styles.healthMetric}>
          <span style={styles.healthMetricValue}>{sf(health?.oldestPendingAge)}h</span>
          <span style={styles.healthMetricLabel}>Oldest Wait</span>
        </div>
        <div style={styles.healthMetric}>
          <span style={styles.healthMetricValue}>{sf(health?.avgApprovalTime)}h</span>
          <span style={styles.healthMetricLabel}>Avg Approval</span>
        </div>
        <div style={styles.healthMetric}>
          <span style={styles.healthMetricValue}>{sf(health?.expirationRate)}%</span>
          <span style={styles.healthMetricLabel}>Expiry Rate</span>
        </div>
      </div>
    </div>
  );
}

/* ── Alert Count Badge ─────────────────────────────────────────────────────── */

function AlertCountBadge() {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await api.get<{ data: { count: number } }>('/flight-alerts/count');
        setCount(res.data.count);
      } catch {
        // silently fail — badge is non-critical
      }
    }
    fetchCount();
  }, []);

  if (count === 0) return null;

  return (
    <a href="#flight-alerts" style={styles.alertBadgeLink}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span style={styles.alertBadgeCount}>{count}</span>
    </a>
  );
}

/* ── Main Dashboard ────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const statsGridRef = useRef<HTMLDivElement>(null);
  const rateCardRef = useRef<HTMLDivElement>(null);

  // Pre-compute ALL numeric displays to avoid .toFixed crashes
  const safeNum = (v: unknown): string => {
    const n = Number(v);
    return isFinite(n) ? n.toFixed(1) : '0.0';
  };
  const timeToFillDisplay = stats?.timeToFill != null ? safeNum(stats.timeToFill) : null;
  const weeklyTotalDisplay = safeNum(stats?.weeklyFlightHours?.reduce((s, d) => s + (d?.hours ?? 0), 0) ?? 0);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await api.get<{ data: DashboardStats }>('/dashboard/stats');
        setStats(res.data);
      } catch {
        setError('Failed to load dashboard stats.');
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  // GSAP: stat cards stagger in
  useEffect(() => {
    if (!stats || !statsGridRef.current) return;
    const cards = statsGridRef.current.querySelectorAll('.stat-card');
    gsap.fromTo(
      cards,
      { opacity: 0, scale: 0.9, y: 12 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
        stagger: 0.1,
      }
    );

    // Rate card
    if (rateCardRef.current) {
      gsap.fromTo(
        rateCardRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', delay: 0.45 }
      );
    }

  }, [stats]);

  return (
    <div>
      {/* Page header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Dashboard</h1>
          <p style={styles.pageSubtitle}>Scheduling overview for today</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCountBadge />
          <a href="/queue" className="btn btn-primary btn-sm">
            Open Queue
          </a>
        </div>
      </div>

      {/* Error */}
      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Loading skeleton */}
      {loading ? (
        <>
          <div style={styles.statsGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="stat-card" style={{ opacity: 0.5 }}>
                <div className="skeleton" style={{ width: 100, height: 12, borderRadius: 4, marginBottom: 12 }} />
                <div className="skeleton" style={{ width: 60, height: 36, borderRadius: 6 }} />
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 24, marginBottom: 24, opacity: 0.5 }}>
            <div className="skeleton" style={{ width: 140, height: 14, borderRadius: 4, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: '100%', height: 8, borderRadius: 4 }} />
          </div>
        </>
      ) : stats ? (
        <>
          {/* Stats cards */}
          <div ref={statsGridRef} style={styles.statsGrid}>
            <div className="stat-card" style={{ ...styles.statCardStyle, borderTopColor: '#3b82f6' }}>
              <h3>Pending</h3>
              <div className="stat-value">
                <AnimatedNumber value={stats.pendingSuggestions} />
              </div>
            </div>
            <div className="stat-card" style={{ ...styles.statCardStyle, borderTopColor: '#22c55e' }}>
              <h3>Approved Today</h3>
              <div className="stat-value">
                <AnimatedNumber value={stats.approvedToday} />
              </div>
            </div>
            <div className="stat-card" style={{ ...styles.statCardStyle, borderTopColor: '#ef4444' }}>
              <h3>Declined Today</h3>
              <div className="stat-value">
                <AnimatedNumber value={stats.declinedToday} />
              </div>
            </div>
            <div className="stat-card" style={{ ...styles.statCardStyle, borderTopColor: '#f59e0b' }}>
              <h3>Expired Today</h3>
              <div className="stat-value">
                <AnimatedNumber value={stats.expiredToday} />
              </div>
            </div>

            {/* Time-to-Fill stat card */}
            <div className="stat-card" style={{ ...styles.statCardStyle, borderTopColor: '#8b5cf6' }}>
              <h3>Avg Time to Fill</h3>
              <div className="stat-value">
                {timeToFillDisplay ? (
                  <>{timeToFillDisplay}<span style={{ fontSize: '0.9rem', fontWeight: 400 }}>h</span></>
                ) : (
                  <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>N/A</span>
                )}
              </div>
            </div>

            {/* Queue Health */}
            {stats.queueHealth && (
              <QueueHealthIndicator health={stats.queueHealth} />
            )}
          </div>

          {/* Acceptance rate */}
          <div ref={rateCardRef} style={styles.rateCard}>
            <div style={styles.rateHeader}>
              <div>
                <h3 style={styles.rateTitle}>Acceptance Rate</h3>
                <p style={styles.rateSubtitle}>Percentage of suggestions approved</p>
              </div>
              <span style={styles.rateValue}>
                <AnimatedPercentage value={stats.acceptanceRate != null ? stats.acceptanceRate : 0} />
              </span>
            </div>
            <div style={styles.rateBarBg}>
              <div
                style={{
                  ...styles.rateBarFill,
                  width: `${Math.min(stats.acceptanceRate != null ? stats.acceptanceRate : 0, 100)}%`,
                }}
              />
            </div>
            <div style={styles.rateFooter}>
              {timeToFillDisplay && (
                <span style={styles.rateMetric}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b92a5" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  Avg. time to approval: {timeToFillDisplay}h
                </span>
              )}
              {stats.weeklyFlightHours && stats.weeklyFlightHours.length > 0 && (
                <span style={styles.rateMetric}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b92a5" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                  Weekly total: {weeklyTotalDisplay}h
                </span>
              )}
            </div>
          </div>

          {/* Weekly Flight Hours Chart */}
          {stats.weeklyFlightHours && stats.weeklyFlightHours.length > 0 && (
            <WeeklyFlightHoursChart data={stats.weeklyFlightHours} />
          )}

          {/* Flight Alerts */}
          <div id="flight-alerts">
            <FlightAlertsList />
          </div>

          {/* Student Insights */}
          <InsightsPanel />

          {/* Live Weather */}
          <WeatherWidget />

        </>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '28px',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  pageTitle: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  pageSubtitle: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    marginTop: '4px',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.15)',
    color: '#f87171',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  statCardStyle: {
    borderTop: '3px solid #3b82f6',
  },
  rateCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  rateHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  rateTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  },
  rateSubtitle: {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  rateValue: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
  },
  rateBarBg: {
    height: '8px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '16px',
  },
  rateBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3b82f6, #22c55e)',
    borderRadius: '4px',
    transition: 'width 0.8s ease',
  },
  rateFooter: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap' as const,
  },
  rateMetric: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
  },
  // ── Chart styles ────────────────────────────────────────────────
  chartCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '20px',
  },
  chartTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  },
  chartSubtitle: {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
  },
  chartContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    height: '140px',
  },
  barColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '6px',
    height: '100%',
  },
  barValue: {
    fontSize: '0.65rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap' as const,
  },
  barTrack: {
    flex: 1,
    width: '100%',
    maxWidth: '48px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '6px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    background: 'linear-gradient(180deg, #3b82f6, #6366f1)',
    borderRadius: '6px 6px 0 0',
    minHeight: '4px',
  },
  barLabel: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  // ── Queue health styles ─────────────────────────────────────────
  healthMetrics: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginTop: '8px',
  },
  healthMetric: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  healthMetricValue: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '-0.01em',
  },
  healthMetricLabel: {
    fontSize: '0.65rem',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  // ── Alert badge ─────────────────────────────────────────────────
  alertBadgeLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    textDecoration: 'none',
    position: 'relative' as const,
  },
  alertBadgeCount: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    borderRadius: '9px',
    backgroundColor: '#ef4444',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 700,
  },
};
