'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { api } from '@/lib/api';
import type { DashboardStats, WeeklyFlightHour } from '@/lib/types';
import WeatherWidget from '@/components/weather-widget';

/* ── Animated Number ─────────────────────────────────────────────────────── */

function AnimatedNumber({
  value,
  duration = 0.8,
  pad = false,
}: {
  value: number | null | undefined;
  duration?: number;
  pad?: boolean;
}) {
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
          const v = Math.round(Number(obj.val));
          spanRef.current.textContent = pad ? String(v).padStart(2, '0') : String(v);
        }
      },
    });
  }, [numValue, duration, pad]);

  return <span ref={spanRef}>0</span>;
}

/* ── Stat Icon ───────────────────────────────────────────────────────────── */

function StatIcon({ type }: { type: 'pending' | 'approved' | 'declined' | 'expired' }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    pending: { bg: '#dcfce7', fg: '#15803d' },
    approved: { bg: '#d1fae5', fg: '#059669' },
    declined: { bg: '#fee2e2', fg: '#dc2626' },
    expired: { bg: '#f1f5f1', fg: '#6b876b' },
  };
  const c = colors[type];

  const icons: Record<string, React.ReactNode> = {
    pending: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.fg}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    approved: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.fg}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    declined: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.fg}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    expired: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.fg}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
        <line x1="4" y1="4" x2="20" y2="20" />
      </svg>
    ),
  };

  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: c.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icons[type]}
    </div>
  );
}

/* ── Weekly Flight Hours Chart (Stacked Bars) ────────────────────────────── */

