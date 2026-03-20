'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { FlightAlert, FlightAlertSeverity } from '@/lib/types';

const SEVERITY_COLORS: Record<FlightAlertSeverity, { dot: string; bg: string; border: string }> = {
  critical: { dot: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.2)' },
  warning:  { dot: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.2)' },
  info:     { dot: '#15803d', bg: 'rgba(21,128,61,0.08)', border: 'rgba(21,128,61,0.2)' },
};

const TYPE_LABELS: Record<string, string> = {
  overdue_return: 'Overdue Return',
  safety: 'Safety',
  maintenance_due: 'Maintenance',
  weather_hold: 'Weather Hold',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | FlightAlertSeverity>('all');
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get<{ data: FlightAlert[] }>('/flight-alerts');
      const data = Array.isArray(res) ? res : (res as { data: FlightAlert[] }).data ?? [];
      setAlerts(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load alerts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  async function handleResolve(id: string) {
    setResolving(id);
    try {
      await api.post(`/flight-alerts/${id}/resolve`, {});
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // ignore
    } finally {
      setResolving(null);
    }
  }

  const filtered = filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter);

  const counts = {
    all: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    info: alerts.filter((a) => a.severity === 'info').length,
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.02em' }}>
          Flight Alerts
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Active alerts across your fleet and operations.
        </p>
      </div>

      {error && (
        <div style={{
          background: 'rgba(220,38,38,0.08)',
          color: '#dc2626',
          border: '1px solid rgba(220,38,38,0.2)',
          borderRadius: 10,
          padding: '12px 16px',
          fontSize: '0.875rem',
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['all', 'critical', 'warning', 'info'] as const).map((key) => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: '1px solid',
                borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
                background: isActive ? 'var(--color-accent)' : 'var(--color-surface)',
                color: isActive ? '#fff' : 'var(--color-text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1)}
              <span style={{
                background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--color-surface-elevated)',
                padding: '1px 7px',
                borderRadius: 10,
                fontSize: '0.7rem',
              }}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ padding: 20, opacity: 0.5 }}>
              <div className="skeleton" style={{ width: 200, height: 14, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: 300, height: 12, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            {filter === 'all' ? 'No active alerts — all clear.' : `No ${filter} alerts.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((alert) => {
            const sev = SEVERITY_COLORS[alert.severity];
            return (
              <div
                key={alert.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  borderLeft: `3px solid ${sev.dot}`,
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: sev.dot,
                  flexShrink: 0,
                  marginTop: 5,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)' }}>
                      {alert.title}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: sev.bg,
                      color: sev.dot,
                      border: `1px solid ${sev.border}`,
                    }}>
                      {alert.severity}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--color-text-muted)',
                    }}>
                      {TYPE_LABELS[alert.alertType] ?? alert.alertType}
                    </span>
                  </div>
                  {alert.description && (
                    <p style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', margin: '4px 0 8px', lineHeight: 1.5 }}>
                      {alert.description}
                    </p>
                  )}
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    {new Date(alert.createdAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                </div>
                <button
                  onClick={() => handleResolve(alert.id)}
                  disabled={resolving === alert.id}
                  className="btn btn-ghost btn-sm"
                  style={{
                    flexShrink: 0,
                    color: 'var(--color-accent)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                  }}
                >
                  {resolving === alert.id ? 'Resolving...' : 'Resolve'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
