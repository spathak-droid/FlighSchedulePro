'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import type { DisruptionEvent, DisruptionsResponse } from '@/lib/types';

export default function DisruptionBanner() {
  const [disruptions, setDisruptions] = useState<DisruptionEvent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const fetchDisruptions = useCallback(async () => {
    try {
      const res = await api.get<DisruptionsResponse>('/disruptions');
      setDisruptions(res.data);
      setError('');
    } catch (err) {
      if (err instanceof ApiRequestError && err.status !== 401) {
        setError('Failed to load disruptions');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDisruptions();
    // Poll every 2 minutes
    const interval = setInterval(fetchDisruptions, 120_000);
    return () => clearInterval(interval);
  }, [fetchDisruptions]);

  async function handleScan() {
    setScanning(true);
    try {
      await api.post<unknown>('/disruptions/scan', {});
      await fetchDisruptions();
    } catch {
      setError('Scan failed');
    } finally {
      setScanning(false);
    }
  }

  async function handleResolve(id: string) {
    try {
      await api.post<unknown>(`/disruptions/${id}/resolve`, {});
      await fetchDisruptions();
    } catch {
      setError('Failed to resolve disruption');
    }
  }

  if (loading || disruptions.length === 0) {
    return null;
  }

  const criticalCount = disruptions.filter(
    (d) => d.severity === 'critical' || d.severity === 'grounded',
  ).length;
  const warningCount = disruptions.filter((d) => d.severity === 'warning').length;
  const isCritical = criticalCount > 0;

  return (
    <div style={isCritical ? bannerStyles.containerCritical : bannerStyles.containerWarning}>
      {/* Summary bar */}
      <div
        style={bannerStyles.summaryRow}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded);
        }}
      >
        <div style={bannerStyles.summaryLeft}>
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
          <span style={bannerStyles.summaryText}>
            <strong>{disruptions.length}</strong> active disruption
            {disruptions.length !== 1 ? 's' : ''}
            {criticalCount > 0 && (
              <span style={bannerStyles.criticalBadge}>{criticalCount} critical</span>
            )}
            {warningCount > 0 && (
              <span style={bannerStyles.warningBadge}>{warningCount} warning</span>
            )}
          </span>
        </div>
        <div style={bannerStyles.summaryRight}>
          <button
            style={bannerStyles.scanButton}
            onClick={(e) => {
              e.stopPropagation();
              handleScan();
            }}
            disabled={scanning}
          >
            {scanning ? 'Scanning...' : 'Rescan'}
          </button>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Error */}
      {error && <div style={bannerStyles.errorText}>{error}</div>}

      {/* Expanded detail list */}
      {expanded && (
        <div style={bannerStyles.detailList}>
          {disruptions.map((d) => (
            <div key={d.id} style={bannerStyles.detailItem}>
              <div style={bannerStyles.detailHeader}>
                <span
                  style={{
                    ...bannerStyles.severityDot,
                    background:
                      d.severity === 'grounded'
                        ? '#ef4444'
                        : d.severity === 'critical'
                          ? '#dc2626'
                          : '#d97706',
                  }}
                />
                <span style={bannerStyles.detailType}>{d.type.toUpperCase()}</span>
                <span style={bannerStyles.detailTitle}>{d.title}</span>
                <span style={bannerStyles.severityLabel}>{d.severity}</span>
              </div>
              {d.description && <p style={bannerStyles.detailDescription}>{d.description}</p>}
              <div style={bannerStyles.detailMeta}>
                {d.affectedAircraftIds.length > 0 && (
                  <span style={bannerStyles.metaTag}>{d.affectedAircraftIds.length} aircraft</span>
                )}
                {d.affectedStudentIds.length > 0 && (
                  <span style={bannerStyles.metaTag}>
                    {d.affectedStudentIds.length} student
                    {d.affectedStudentIds.length !== 1 ? 's' : ''}
                  </span>
                )}
                {d.affectedReservationIds.length > 0 && (
                  <span style={bannerStyles.metaTag}>
                    {d.affectedReservationIds.length} reservation
                    {d.affectedReservationIds.length !== 1 ? 's' : ''}
                  </span>
                )}
                {d.locationId && <span style={bannerStyles.metaTag}>{d.locationId}</span>}
                <button style={bannerStyles.resolveButton} onClick={() => handleResolve(d.id)}>
                  Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const bannerStyles: Record<string, React.CSSProperties> = {
  containerCritical: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
    marginBottom: '16px',
    overflow: 'hidden',
  },
  containerWarning: {
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: '10px',
    marginBottom: '16px',
    overflow: 'hidden',
  },
  summaryRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  summaryLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  summaryText: {
    fontSize: '0.875rem',
    color: 'var(--color-text)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  criticalBadge: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#dc2626',
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '999px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  warningBadge: {
    background: 'rgba(245, 158, 11, 0.2)',
    color: '#f59e0b',
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '999px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  summaryRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  scanButton: {
    background: 'rgba(255, 255, 255, 0.6)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    color: 'var(--color-text-secondary)',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '4px 10px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },
  errorText: {
    fontSize: '0.75rem',
    color: '#dc2626',
    padding: '0 16px 8px',
  },
  detailList: {
    borderTop: '1px solid var(--color-border)',
    padding: '8px 16px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  detailItem: {
    background: 'rgba(255, 255, 255, 0.5)',
    borderRadius: '8px',
    padding: '10px 14px',
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  severityDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  detailType: {
    fontSize: '0.65rem',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
  },
  detailTitle: {
    fontSize: '0.825rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    flex: 1,
  },
  severityLabel: {
    fontSize: '0.65rem',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'var(--color-surface-elevated)',
  },
  detailDescription: {
    fontSize: '0.775rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    margin: '4px 0 8px 16px',
  },
  detailMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap' as const,
    marginLeft: '16px',
  },
  metaTag: {
    fontSize: '0.675rem',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface-elevated)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  resolveButton: {
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#16a34a',
    background: 'var(--color-success-glow)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    borderRadius: '4px',
    padding: '2px 8px',
    cursor: 'pointer',
    marginLeft: 'auto',
    transition: 'background 0.15s ease',
  },
};