function WeeklyFlightHoursChart({ data }: { data: WeeklyFlightHour[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const maxHours = Math.max(...data.map((d) => d.hours), 1);

  useEffect(() => {
    if (!chartRef.current) return;
    const bars = chartRef.current.querySelectorAll('.bar-fill');
    gsap.fromTo(
      bars,
      { scaleY: 0 },
      { scaleY: 1, duration: 0.5, ease: 'power2.out', stagger: 0.06 },
    );
  }, [data]);

  function formatDayLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  }

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <div>
          <h3 style={styles.chartTitle}>Weekly Flight Hours</h3>
          <p style={styles.chartSubtitle}>Operational trends across routes</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: '#14532d',
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Domestic
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: '#22c55e',
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              International
            </span>
          </div>
        </div>
      </div>
      <div ref={chartRef} style={styles.chartContainer}>
        {data.map((day) => {
          const pct = maxHours > 0 ? (day.hours / maxHours) * 100 : 0;
          // Simulate domestic/international split
          const domesticPct = pct * 0.6;
          const intlPct = pct * 0.4;
          return (
            <div key={day.date} style={styles.barColumn}>
              <div style={styles.barTrack}>
                <div
                  className="bar-fill"
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column' as const,
                    justifyContent: 'flex-end',
                    height: `${Math.max(pct, 4)}%`,
                    transformOrigin: 'bottom',
                    borderRadius: '4px 4px 0 0',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: `${(intlPct / Math.max(pct, 1)) * 100}%`,
                      background: '#22c55e',
                      minHeight: 2,
                    }}
                  />
                  <div
                    style={{
                      height: `${(domesticPct / Math.max(pct, 1)) * 100}%`,
                      background: '#14532d',
                      minHeight: 2,
                    }}
                  />
                </div>
              </div>
              <span style={styles.barLabel}>{formatDayLabel(day.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Acceptance Rate Gauge ───────────────────────────────────────────────── */

function AcceptanceRateGauge({ rate, delta }: { rate: number; delta?: string }) {
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (rate / 100) * circumference;

  return (
    <div style={styles.gaugeCard}>
      <h3
        style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          color: 'var(--color-text-muted)',
          marginBottom: 20,
          textAlign: 'center' as const,
        }}
      >
        Acceptance Rate
      </h3>
      <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
        <svg width="140" height="140" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#d5e0d5" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="#15803d"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 60 60)"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--color-text)',
              letterSpacing: '-0.02em',
            }}
          >
            {rate.toFixed(1)}%
          </span>
          {delta && (
            <span
              style={{
                fontSize: '0.75rem',
                color: '#16a34a',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16a34a"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              {delta}
            </span>
          )}
        </div>
      </div>
      <p
        style={{
          fontSize: '0.8rem',
          color: 'var(--color-text-muted)',
          textAlign: 'center' as const,
          marginTop: 16,
        }}
      >
        Performance is above targets
      </p>
    </div>
  );
}

/* ── Quick Shortcuts ─────────────────────────────────────────────────────── */

function QuickShortcuts() {
  const shortcuts = [
    {
      label: 'Reschedule Flight',
      icon: (
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
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      href: '/queue',
    },
    {
      label: 'Export Logbook',
      icon: (
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
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
      href: '/reservations',
    },
    {
      label: 'Request Pilot',
      icon: (
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
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      ),
      href: '/discovery',
    },
  ];

  return (
    <div style={styles.shortcutsCard}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>Quick Shortcuts</h3>
      {shortcuts.map((s, i) => (
        <Link key={i} href={s.href} style={styles.shortcutItem}>
          <span style={{ color: 'var(--color-text-muted)' }}>{s.icon}</span>
          <span
            style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}
          >
            {s.label}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      ))}
    </div>
  );
}

/* ── Main Dashboard ────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const statsGridRef = useRef<HTMLDivElement>(null);

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
      { opacity: 0, y: 16 },
      {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
        stagger: 0.08,
      },
    );
  }, [stats]);

  return (
    <div>
      {/* Page header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Flight Schedule</h1>
          <p style={styles.pageSubtitle}>
            Manage your upcoming journeys and fleet operations with precision.
          </p>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Loading skeleton */}
      {loading ? (
        <>
          <div style={styles.statsGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="stat-card" style={{ opacity: 0.5 }}>
                <div
                  className="skeleton"
                  style={{ width: 100, height: 12, borderRadius: 4, marginBottom: 12 }}
                />
                <div className="skeleton" style={{ width: 60, height: 36, borderRadius: 6 }} />
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 24, marginBottom: 24, opacity: 0.5 }}>
            <div
              className="skeleton"
              style={{ width: 140, height: 14, borderRadius: 4, marginBottom: 16 }}
            />
            <div className="skeleton" style={{ width: '100%', height: 160, borderRadius: 8 }} />
          </div>
        </>
      ) : stats ? (
        <>
          {/* Stats cards */}
          <div ref={statsGridRef} style={styles.statsGrid}>
            {[
              {
                key: 'pending',
                label: 'Pending',
                value: stats.pendingSuggestions,
                type: 'pending' as const,
              },
              {
                key: 'approved',
                label: 'Approved\nToday',
                value: stats.approvedToday,
                type: 'approved' as const,
              },
              {
                key: 'declined',
                label: 'Declined Today',
                value: stats.declinedToday,
                type: 'declined' as const,
              },
              {
                key: 'expired',
                label: 'Expired Today',
                value: stats.expiredToday,
                type: 'expired' as const,
              },
            ].map((card) => (
              <div key={card.key} className="stat-card" style={styles.statCardInner}>
                <StatIcon type={card.type} />
                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                      fontWeight: 500,
                      marginBottom: 4,
                    }}
                  >
                    {card.label.replace('\n', ' ')}
                  </div>
                  <div
                    style={{
                      fontSize: '1.75rem',
                      fontWeight: 700,
                      color: 'var(--color-text)',
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                    }}
                  >
                    <AnimatedNumber value={card.value} pad />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Middle row: Chart + Rate + Shortcuts */}
          <div style={styles.middleRow}>
            {/* Weekly Flight Hours */}
            <div style={{ flex: '1.5 1 0', minWidth: 0 }}>
              {stats.weeklyFlightHours && stats.weeklyFlightHours.length > 0 && (
                <WeeklyFlightHoursChart data={stats.weeklyFlightHours} />
              )}
            </div>
            {/* Right column: Rate + Shortcuts */}
            <div
              style={{
                flex: '0.8 1 280px',
                display: 'flex',
                flexDirection: 'column' as const,
                gap: 20,
                minWidth: 0,
              }}
            >
              <AcceptanceRateGauge
                rate={stats.acceptanceRate ?? 0}
                delta={stats.weeklyFlightHoursDelta ? `+${stats.weeklyFlightHoursDelta}` : '+2.4%'}
              />
              <QuickShortcuts />
            </div>
          </div>

          {/* Live Weather */}
          <WeatherWidget />
        </>
      ) : null}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    marginBottom: 28,
  },
  pageTitle: {
    fontSize: '1.75rem',
    fontWeight: 800,
    color: 'var(--color-text)',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  pageSubtitle: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    marginTop: 4,
  },
  errorBox: {
    background: 'rgba(239,68,68,0.08)',
    color: '#dc2626',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 10,
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: 16,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCardInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '20px 24px',
  },
  middleRow: {
    display: 'flex',
    gap: 20,
    marginBottom: 24,
    flexWrap: 'wrap' as const,
  },
  // ── Chart styles ────────────────────────────────────────────
  chartCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    padding: 24,
    boxShadow: 'var(--shadow)',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  chartTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: 0,
  },
  chartSubtitle: {
    fontSize: '0.8rem',
    color: 'var(--color-text-muted)',
    marginTop: 2,
  },
  chartContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 12,
    height: 200,
  },
  barColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    height: '100%',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    maxWidth: 56,
    background: 'transparent',
    borderRadius: 4,
    overflow: 'visible',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-end',
  },
  barLabel: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  // ── Gauge ────────────────────────────────────────────────────
  gaugeCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    padding: 24,
    boxShadow: 'var(--shadow)',
  },
  // ── Shortcuts ────────────────────────────────────────────────
  shortcutsCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 12,
    padding: 24,
    boxShadow: 'var(--shadow)',
  },
  shortcutItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 0',
    borderBottom: '1px solid var(--color-border)',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
};
