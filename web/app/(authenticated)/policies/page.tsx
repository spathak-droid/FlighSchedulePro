'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import gsap from 'gsap';
import { api, ApiRequestError } from '@/lib/api';
import type { SchedulingPolicies, FeatureFlag } from '@/lib/types';

const DEFAULT_POLICIES: SchedulingPolicies = {
  waitlistWeights: {
    timeSinceLastFlight: 0.3,
    timeUntilNextFlight: 0.2,
    totalHours: 0.2,
    custom: {},
  },
  rescheduleAlternativesCount: 5,
  searchWindowInitialDays: 7,
  searchWindowIncrementDays: 7,
  searchWindowMaxDays: 28,
  suggestionTtlHours: 24,
  pollingIntervalMinutes: 5,
  notificationPreferences: {
    email: true,
    sms: false,
  },
};

/** Human-readable labels for flag names */
const FLAG_LABELS: Record<string, string> = {
  ai_rationale: 'AI Rationale',
  risk_assessment: 'Risk Assessment',
  auto_approve: 'Auto-Approve',
  disruption_detection: 'Disruption Detection',
  weather_integration: 'Weather Integration',
  student_insights: 'Student Insights',
  fleet_optimization: 'Fleet Optimization',
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<SchedulingPolicies>(DEFAULT_POLICIES);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [flagUpdating, setFlagUpdating] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  // Derived state: auto_approve flag
  const autoApproveFlag = flags.find((f) => f.flagName === 'auto_approve');
  const autoApproveEnabled = autoApproveFlag?.enabled ?? false;
  const autoApproveThreshold = (autoApproveFlag?.config?.riskThreshold as string) ?? 'low';

  // Fetch policies and feature flags on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [policiesRes, flagsRes] = await Promise.all([
          api
            .get<{ data: Partial<SchedulingPolicies> }>('/policies')
            .catch(() => ({ data: {} as Partial<SchedulingPolicies> })),
          api
            .get<{ data: FeatureFlag[] }>('/feature-flags')
            .catch(() => ({ data: [] as FeatureFlag[] })),
        ]);

        const raw = policiesRes.data;
        setPolicies({
          ...DEFAULT_POLICIES,
          ...raw,
          waitlistWeights: {
            ...DEFAULT_POLICIES.waitlistWeights,
            ...(raw.waitlistWeights || {}),
          },
          notificationPreferences: {
            ...DEFAULT_POLICIES.notificationPreferences,
            ...(raw.notificationPreferences || {}),
          },
        });

        setFlags(flagsRes.data);
      } catch {
        // Use defaults if fetch fails
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // GSAP stagger-in on cards when loading completes
  useEffect(() => {
    if (!loading && cardsRef.current.length > 0) {
      const validCards = cardsRef.current.filter(Boolean);
      gsap.set(validCards, { opacity: 0, y: 30 });
      gsap.to(validCards, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.12,
        ease: 'power3.out',
      });
    }
  }, [loading]);

  // Toast animation
  useEffect(() => {
    if (toast && toastRef.current) {
      gsap.fromTo(
        toastRef.current,
        { opacity: 0, y: 20, x: 20 },
        { opacity: 1, y: 0, x: 0, duration: 0.4, ease: 'power2.out' },
      );
      const timer = setTimeout(() => {
        if (toastRef.current) {
          gsap.to(toastRef.current, {
            opacity: 0,
            y: 20,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => setToast(null),
          });
        }
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  /** Toggle a feature flag on/off */
  const handleToggleFlag = useCallback(
    async (flagName: string, enabled: boolean, config?: Record<string, unknown>) => {
      setFlagUpdating(flagName);
      try {
        const payload: { enabled: boolean; config?: Record<string, unknown> } = { enabled };
        if (config !== undefined) {
          payload.config = config;
        }
        const res = await api.put<{ data: FeatureFlag }>(`/feature-flags/${flagName}`, payload);
        setFlags((prev) => prev.map((f) => (f.flagName === flagName ? res.data : f)));
        setToast({
          message: `${FLAG_LABELS[flagName] ?? flagName} ${enabled ? 'enabled' : 'disabled'}`,
          type: 'success',
        });
      } catch (err) {
        const msg = err instanceof ApiRequestError ? err.message : 'Failed to update flag';
        setToast({ message: msg, type: 'error' });
      } finally {
        setFlagUpdating(null);
      }
    },
    [],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await api.put<{ data: SchedulingPolicies }>('/policies', policies);
      setPolicies({
        ...DEFAULT_POLICIES,
        ...res.data,
        waitlistWeights: {
          ...DEFAULT_POLICIES.waitlistWeights,
          ...(res.data.waitlistWeights || {}),
        },
        notificationPreferences: {
          ...DEFAULT_POLICIES.notificationPreferences,
          ...(res.data.notificationPreferences || {}),
        },
      });

      // Success flash on save button
      if (saveBtnRef.current) {
        gsap.to(saveBtnRef.current, {
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          boxShadow: '0 4px 20px rgba(34, 197, 94, 0.4)',
          duration: 0.3,
          ease: 'power2.out',
        });
        gsap.to(saveBtnRef.current, {
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
          duration: 0.5,
          delay: 1.2,
          ease: 'power2.inOut',
        });
      }

      setToast({ message: 'Policies saved successfully', type: 'success' });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Failed to save policies.');
      }
      setToast({ message: 'Failed to save policies', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function updateWeight(
    key: 'timeSinceLastFlight' | 'timeUntilNextFlight' | 'totalHours',
    value: number,
  ) {
    setPolicies((prev) => ({
      ...prev,
      waitlistWeights: {
        ...prev.waitlistWeights,
        [key]: value,
      },
    }));
  }

  const weightSum =
    policies.waitlistWeights.timeSinceLastFlight +
    policies.waitlistWeights.timeUntilNextFlight +
    policies.waitlistWeights.totalHours;
  const weightSumOk = weightSum >= 0.95 && weightSum <= 1.05;

  if (loading) {
    return (
      <div style={styles.loadingState}>
        <div className="spinner-pulse" />
        <p style={styles.loadingText}>Loading policies...</p>
      </div>
    );
  }

  return (
    <div ref={pageRef} style={styles.page}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>Scheduling Policies</h1>
        <p style={styles.pageSubtitle}>Configure automation rules for your school</p>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Waitlist Priority Weights */}
        <div
          ref={(el) => {
            cardsRef.current[0] = el;
          }}
          className="card"
          style={styles.card}
        >
          <div style={styles.cardHeader}>
            <div style={styles.cardIcon}>W</div>
            <div>
              <h2 style={styles.cardTitle}>Waitlist Priority Weights</h2>
              <p style={styles.cardDesc}>
                Configure how waitlist suggestions are ranked. Weights should sum to ~1.0.
              </p>
            </div>
          </div>

          <div style={styles.weightsGrid}>
            {/* Time Since Last Flight */}
            <div style={styles.weightItem}>
              <div style={styles.weightHeader}>
                <label style={styles.weightLabel}>Time Since Last Flight</label>
                <span style={styles.weightValue}>
                  {policies.waitlistWeights.timeSinceLastFlight.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                className="dark-range"
                min={0}
                max={1}
                step={0.05}
                value={policies.waitlistWeights.timeSinceLastFlight}
                onChange={(e) => updateWeight('timeSinceLastFlight', parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${policies.waitlistWeights.timeSinceLastFlight * 100}%, #e2e8f0 ${policies.waitlistWeights.timeSinceLastFlight * 100}%, #e2e8f0 100%)`,
                }}
              />
            </div>

            {/* Time Until Next Flight */}
            <div style={styles.weightItem}>
              <div style={styles.weightHeader}>
                <label style={styles.weightLabel}>Time Until Next Flight</label>
                <span style={styles.weightValue}>
                  {policies.waitlistWeights.timeUntilNextFlight.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                className="dark-range"
                min={0}
                max={1}
                step={0.05}
                value={policies.waitlistWeights.timeUntilNextFlight}
                onChange={(e) => updateWeight('timeUntilNextFlight', parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${policies.waitlistWeights.timeUntilNextFlight * 100}%, #e2e8f0 ${policies.waitlistWeights.timeUntilNextFlight * 100}%, #e2e8f0 100%)`,
                }}
              />
            </div>

            {/* Total Hours */}
            <div style={styles.weightItem}>
              <div style={styles.weightHeader}>
                <label style={styles.weightLabel}>Total Hours</label>
                <span style={styles.weightValue}>
                  {policies.waitlistWeights.totalHours.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                className="dark-range"
                min={0}
                max={1}
                step={0.05}
                value={policies.waitlistWeights.totalHours}
                onChange={(e) => updateWeight('totalHours', parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${policies.waitlistWeights.totalHours * 100}%, #e2e8f0 ${policies.waitlistWeights.totalHours * 100}%, #e2e8f0 100%)`,
                }}
              />
            </div>
          </div>

          {/* Weight Sum Indicator */}
          <div style={styles.weightSumRow}>
            <span style={styles.weightSumLabel}>Weight Sum</span>
            <div style={styles.weightSumBarBg}>
              <div
                style={{
                  ...styles.weightSumBarFill,
                  width: `${Math.min(weightSum * 100, 100)}%`,
                  background: weightSumOk
                    ? 'linear-gradient(90deg, #22c55e, #3b82f6)'
                    : 'linear-gradient(90deg, #f59e0b, #ef4444)',
                }}
              />
            </div>
            <span
              style={{
                ...styles.weightSumValue,
                color: weightSumOk ? '#22c55e' : '#f59e0b',
              }}
            >
              {weightSum.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Search Window */}
        <div
          ref={(el) => {
            cardsRef.current[1] = el;
          }}
          className="card"
          style={styles.card}
        >
          <div style={styles.cardHeader}>
            <div
              style={{
                ...styles.cardIcon,
                background: 'rgba(139, 92, 246, 0.15)',
                color: '#a78bfa',
              }}
            >
              S
            </div>
            <div>
              <h2 style={styles.cardTitle}>Search Window</h2>
              <p style={styles.cardDesc}>
                Progressive search: starts with initial window, expands in increments until max.
              </p>
            </div>
          </div>

          <div style={styles.inputGrid}>
            <div style={styles.inputGroup}>
              <label className="dark-label" style={styles.inputLabel}>
                Initial Days
              </label>
              <input
                className="input"
                type="number"
                min={1}
                max={90}
                value={policies.searchWindowInitialDays}
                onChange={(e) =>
                  setPolicies((prev) => ({
                    ...prev,
                    searchWindowInitialDays: parseInt(e.target.value) || 7,
                  }))
                }
              />
            </div>
            <div style={styles.inputGroup}>
              <label className="dark-label" style={styles.inputLabel}>
                Increment Days
              </label>
              <input
                className="input"
                type="number"
                min={1}
                max={30}
                value={policies.searchWindowIncrementDays}
                onChange={(e) =>
                  setPolicies((prev) => ({
                    ...prev,
                    searchWindowIncrementDays: parseInt(e.target.value) || 7,
                  }))
                }
              />
            </div>
            <div style={styles.inputGroup}>
              <label className="dark-label" style={styles.inputLabel}>
                Max Days
              </label>
              <input
                className="input"
                type="number"
                min={1}
                max={90}
                value={policies.searchWindowMaxDays}
                onChange={(e) =>
                  setPolicies((prev) => ({
                    ...prev,
                    searchWindowMaxDays: parseInt(e.target.value) || 28,
                  }))
                }
              />
            </div>
          </div>

          {/* Progressive expansion diagram */}
          <div style={styles.diagramRow}>
            <div style={styles.diagramStep}>
              <div style={{ ...styles.diagramBar, width: '30%' }} />
              <span style={styles.diagramLabel}>{policies.searchWindowInitialDays}d</span>
            </div>
            <span style={styles.diagramArrow}>&#8594;</span>
            <div style={styles.diagramStep}>
              <div style={{ ...styles.diagramBar, width: '60%' }} />
              <span style={styles.diagramLabel}>
                {policies.searchWindowInitialDays + policies.searchWindowIncrementDays}d
              </span>
            </div>
            <span style={styles.diagramArrow}>&#8594;</span>
            <div style={styles.diagramStep}>
              <div style={{ ...styles.diagramBar, width: '100%' }} />
              <span style={styles.diagramLabel}>{policies.searchWindowMaxDays}d max</span>
            </div>
          </div>
        </div>

        {/* Suggestion Settings */}
        <div
          ref={(el) => {
            cardsRef.current[2] = el;
          }}
          className="card"
          style={styles.card}
        >
          <div style={styles.cardHeader}>
            <div
              style={{
                ...styles.cardIcon,
                background: 'rgba(20, 184, 166, 0.15)',
                color: '#2dd4bf',
              }}
            >
              A
            </div>
            <div>
              <h2 style={styles.cardTitle}>Suggestion Settings</h2>
              <p style={styles.cardDesc}>
                Configure how suggestions are generated and how long they remain valid.
              </p>
            </div>
          </div>

          <div style={styles.inputGrid}>
            <div style={styles.inputGroup}>
              <label className="dark-label" style={styles.inputLabel}>
                Alternatives Count
              </label>
              <input
                className="input"
                type="number"
                min={3}
                max={10}
                value={policies.rescheduleAlternativesCount}
                onChange={(e) =>
                  setPolicies((prev) => ({
                    ...prev,
                    rescheduleAlternativesCount: parseInt(e.target.value) || 5,
                  }))
                }
              />
              <span style={styles.inputHint}>3-10 alternatives per reschedule</span>
            </div>
            <div style={styles.inputGroup}>
              <label className="dark-label" style={styles.inputLabel}>
                TTL (hours)
              </label>
              <input
                className="input"
                type="number"
                min={1}
                max={168}
                value={policies.suggestionTtlHours}
                onChange={(e) =>
                  setPolicies((prev) => ({
                    ...prev,
                    suggestionTtlHours: parseInt(e.target.value) || 24,
                  }))
                }
              />
              <span style={styles.inputHint}>Hours before a suggestion expires</span>
            </div>
            <div style={styles.inputGroup}>
              <label className="dark-label" style={styles.inputLabel}>
                Polling Interval (min)
              </label>
              <input
                className="input"
                type="number"
                min={2}
                max={5}
                value={policies.pollingIntervalMinutes}
                onChange={(e) =>
                  setPolicies((prev) => ({
                    ...prev,
                    pollingIntervalMinutes: parseInt(e.target.value) || 5,
                  }))
                }
              />
              <span style={styles.inputHint}>2-5 minutes (FSP rate limits)</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div
          ref={(el) => {
            cardsRef.current[3] = el;
          }}
          className="card"
          style={styles.card}
        >
          <div style={styles.cardHeader}>
            <div
              style={{
                ...styles.cardIcon,
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
              }}
            >
              N
            </div>
            <div>
              <h2 style={styles.cardTitle}>Notifications</h2>
              <p style={styles.cardDesc}>Enable or disable notification channels for students.</p>
            </div>
          </div>

          <div style={styles.toggleGroup}>
            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>Email Notifications</div>
                <div style={styles.toggleDesc}>Send suggestions and confirmations via email</div>
              </div>
              <button
                type="button"
                className={`dark-toggle${policies.notificationPreferences.email ? ' active' : ''}`}
                onClick={() =>
                  setPolicies((prev) => ({
                    ...prev,
                    notificationPreferences: {
                      ...prev.notificationPreferences,
                      email: !prev.notificationPreferences.email,
                    },
                  }))
                }
                aria-label="Toggle email notifications"
              />
            </div>

            <div style={styles.toggleDivider} />

            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>SMS Notifications</div>
                <div style={styles.toggleDesc}>Send text messages (requires student opt-in)</div>
              </div>
              <button
                type="button"
                className={`dark-toggle${policies.notificationPreferences.sms ? ' active' : ''}`}
                onClick={() =>
                  setPolicies((prev) => ({
                    ...prev,
                    notificationPreferences: {
                      ...prev.notificationPreferences,
                      sms: !prev.notificationPreferences.sms,
                    },
                  }))
                }
                aria-label="Toggle SMS notifications"
              />
            </div>
          </div>
        </div>

        {/* Automation */}
        <div
          ref={(el) => {
            cardsRef.current[4] = el;
          }}
          className="card"
          style={styles.card}
        >
          <div style={styles.cardHeader}>
            <div
              style={{
                ...styles.cardIcon,
                background: 'rgba(168, 85, 247, 0.15)',
                color: '#c084fc',
              }}
            >
              M
            </div>
            <div>
              <h2 style={styles.cardTitle}>Automation</h2>
              <p style={styles.cardDesc}>
                Configure autonomous scheduling behavior. Auto-approve requires AI enrichment and
                risk assessment.
              </p>
            </div>
          </div>

          <div style={styles.toggleGroup}>
            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>Auto-Approve Low-Risk Suggestions</div>
                <div style={styles.toggleDesc}>
                  Automatically approve suggestions that are AI-enriched and classified as low risk
                </div>
              </div>
              <button
                type="button"
                className={`dark-toggle${autoApproveEnabled ? ' active' : ''}`}
                disabled={flagUpdating === 'auto_approve'}
                onClick={() =>
                  handleToggleFlag('auto_approve', !autoApproveEnabled, {
                    riskThreshold: autoApproveThreshold,
                  })
                }
                aria-label="Toggle auto-approve"
              />
            </div>

            {autoApproveEnabled && (
              <>
                <div style={styles.toggleDivider} />
                <div style={styles.toggleRow}>
                  <div>
                    <div style={styles.toggleLabel}>Risk Threshold</div>
                    <div style={styles.toggleDesc}>
                      Which risk levels qualify for automatic approval
                    </div>
                  </div>
                  <select
                    className="input"
                    style={{ width: '180px', fontSize: '0.85rem' }}
                    value={autoApproveThreshold}
                    onChange={(e) =>
                      handleToggleFlag('auto_approve', true, { riskThreshold: e.target.value })
                    }
                    disabled={flagUpdating === 'auto_approve'}
                  >
                    <option value="low">Low risk only</option>
                    <option value="medium">Low + Medium risk</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Feature Flags */}
        {flags.length > 0 && (
          <div
            ref={(el) => {
              cardsRef.current[5] = el;
            }}
            className="card"
            style={styles.card}
          >
            <div style={styles.cardHeader}>
              <div
                style={{
                  ...styles.cardIcon,
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                }}
              >
                F
              </div>
              <div>
                <h2 style={styles.cardTitle}>Feature Flags</h2>
                <p style={styles.cardDesc}>
                  Enable or disable individual AI and automation features.
                </p>
              </div>
            </div>

            <div style={styles.toggleGroup}>
              {flags.map((flag, i) => (
                <div key={flag.id}>
                  {i > 0 && <div style={styles.toggleDivider} />}
                  <div style={styles.toggleRow}>
                    <div>
                      <div style={styles.toggleLabel}>
                        {FLAG_LABELS[flag.flagName] ?? flag.flagName}
                      </div>
                      <div style={styles.toggleDesc}>{flag.description || flag.flagName}</div>
                    </div>
                    <button
                      type="button"
                      className={`dark-toggle${flag.enabled ? ' active' : ''}`}
                      disabled={flagUpdating === flag.flagName}
                      onClick={() => handleToggleFlag(flag.flagName, !flag.enabled)}
                      aria-label={`Toggle ${flag.flagName}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div
          ref={(el) => {
            cardsRef.current[6] = el;
          }}
          className="card"
          style={{ ...styles.card, padding: '20px 24px' }}
        >
          <button ref={saveBtnRef} type="submit" disabled={saving} style={styles.saveBtn}>
            {saving && (
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            )}
            {saving ? 'Saving...' : 'Save Policies'}
          </button>
        </div>
      </form>

      {/* Toast */}
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
  page: {
    maxWidth: '860px',
    margin: '0 auto',
    paddingBottom: '48px',
  },
  pageHeader: {
    marginBottom: '32px',
  },
  pageTitle: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '6px',
    letterSpacing: '-0.02em',
  },
  pageSubtitle: {
    fontSize: '0.9rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
  },
  errorBox: {
    background: 'var(--color-danger-glow)',
    color: '#dc2626',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: '16px',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    gap: '16px',
  },
  loadingText: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  card: {
    padding: '24px',
  },
  cardHeader: {
    display: 'flex',
    gap: '14px',
    marginBottom: '24px',
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '0.85rem',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '4px',
  },
  cardDesc: {
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  weightsGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  weightItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  weightHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weightLabel: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    textTransform: 'none' as const,
    letterSpacing: 'normal',
    marginBottom: 0,
  },
  weightValue: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#3b82f6',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
  weightSumRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border)',
  },
  weightSumLabel: {
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
    flexShrink: 0,
  },
  weightSumBarBg: {
    flex: 1,
    height: '6px',
    background: '#e2e8f0',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  weightSumBarFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease, background 0.3s ease',
  },
  weightSumValue: {
    fontSize: '0.9rem',
    fontWeight: 700,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    flexShrink: 0,
    minWidth: '40px',
    textAlign: 'right' as const,
  },
  inputGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  inputLabel: {
    marginBottom: '6px',
  },
  inputHint: {
    fontSize: '0.7rem',
    color: 'var(--color-text-muted)',
    marginTop: '6px',
  },
  diagramRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid var(--color-border)',
  },
  diagramStep: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  diagramBar: {
    height: '4px',
    borderRadius: '2px',
    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
  },
  diagramLabel: {
    fontSize: '0.7rem',
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
  },
  diagramArrow: {
    color: 'var(--color-text-muted)',
    fontSize: '0.9rem',
    flexShrink: 0,
  },
  toggleGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
  },
  toggleLabel: {
    fontSize: '0.9rem',
    fontWeight: 500,
    color: 'var(--color-text)',
    marginBottom: '2px',
  },
  toggleDesc: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  toggleDivider: {
    height: '1px',
    background: 'var(--color-border)',
  },
  saveBtn: {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '14px 24px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.2s, opacity 0.15s',
    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
  },
};
