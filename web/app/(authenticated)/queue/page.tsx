'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import gsap from 'gsap';
import { api, ApiRequestError } from '@/lib/api';
import type {
  Suggestion,
  SuggestionFilters,
  PaginatedResponse,
  BulkActionResponse,
} from '@/lib/types';
import FilterBar from '@/components/filter-bar';
import SuggestionTable from '@/components/suggestion-table';
import DisruptionBanner from '@/components/disruption-banner';

interface SimulationStatus {
  running: boolean;
  eventCount: number;
  startedAt: string | null;
  lastEventAt: string | null;
  lastEventType: string | null;
}

export default function QueuePage() {
  // Data
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  // Filters
  const [filters, setFilters] = useState<SuggestionFilters>({ status: 'pending', page: 1 });

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Action state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Simulation
  const [simRunning, setSimRunning] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simEventCount, setSimEventCount] = useState(0);
  const [simLastEvent, setSimLastEvent] = useState<string | null>(null);

  // Modals
  const [showBulkDeclineModal, setShowBulkDeclineModal] = useState(false);
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [bulkDeclineReason, setBulkDeclineReason] = useState('');
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkActionResponse | null>(null);

  // Refs
  const bulkBarRef = useRef<HTMLDivElement>(null);
  const prevHasSelection = useRef(false);
  const simPulseRef = useRef<HTMLSpanElement>(null);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number | boolean | undefined> = {
        page: filters.page || currentPage,
        pageSize,
      };
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;

      const res = await api.get<PaginatedResponse<Suggestion>>('/suggestions', params);
      const sorted = [...res.data].sort((a, b) => {
        const scoreA = a.rankingScore ?? 0;
        const scoreB = b.rankingScore ?? 0;
        return scoreB - scoreA;
      });
      setSuggestions(sorted);
      setTotalCount(res.pagination.total);
      setCurrentPage(res.pagination.page);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Failed to load suggestions.');
      }
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, pageSize]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  // Check simulation status on mount
  useEffect(() => {
    api.get<{ data: SimulationStatus }>('/simulation/status')
      .then((res) => {
        setSimRunning(res.data.running);
        setSimEventCount(res.data.eventCount);
        setSimLastEvent(res.data.lastEventType);
      })
      .catch(() => {});
  }, []);

  // Auto-refresh when simulation is running (every 5 seconds)
  useEffect(() => {
    if (!simRunning) return;

    const interval = setInterval(async () => {
      // Refresh suggestions silently (no loading spinner)
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          page: filters.page || currentPage,
          pageSize,
        };
        if (filters.status) params.status = filters.status;
        if (filters.type) params.type = filters.type;
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;

        const res = await api.get<PaginatedResponse<Suggestion>>('/suggestions', params);
        const sorted = [...res.data].sort((a, b) => {
          const scoreA = a.rankingScore ?? 0;
          const scoreB = b.rankingScore ?? 0;
          return scoreB - scoreA;
        });
        setSuggestions(sorted);
        setTotalCount(res.pagination.total);
      } catch {
        // Silent fail on auto-refresh
      }

      // Also poll simulation status
      try {
        const statusRes = await api.get<{ data: SimulationStatus }>('/simulation/status');
        setSimEventCount(statusRes.data.eventCount);
        setSimLastEvent(statusRes.data.lastEventType);
        if (!statusRes.data.running) {
          setSimRunning(false);
        }
      } catch {
        // Silent fail
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [simRunning, filters, currentPage, pageSize]);

  // Pulse animation on simulation indicator
  useEffect(() => {
    if (simRunning && simPulseRef.current) {
      gsap.fromTo(
        simPulseRef.current,
        { scale: 1, opacity: 1 },
        { scale: 1.5, opacity: 0, duration: 1.5, repeat: -1, ease: 'power2.out' }
      );
    }
  }, [simRunning]);

  // Clear messages after a delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // GSAP: bulk toolbar slide up/down
  useEffect(() => {
    const hasSelection = selectedIds.size > 0;
    if (hasSelection && !prevHasSelection.current && bulkBarRef.current) {
      gsap.fromTo(
        bulkBarRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      );
    }
    prevHasSelection.current = hasSelection;
  }, [selectedIds]);

  // Handlers
  function handleFilterChange(newFilters: SuggestionFilters) {
    setSelectedIds(new Set());
    setFilters(newFilters);
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleSelectAll() {
    const pendingIds = suggestions.filter((s) => s.status === 'pending').map((s) => s.id);
    const allSelected = pendingIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingIds));
    }
  }

  async function handleApprove(id: string) {
    setActionLoadingId(id);
    setError('');
    try {
      await api.post(`/suggestions/${id}/approve`, {});
      setSuccessMessage('Suggestion approved — reservation created and notification sent.');
      await fetchSuggestions();
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`Approve failed: ${err.message}`);
      } else {
        setError('Failed to approve suggestion.');
      }
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDecline(id: string) {
    setActionLoadingId(id);
    setError('');
    try {
      await api.post(`/suggestions/${id}/decline`, {});
      setSuccessMessage('Suggestion declined.');
      await fetchSuggestions();
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`Decline failed: ${err.message}`);
      } else {
        setError('Failed to decline suggestion.');
      }
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleBulkApprove() {
    setShowBulkApproveModal(false);
    setBulkLoading(true);
    setError('');
    try {
      const res = await api.post<BulkActionResponse>('/suggestions/bulk-approve', {
        suggestionIds: Array.from(selectedIds),
      });
      setBulkResults(res);
      setSelectedIds(new Set());
      await fetchSuggestions();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`Bulk approve failed: ${err.message}`);
      } else {
        setError('Failed to bulk approve suggestions.');
      }
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkDecline() {
    setShowBulkDeclineModal(false);
    setBulkLoading(true);
    setError('');
    try {
      const res = await api.post<BulkActionResponse>('/suggestions/bulk-decline', {
        suggestionIds: Array.from(selectedIds),
        reason: bulkDeclineReason || undefined,
      });
      setBulkResults(res);
      setSelectedIds(new Set());
      setBulkDeclineReason('');
      await fetchSuggestions();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`Bulk decline failed: ${err.message}`);
      } else {
        setError('Failed to bulk decline suggestions.');
      }
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleSimToggle() {
    setSimLoading(true);
    setError('');
    try {
      if (simRunning) {
        await api.post('/simulation/stop', {});
        setSimRunning(false);
        setSuccessMessage(`Simulation stopped after ${simEventCount} events`);
      } else {
        await api.post('/simulation/start', { intervalSeconds: 20 });
        setSimRunning(true);
        setSimEventCount(0);
        setSuccessMessage('Simulation started — watch the queue fill with real events');
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Failed to toggle simulation.');
      }
    } finally {
      setSimLoading(false);
    }
  }

  const EVENT_LABELS: Record<string, string> = {
    cancellation: 'Cancellation',
    weather: 'Weather',
    completion: 'Flight Complete',
    no_show: 'No-Show',
    maintenance: 'Maintenance',
    instructor_out: 'Instructor Out',
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const hasSelection = selectedIds.size > 0;

  return (
    <div>
        {/* Page header */}
        <div style={styles.pageHeader}>
          <div style={styles.pageTitleRow}>
            <h1 style={styles.pageTitle}>Approval Queue</h1>
            <span className="count-badge">{totalCount}</span>
          </div>
          <div style={styles.simControls}>
            {/* Simulation status indicator */}
            {simRunning && (
              <div style={styles.simStatus}>
                <span style={styles.simPulseWrapper}>
                  <span ref={simPulseRef} style={styles.simPulseRing} />
                  <span style={styles.simDot} />
                </span>
                <span style={styles.simStatusText}>
                  Live — {simEventCount} event{simEventCount === 1 ? '' : 's'}
                  {simLastEvent && (
                    <span style={styles.simLastEvent}>
                      {' '}· last: {EVENT_LABELS[simLastEvent] ?? simLastEvent}
                    </span>
                  )}
                </span>
              </div>
            )}
            <button
              className={simRunning ? 'btn btn-danger btn-sm' : 'btn btn-sm'}
              onClick={handleSimToggle}
              disabled={simLoading}
              style={simRunning ? styles.simButtonStop : styles.simButtonStart}
            >
              {simLoading ? (
                <span className="spinner" style={{ width: 14, height: 14 }} />
              ) : simRunning ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Stop Simulation
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Start Simulation
                </>
              )}
            </button>
          </div>
        </div>

        {/* Simulation info banner */}
        {simRunning && (
          <div style={styles.simBanner}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              Simulation active — generating cancellations, weather events, completions, and more every 20s.
              Queue auto-refreshes every 5s. AI enrichment runs on each new suggestion.
            </span>
          </div>
        )}

        {/* Messages */}
        {error && <div style={styles.errorBox}>{error}</div>}
        {successMessage && <div style={styles.successBox}>{successMessage}</div>}

        {/* Disruption banner */}
        <DisruptionBanner />

        {/* Filter bar */}
        <div style={styles.filterSection}>
          <FilterBar initialFilters={filters} onChange={handleFilterChange} />
        </div>

        {/* Table */}
        <SuggestionTable
          suggestions={suggestions}
          loading={loading}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onApprove={handleApprove}
          onDecline={handleDecline}
          actionLoadingId={actionLoadingId}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              className="btn btn-outline btn-sm"
              disabled={currentPage <= 1}
              onClick={() => setFilters({ ...filters, page: currentPage - 1 })}
            >
              Previous
            </button>
            <span style={styles.pageInfo}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="btn btn-outline btn-sm"
              disabled={currentPage >= totalPages}
              onClick={() => setFilters({ ...filters, page: currentPage + 1 })}
            >
              Next
            </button>
          </div>
        )}

      {/* Bulk action toolbar — sticky bottom */}
      {hasSelection && (
        <div ref={bulkBarRef} style={styles.bulkBar}>
          <div style={styles.bulkInner}>
            <span style={styles.bulkText}>
              <span style={styles.bulkCount}>{selectedIds.size}</span> selected
            </span>
            <div style={styles.bulkActions}>
              <button
                className="btn btn-success btn-sm"
                onClick={() => setShowBulkApproveModal(true)}
                disabled={bulkLoading}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                Approve All
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setShowBulkDeclineModal(true)}
                disabled={bulkLoading}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                Decline All
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </button>
              {bulkLoading && <span className="spinner" />}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Approve Confirmation Modal */}
      {showBulkApproveModal && (
        <div className="modal-overlay" onClick={() => setShowBulkApproveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Bulk Approve</h3>
            <p style={styles.modalText}>
              You are about to approve <strong style={{ color: 'var(--color-text)' }}>{selectedIds.size}</strong> suggestion
              {selectedIds.size === 1 ? '' : 's'}. Each will create a reservation in FSP.
            </p>
            <p style={styles.modalWarning}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              This action cannot be undone from this console.
            </p>
            <div style={styles.modalActions}>
              <button className="btn btn-ghost" onClick={() => setShowBulkApproveModal(false)}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handleBulkApprove}>
                Approve All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Decline Modal with Reason */}
      {showBulkDeclineModal && (
        <div className="modal-overlay" onClick={() => setShowBulkDeclineModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Decline Selected Suggestions</h3>
            <p style={styles.modalText}>
              You are about to decline <strong style={{ color: 'var(--color-text)' }}>{selectedIds.size}</strong> suggestion
              {selectedIds.size === 1 ? '' : 's'}.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="bulk-decline-reason">Reason (optional)</label>
              <textarea
                id="bulk-decline-reason"
                className="input"
                rows={3}
                value={bulkDeclineReason}
                onChange={(e) => setBulkDeclineReason(e.target.value)}
                placeholder="Enter a reason for declining these suggestions..."
                style={{ resize: 'vertical' as const }}
              />
            </div>
            <div style={styles.modalActions}>
              <button className="btn btn-ghost" onClick={() => setShowBulkDeclineModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleBulkDecline}>
                Decline All
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  pageTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pageTitle: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  simControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  simStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px',
    borderRadius: '20px',
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)',
  },
  simPulseWrapper: {
    position: 'relative' as const,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '12px',
    height: '12px',
  },
  simPulseRing: {
    position: 'absolute' as const,
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: 'rgba(34,197,94,0.4)',
  },
  simDot: {
    position: 'relative' as const,
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#22c55e',
  },
  simStatusText: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#16a34a',
    fontVariantNumeric: 'tabular-nums',
  },
  simLastEvent: {
    fontWeight: 400,
    color: '#15803d',
  },
  simButtonStart: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    color: '#fff',
    border: 'none',
    fontWeight: 600,
  },
  simButtonStop: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  simBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    marginBottom: '12px',
    borderRadius: '10px',
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.2)',
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
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
  successBox: {
    background: 'var(--color-success-glow)',
    color: '#16a34a',
    border: '1px solid rgba(34,197,94,0.2)',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: '12px',
  },
  filterSection: {
    marginBottom: '16px',
  },
  bulkBar: {
    position: 'fixed' as const,
    bottom: '0',
    left: 'var(--sidebar-width)',
    right: '0',
    background: 'var(--color-surface)',
    borderTop: '1px solid var(--color-border)',
    padding: '12px 32px',
    zIndex: 50,
    backdropFilter: 'blur(12px)',
  },
  bulkInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: '1200px',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  bulkText: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
  },
  bulkCount: {
    color: 'var(--color-accent)',
    fontWeight: 700,
    fontSize: '1rem',
  },
  bulkActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '20px',
    padding: '16px',
  },
  pageInfo: {
    fontSize: '0.85rem',
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  modalText: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    marginBottom: '8px',
    lineHeight: 1.6,
  },
  modalWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.8rem',
    color: '#d97706',
    marginBottom: '20px',
    padding: '10px 14px',
    background: 'var(--color-warning-glow)',
    border: '1px solid rgba(245,158,11,0.2)',
    borderRadius: '8px',
  },
  modalActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '20px',
  },
  resultsGrid: {
    display: 'flex',
    gap: '32px',
    justifyContent: 'center',
    padding: '24px 0',
  },
  resultItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },
  resultLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
  },
  failedList: {
    marginTop: '16px',
    padding: '14px',
    background: 'var(--color-danger-glow)',
    border: '1px solid rgba(239,68,68,0.15)',
    borderRadius: '10px',
  },
  failedTitle: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#dc2626',
    marginBottom: '8px',
  },
  failedItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '0.8rem',
    borderBottom: '1px solid rgba(239,68,68,0.1)',
  },
  failedId: {
    fontFamily: 'monospace',
    color: 'var(--color-text-muted)',
    fontSize: '0.75rem',
  },
  failedError: {
    color: '#dc2626',
  },
};
