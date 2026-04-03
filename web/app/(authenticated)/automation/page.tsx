'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import gsap from 'gsap';
import { api } from '@/lib/api';

interface PipelineData {
  simulation: { running: boolean; eventCount: number; lastEventType: string | null };
  pipeline: { pending: number; approved: number; declined: number; expired: number; processing: number };
  aiEnrichment: { enriched: number; waiting: number };
  riskBreakdown: Array<{ level: string; count: number }>;
  recentAutoApprove: Array<{ id: string; type: string; data: Record<string, unknown>; timestamp: string }>;
  recentEvents: Array<{ id: string; type: string; data: Record<string, unknown>; timestamp: string }>;
  recentReservations: Array<{ id: string; studentId: string; status: string; startTime: string; timestamp: string }>;
}

function relTime(ts: string): string {
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

const EVENT_ICONS: Record<string, string> = {
  flight_cancelled: 'X',
  student_no_show: '!',
  maintenance_alert: 'W',
  instructor_unavailable: 'P',
  flight_completed: 'C',
  disruption_detected: 'D',
};

const EVENT_COLORS: Record<string, string> = {
  flight_cancelled: '#ef4444',
  student_no_show: '#f59e0b',
  maintenance_alert: '#f59e0b',
  instructor_unavailable: '#8b5cf6',
  flight_completed: '#22c55e',
  disruption_detected: '#ef4444',
};

const EVENT_LABELS: Record<string, string> = {
  flight_cancelled: 'Cancellation',
  student_no_show: 'No-Show',
  maintenance_alert: 'Maintenance',
  instructor_unavailable: 'Instructor Out',
  flight_completed: 'Flight Done',
  disruption_detected: 'Disruption',
};

export default function AutomationPage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [riskThreshold, setRiskThreshold] = useState<'low' | 'medium'>('low');
  const flowRef = useRef<HTMLDivElement>(null);
  const prevEventCount = useRef(0);

  const fetchPipeline = useCallback(async () => {
    try {
      const res = await api.get<{ data: PipelineData }>('/simulation/pipeline');
      setData(res.data);
      setSimRunning(res.data.simulation.running);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchPipeline();
    const interval = setInterval(fetchPipeline, 2000);
    return () => clearInterval(interval);
  }, [fetchPipeline]);

  // Animate new events
  useEffect(() => {
    if (!data || !flowRef.current) return;
    const total = data.recentEvents.length + data.recentAutoApprove.length;
    if (total > prevEventCount.current) {
      const newItems = flowRef.current.querySelectorAll('.flow-event-new');
      if (newItems.length > 0) {
        gsap.fromTo(newItems, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.7)', stagger: 0.05 });
      }
    }
    prevEventCount.current = total;
  }, [data]);

  async function handleSimToggle() {
    setSimLoading(true);
    try {
      if (simRunning) {
        await api.post('/simulation/stop', {});
        setSimRunning(false);
      } else {
        await api.post('/simulation/start', { intervalSeconds: 10 });
        setSimRunning(true);
      }
    } catch (err) {
      console.error('Simulation toggle failed:', err);
      // Force refresh state from server
      try {
        const res = await api.get<{ data: PipelineData }>('/simulation/pipeline');
        setSimRunning(res.data.simulation.running);
      } catch { /* give up */ }
    } finally {
      setSimLoading(false);
    }
  }

  async function handleThresholdChange(val: 'low' | 'medium') {
    setRiskThreshold(val);
    try {
      await api.post('/feature-flags/toggle', { flagName: 'auto_approve', enabled: true, config: { riskThreshold: val } });
    } catch { /* silent */ }
  }

  const p = data?.pipeline;
  const ai = data?.aiEnrichment;
  const risks = data?.riskBreakdown ?? [];
  const riskMap: Record<string, number> = {};
  risks.forEach((r) => { riskMap[r.level] = r.count; });

  return (
    <div>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Automation Pipeline</h1>
          <p style={s.subtitle}>Live view of the scheduling automation engine</p>
        </div>
        <div style={s.controls}>
          <div style={s.thresholdControl}>
            <span style={s.thresholdLabel}>Auto-approve threshold:</span>
            <select
              className="input"
              style={{ width: 140, fontSize: '0.8rem' }}
              value={riskThreshold}
              onChange={(e) => handleThresholdChange(e.target.value as 'low' | 'medium')}
            >
              <option value="low">Low risk only</option>
              <option value="medium">Low + Medium</option>
            </select>
          </div>
          <button
            className={simRunning ? 'btn btn-danger btn-sm' : 'btn btn-sm'}
            onClick={handleSimToggle}
            disabled={simLoading}
            style={simRunning ? s.stopBtn : s.startBtn}
          >
            {simLoading ? '...' : simRunning ? 'Stop Simulation' : 'Start Simulation'}
          </button>
        </div>
      </div>

      {/* Pipeline Flow */}
      <div ref={flowRef} style={s.flowContainer}>
        {/* Row 1: Pipeline stages */}
        <div style={s.stagesRow}>
          <Stage label="Events Detected" count={data?.recentEvents.length ?? 0} color="#3b82f6" icon="E" sub="Triggers" />
          <Arrow />
          <Stage label="Suggestions Created" count={p?.pending ?? 0} color="#f59e0b" icon="S" sub="Pending in queue" />
          <Arrow />
          <Stage label="AI Enrichment" count={ai?.enriched ?? 0} color="#8b5cf6" icon="AI"
            sub={`${ai?.waiting ?? 0} waiting`}
            badge={ai?.waiting ? `${ai.waiting} queued` : undefined} />
          <Arrow />
          <Stage label="Constraint Check" count={(riskMap['low'] ?? 0) + (riskMap['medium'] ?? 0) + (riskMap['high'] ?? 0)} color="#06b6d4" icon="4L" sub="4-layer evaluation" />
          <Arrow />
          <Stage label="Auto-Approved" count={p?.approved ?? 0} color="#22c55e" icon="A" sub="→ Reservation created" />
        </div>

        {/* Risk breakdown bar */}
        <div style={s.riskSection}>
          <div style={s.riskTitle}>Risk Assessment Breakdown (pending, AI-enriched)</div>
          <div style={s.riskBar}>
            {(riskMap['low'] ?? 0) > 0 && (
              <div style={{ ...s.riskSegment, background: '#22c55e', flex: riskMap['low'] ?? 0 }}>
                <span style={s.riskSegLabel}>Low: {riskMap['low']}</span>
              </div>
            )}
            {(riskMap['medium'] ?? 0) > 0 && (
              <div style={{ ...s.riskSegment, background: '#f59e0b', flex: riskMap['medium'] ?? 0 }}>
                <span style={s.riskSegLabel}>Medium: {riskMap['medium']}</span>
              </div>
            )}
            {(riskMap['high'] ?? 0) > 0 && (
              <div style={{ ...s.riskSegment, background: '#ef4444', flex: riskMap['high'] ?? 0 }}>
                <span style={s.riskSegLabel}>High: {riskMap['high']}</span>
              </div>
            )}
            {!riskMap['low'] && !riskMap['medium'] && !riskMap['high'] && (
              <div style={{ ...s.riskSegment, background: 'var(--color-border)', flex: 1 }}>
                <span style={s.riskSegLabel}>No data</span>
              </div>
            )}
          </div>
          <div style={s.riskLegend}>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#22c55e' }} />Low = auto-approve eligible</span>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#f59e0b' }} />Medium = {riskThreshold === 'medium' ? 'auto-approve eligible' : 'needs manual review'}</span>
            <span style={s.legendItem}><span style={{ ...s.legendDot, background: '#ef4444' }} />High = always manual</span>
          </div>
        </div>

        {/* Two columns: Events + Decisions */}
        <div style={s.columns}>
          {/* Left: Recent simulation events */}
          <div style={s.column}>
            <div style={s.colHeader}>
              <span style={s.colDot} />
              Recent Events
              {simRunning && <span style={s.liveBadge}>LIVE</span>}
            </div>
            <div style={s.eventList}>
              {(data?.recentEvents ?? []).length === 0 && (
                <div style={s.emptyMsg}>
                  {simRunning ? 'Waiting for events...' : 'Start simulation to see events'}
                </div>
              )}
              {(data?.recentEvents ?? []).map((e) => (
                <div key={e.id} className="flow-event-new" style={s.eventRow}>
                  <div style={{ ...s.eventIcon, background: EVENT_COLORS[e.type] ?? '#6b7280' }}>
                    {EVENT_ICONS[e.type] ?? '?'}
                  </div>
                  <div style={s.eventBody}>
                    <div style={s.eventLabel}>{EVENT_LABELS[e.type] ?? e.type}</div>
                    <div style={s.eventDetail}>
                      {(e.data?.studentName as string) || (e.data?.registration as string) || (e.data?.instructorName as string) || ''}
                    </div>
                  </div>
                  <div style={s.eventTime}>{relTime(e.timestamp)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Auto-approve decisions */}
          <div style={s.column}>
            <div style={s.colHeader}>
              <span style={{ ...s.colDot, background: '#22c55e' }} />
              Auto-Approve Decisions
            </div>
            <div style={s.eventList}>
              {(data?.recentAutoApprove ?? []).length === 0 && (
                <div style={s.emptyMsg}>No recent auto-approve decisions</div>
              )}
              {(data?.recentAutoApprove ?? []).map((e) => {
                const isApproved = e.type === 'suggestion_auto_approved';
                const risk = e.data?.riskLevel as string;
                const failed = e.data?.failedConstraints as string[] | undefined;
                const reason = e.data?.blockReason as string | undefined;
                return (
                  <div key={e.id} className="flow-event-new" style={{ ...s.eventRow, borderLeft: `3px solid ${isApproved ? '#22c55e' : '#f59e0b'}` }}>
                    <div style={{ ...s.eventIcon, background: isApproved ? '#22c55e' : '#f59e0b' }}>
                      {isApproved ? 'A' : 'B'}
                    </div>
                    <div style={s.eventBody}>
                      <div style={s.eventLabel}>
                        {isApproved ? 'Approved' : 'Blocked'}
                        {risk && (
                          <span style={{
                            ...s.riskTag,
                            color: risk === 'low' ? '#16a34a' : risk === 'medium' ? '#d97706' : '#dc2626',
                            background: risk === 'low' ? 'rgba(34,197,94,0.1)' : risk === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                          }}>
                            {risk}
                          </span>
                        )}
                      </div>
                      <div style={s.eventDetail}>
                        {isApproved
                          ? 'All constraints passed → reservation created'
                          : reason === 'risk_too_high'
                            ? `Risk "${risk}" exceeds threshold "${riskThreshold}"`
                            : failed && failed.length > 0
                              ? failed[0]?.substring(0, 80)
                              : 'Constraint violation'}
                      </div>
                    </div>
                    <div style={s.eventTime}>{relTime(e.timestamp)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom: Stats row */}
        <div style={s.statsRow}>
          <Stat label="Pending" value={p?.pending ?? 0} color="#f59e0b" />
          <Stat label="Approved" value={p?.approved ?? 0} color="#22c55e" />
          <Stat label="Declined" value={p?.declined ?? 0} color="#ef4444" />
          <Stat label="Expired" value={p?.expired ?? 0} color="#6b7280" />
          <Stat label="Reservations" value={data?.recentReservations.length ?? 0} color="#3b82f6" />
        </div>
      </div>
    </div>
  );
}

function Stage({ label, count, color, icon, sub, badge }: { label: string; count: number; color: string; icon: string; sub: string; badge?: string }) {
  return (
    <div style={s.stage}>
      <div style={{ ...s.stageIcon, background: `${color}15`, border: `2px solid ${color}40` }}>
        <span style={{ color, fontWeight: 800, fontSize: '0.75rem' }}>{icon}</span>
      </div>
      <div style={s.stageCount}>{count}</div>
      <div style={s.stageLabel}>{label}</div>
      <div style={s.stageSub}>{sub}</div>
      {badge && <span style={{ ...s.stageBadge, background: `${color}15`, color }}>{badge}</span>}
    </div>
  );
}

function Arrow() {
  return (
    <div style={s.arrow}>
      <svg width="32" height="16" viewBox="0 0 32 16" fill="none">
        <path d="M0 8H28" stroke="var(--color-border-active)" strokeWidth="2" />
        <path d="M24 3L30 8L24 13" stroke="var(--color-border-active)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={s.stat}>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.02em' },
  subtitle: { fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: 4 },
  controls: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  thresholdControl: { display: 'flex', alignItems: 'center', gap: 8 },
  thresholdLabel: { fontSize: '0.78rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },
  startBtn: { background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 },
  stopBtn: { display: 'flex', alignItems: 'center', gap: 6 },
  flowContainer: { display: 'flex', flexDirection: 'column', gap: 20 },
  stagesRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, padding: '20px 0', overflowX: 'auto' },
  stage: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 110, padding: '0 8px' },
  stageIcon: { width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stageCount: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' },
  stageLabel: { fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'center', whiteSpace: 'nowrap' },
  stageSub: { fontSize: '0.65rem', color: 'var(--color-text-muted)', textAlign: 'center' },
  stageBadge: { fontSize: '0.6rem', fontWeight: 600, padding: '1px 6px', borderRadius: 6, marginTop: 2 },
  arrow: { display: 'flex', alignItems: 'center', padding: '0 4px', flexShrink: 0 },
  riskSection: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 },
  riskTitle: { fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' },
  riskBar: { display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', gap: 2 },
  riskSegment: { display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, minWidth: 60 },
  riskSegLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#fff' },
  riskLegend: { display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--color-text-muted)' },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  columns: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  column: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' },
  colHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' },
  colDot: { width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 },
  liveBadge: { marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em' },
  eventList: { maxHeight: 320, overflowY: 'auto', padding: 8 },
  eventRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 8px', borderRadius: 8, marginBottom: 4 },
  eventIcon: { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 800, flexShrink: 0 },
  eventBody: { flex: 1, minWidth: 0 },
  eventLabel: { fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 },
  eventDetail: { fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' },
  eventTime: { fontSize: '0.65rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', flexShrink: 0, paddingTop: 2 },
  riskTag: { fontSize: '0.6rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' },
  emptyMsg: { padding: 24, textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' },
  statsRow: { display: 'flex', justifyContent: 'center', gap: 24, padding: '16px 0' },
  stat: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  statValue: { fontSize: '1.5rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  statLabel: { fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' },
};
