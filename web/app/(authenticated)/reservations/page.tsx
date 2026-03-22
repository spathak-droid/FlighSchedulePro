'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import gsap from 'gsap';
import { api, ApiRequestError } from '@/lib/api';

interface Reservation {
  id: string;
  operatorId: number;
  studentId: string;
  instructorId: string | null;
  aircraftId: string | null;
  activityTypeId: string | null;
  locationId: string | null;
  startTime: string;
  endTime: string;
  status: string;
  createdAt: string;
  // Enriched fields
  studentName?: string;
  instructorName?: string;
  aircraftRegistration?: string;
  activityTypeName?: string;
  source?: string;
  approvedBy?: string;
}

interface ReservationsResponse {
  data: Reservation[];
  pagination: { page: number; pageSize: number; total: number };
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function statusColor(status: string): { bg: string; color: string } {
  switch (status) {
    case 'completed':
      return { bg: 'rgba(34,197,94,0.1)', color: '#16a34a' };
    case 'cancelled':
      return { bg: 'rgba(239,68,68,0.1)', color: '#dc2626' };
    case 'no_show':
      return { bg: 'rgba(245,158,11,0.1)', color: '#d97706' };
    default:
      return { bg: 'rgba(59,130,246,0.1)', color: '#2563eb' };
  }
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  async function fetchReservations(p: number) {
    setLoading(true);
    try {
      const res = await api.get<ReservationsResponse>('/reservations', {
        page: p,
        pageSize: 20,
      });
      setReservations(res.data);
      setTotal(res.pagination.total);
      setTotalPages(Math.ceil(res.pagination.total / res.pagination.pageSize));
      setPage(res.pagination.page);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to load reservations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReservations(1);
  }, []);

  // GSAP table animation
  useEffect(() => {
    if (!loading && tableRef.current) {
      const rows = tableRef.current.querySelectorAll('tr');
      gsap.fromTo(
        rows,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.3,
          stagger: 0.03,
          ease: 'power2.out',
        },
      );
    }
  }, [loading, reservations]);

