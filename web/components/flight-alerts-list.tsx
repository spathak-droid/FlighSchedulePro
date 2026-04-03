'use client';

import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { api } from '@/lib/api';
import type { FlightAlert } from '@/lib/types';

interface AlertsResponse {
  data: FlightAlert[];
}

interface ResolveResponse {
  data: FlightAlert;
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  info: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', label: 'Info' },
  warning: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Warning' },
  critical: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Critical' },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  overdue_return: 'Overdue Return',
  safety: 'Safety',
  maintenance_due: 'Maintenance Due',
  weather_hold: 'Weather Hold',
};

function SeverityIcon({ severity }: { severity: string }) {
  const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info!;

  if (severity === 'critical') {
    return (
      <div style={{ ...styles.iconWrapper, backgroundColor: config.bg, color: config.color }}>
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
    );
  }

  if (severity === 'warning') {
    return (
      <div style={{ ...styles.iconWrapper, backgroundColor: config.bg, color: config.color }}>
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
    );
  }

  // info
  return (
    <div style={{ ...styles.iconWrapper, backgroundColor: config.bg, color: config.color }}>
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
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </div>
  );
}

export default function FlightAlertsList() {
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hasAnimatedAlerts = useRef(false);

  useEffect(() => {
    fetchAlerts();
  }, []);

  async function fetchAlerts() {
    try {
      const res = await api.get<AlertsResponse>('/flight-alerts');
      setAlerts(res.data);
    } catch {
      setError('Failed to load flight alerts.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(alertId: string) {
    setResolving(alertId);
    try {
      await api.post<ResolveResponse>(`/flight-alerts/${alertId}/resolve`, {});
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      setError('Failed to resolve alert.');
    } finally {
      setResolving(null);
    }
  }

  // GSAP animation for alert items
  useEffect(() => {
    if (!alerts.length || !listRef.current || collapsed) return;
    const items = listRef.current.querySelectorAll('.alert-item');
    if (hasAnimatedAlerts.current) {
      gsap.set(items, { opacity: 1, x: 0 });
      return;
    }
    hasAnimatedAlerts.current = true;
    gsap.fromTo(
      items,
      { opacity: 0, x: -8 },
      {
        opacity: 1,
        x: 0,
        duration: 0.3,
        ease: 'power2.out',
        stagger: 0.08,
      },
    );
  }, [alerts, collapsed]);

  function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>Flight Alerts</h3>
        </div>
        <div style={{ padding: '16px 0' }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ ...styles.alertItem, opacity: 0.5 }}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <div
                  className="skeleton"
                  style={{ width: 200, height: 12, borderRadius: 4, marginBottom: 8 }}
                />
                <div className="skeleton" style={{ width: 140, height: 10, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !alerts.length) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>Flight Alerts</h3>
        </div>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 style={styles.title}>Flight Alerts</h3>
          {alerts.length > 0 && <span style={styles.badge}>{alerts.length}</span>}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="btn btn-sm"
          style={styles.collapseBtn}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {!collapsed && (
        <div ref={listRef}>
          {alerts.length === 0 ? (
            <div style={styles.emptyState}>No active alerts — all clear</div>
          ) : (
            alerts.map((alert) => {
              const config = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info!;
              return (
                <div
                  key={alert.id}
                  className="alert-item"
                  style={{
                    ...styles.alertItem,
                    borderLeftColor: config.color,
                  }}
                >
                  <SeverityIcon severity={alert.severity} />

                  <div style={styles.alertContent}>
                    <div style={styles.alertTitleRow}>
                      <span style={styles.alertTitle}>{alert.title}</span>
                      <span
                        style={{
                          ...styles.severityBadge,
                          color: config.color,
                          backgroundColor: config.bg,
                        }}
                      >
                        {config.label}
                      </span>
                    </div>

                    {alert.description && <p style={styles.alertDesc}>{alert.description}</p>}

                    <div style={styles.alertMeta}>
                      <span style={styles.alertType}>
                        {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                      </span>
                      <span style={styles.alertTime}>{formatTimeAgo(alert.createdAt)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleResolve(alert.id)}
                    disabled={resolving === alert.id}
                    className="btn btn-sm"
                    style={styles.resolveBtn}
                  >
                    {resolving === alert.id ? 'Resolving...' : 'Resolve'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
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
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  title: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    padding: '0 6px',
    borderRadius: '11px',
    backgroundColor: '#ef4444',
    color: '#fff',
    fontSize: '0.7rem',
    fontWeight: 700,
  },
  collapseBtn: {
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
    marginBottom: '12px',
  },
  emptyState: {
    padding: '20px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted)',
    fontSize: '0.85rem',
    fontStyle: 'italic',
    background: 'var(--color-surface)',
    borderRadius: '10px',
    border: '1px solid var(--color-border)',
  },
  alertItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '14px 16px',
    marginBottom: '8px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderLeft: '3px solid #3b82f6',
    borderRadius: '10px',
    transition: 'box-shadow 0.15s ease',
  },
  iconWrapper: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertContent: {
    flex: 1,
    minWidth: 0,
  },
  alertTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
    flexWrap: 'wrap' as const,
  },
  alertTitle: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  severityBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },
  alertDesc: {
    fontSize: '0.78rem',
    color: 'var(--color-text-secondary)',
    margin: '4px 0 6px',
    lineHeight: 1.45,
  },
  alertMeta: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  alertType: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  alertTime: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
  },
  resolveBtn: {
    fontSize: '0.75rem',
    padding: '6px 14px',
    background: 'rgba(34, 197, 94, 0.12)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '6px',
    color: '#22c55e',
    cursor: 'pointer',
    fontWeight: 500,
    flexShrink: 0,
    alignSelf: 'center',
    whiteSpace: 'nowrap' as const,
  },
};