  // Toast animation
  useEffect(() => {
    if (toast && toastRef.current) {
      gsap.fromTo(
        toastRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
      );
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      await api.del(`/reservations/${id}`);
      setToast({ message: 'Reservation cancelled', type: 'success' });
      await fetchReservations(page);
    } catch (err) {
      setToast({
        message: err instanceof ApiRequestError ? err.message : 'Failed to cancel',
        type: 'error',
      });
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Reservations</h1>
          <p style={styles.subtitle}>All booked flights and their status</p>
        </div>
        <span className="count-badge">{total}</span>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>
          <span className="spinner-pulse" />
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Loading reservations...
          </p>
        </div>
      ) : reservations.length === 0 ? (
        <div className="card" style={styles.empty}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1.5"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p
            style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: '12px' }}
          >
            No reservations yet. Book a discovery flight or approve a suggestion to create one.
          </p>
        </div>
      ) : (
        <>
          <div ref={tableRef} className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={styles.th}>Source</th>
                  <th style={styles.th}>Student / Prospect</th>
                  <th style={styles.th}>Date & Time</th>
                  <th style={styles.th}>Instructor</th>
                  <th style={styles.th}>Aircraft</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => {
                  const sc = statusColor(r.status);
                  const studentDisplay =
                    r.studentName ||
                    (r.studentId?.startsWith('prospect:')
                      ? r.studentId.slice(9)
                      : r.studentId || '—');
                  const isExpanded = expandedId === r.id;
                  const src = r.source ?? 'manual';
                  const srcColors: Record<string, { bg: string; color: string }> = {
                    waitlist: { bg: 'rgba(59,130,246,0.1)', color: '#2563eb' },
                    reschedule: { bg: 'rgba(245,158,11,0.1)', color: '#d97706' },
                    discovery: { bg: 'rgba(168,85,247,0.1)', color: '#7c3aed' },
                    next_lesson: { bg: 'rgba(34,197,94,0.1)', color: '#16a34a' },
                    manual: { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
                  };
                  const sc2 = srcColors[src] ?? srcColors.manual!;

                  const durationMs =
                    new Date(r.endTime).getTime() - new Date(r.startTime).getTime();
                  const durationMin = Math.round(durationMs / 60000);
                  const durationStr =
                    durationMin >= 60
                      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60 ? (durationMin % 60) + 'm' : ''}`
                      : `${durationMin}m`;

                  return (
                    <Fragment key={r.id}>
                      <tr
                        style={{
                          ...styles.tr,
                          cursor: 'pointer',
                          background: isExpanded ? 'var(--color-accent-glow)' : undefined,
                        }}
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      >
                        <td style={styles.td}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              textTransform: 'uppercase' as const,
                              letterSpacing: '0.04em',
                              background: sc2.bg,
                              color: sc2.color,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {src === 'next_lesson' ? 'Next Lesson' : src}
                            {r.approvedBy === 'system-auto' ? ' (auto)' : ''}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>
                            {studentDisplay}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={{ fontSize: '0.85rem' }}>{formatDateTime(r.startTime)}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            to {formatDateTime(r.endTime)}
                          </div>
                        </td>
                        <td style={styles.td}>{r.instructorName || r.instructorId || '—'}</td>
                        <td style={styles.td}>{r.aircraftRegistration || r.aircraftId || '—'}</td>
                        <td style={styles.td}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: '10px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              textTransform: 'uppercase' as const,
                              letterSpacing: '0.04em',
                              background: sc.bg,
                              color: sc.color,
                            }}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '8px',
                            }}
                          >
                            {r.status === 'completed' ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: '#dc2626', fontSize: '0.75rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancel(r.id);
                                }}
                                disabled={cancellingId === r.id}
                              >
                                {cancellingId === r.id ? 'Cancelling...' : 'Cancel'}
                              </button>
                            ) : (
                              <span />
                            )}
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--color-text-muted)"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{
                                transition: 'transform 0.2s',
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                flexShrink: 0,
                              }}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div style={styles.expandPanel}>
                              <div style={styles.expandGrid}>
                                <div style={styles.expandSection}>
                                  <div style={styles.expandLabel}>Duration</div>
                                  <div style={styles.expandValue}>{durationStr}</div>
                                </div>
                                <div style={styles.expandSection}>
                                  <div style={styles.expandLabel}>Activity Type</div>
                                  <div style={styles.expandValue}>
                                    {r.activityTypeName || r.activityTypeId || '—'}
                                  </div>
                                </div>
                                <div style={styles.expandSection}>
                                  <div style={styles.expandLabel}>Instructor</div>
                                  <div style={styles.expandValue}>{r.instructorName || '—'}</div>
                                  {r.instructorId && (
                                    <div style={styles.expandMeta}>{r.instructorId}</div>
                                  )}
                                </div>
                                <div style={styles.expandSection}>
                                  <div style={styles.expandLabel}>Aircraft</div>
                                  <div style={styles.expandValue}>
                                    {r.aircraftRegistration || '—'}
                                  </div>
                                  {r.aircraftId && (
                                    <div style={styles.expandMeta}>{r.aircraftId}</div>
                                  )}
                                </div>
                                <div style={styles.expandSection}>
                                  <div style={styles.expandLabel}>Student / Prospect</div>
                                  <div style={styles.expandValue}>{studentDisplay}</div>
                                  {r.studentId && (
                                    <div style={styles.expandMeta}>{r.studentId}</div>
                                  )}
                                </div>
                                <div style={styles.expandSection}>
                                  <div style={styles.expandLabel}>Created</div>
                                  <div style={styles.expandValue}>
                                    {formatDateTime(r.createdAt)}
                                  </div>
                                </div>
                                <div style={styles.expandSection}>
                                  <div style={styles.expandLabel}>Location</div>
                                  <div style={styles.expandValue}>{r.locationId || '—'}</div>
                                </div>
                                <div style={styles.expandSection}>
                                  <div style={styles.expandLabel}>Reservation ID</div>
                                  <div style={{ ...styles.expandMeta, wordBreak: 'break-all' }}>
                                    {r.id}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                className="btn btn-outline btn-sm"
                disabled={page <= 1}
                onClick={() => fetchReservations(page - 1)}
              >
                Previous
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={page >= totalPages}
                onClick={() => fetchReservations(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {toast && (
        <div
          ref={toastRef}
          className={`dark-toast ${toast.type === 'success' ? 'dark-toast-success' : 'dark-toast-error'}`}
        >
          <span>{toast.type === 'success' ? '\u2713' : '\u2717'}</span>
          {toast.message}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '1100px', paddingBottom: '48px' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: { fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '4px' },
  errorBox: {
    background: 'var(--color-danger-glow)',
    color: '#dc2626',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: '16px',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    gap: '16px',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '60px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 16px',
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)',
  },
  tr: { borderBottom: '1px solid var(--color-border)' },
  td: { padding: '14px 16px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '20px',
    padding: '16px',
  },
  expandPanel: {
    padding: '16px 24px 20px',
    background: 'var(--color-surface-elevated)',
    borderBottom: '1px solid var(--color-border)',
  },
  expandGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
  },
  expandSection: { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  expandLabel: {
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
  },
  expandValue: { fontSize: '0.85rem', color: 'var(--color-text)' },
  expandMeta: { fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' },
};
