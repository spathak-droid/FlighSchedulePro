'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import gsap from 'gsap';
import { api, ApiRequestError } from '@/lib/api';
import type { CreateDiscoveryRequest, DiscoveryResponse } from '@/lib/types';

export default function DiscoveryPage() {
  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredDates, setPreferredDates] = useState<string[]>(['']);
  const [timeOfDay, setTimeOfDay] = useState<'morning' | 'afternoon' | 'evening' | 'anytime'>(
    'anytime',
  );
  const [notes, setNotes] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmedSuggestion, setConfirmedSuggestion] = useState<{
    id: string;
    proposedStart: string;
    proposedEnd: string;
    instructorName?: string;
    aircraftRegistration?: string;
    prospectEmail?: string;
  } | null>(null);

  // Refs
  const formCardRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const resultCardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const toastRef = useRef<HTMLDivElement>(null);

  // GSAP form entrance on mount
  useEffect(() => {
    if (formCardRef.current) {
      gsap.fromTo(
        formCardRef.current,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' },
      );
    }
  }, []);

  // GSAP results slide in
  useEffect(() => {
    if (result && resultsRef.current) {
      gsap.fromTo(
        resultsRef.current,
        { opacity: 0, y: 60 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.1 },
      );

      // Stagger individual result cards
      const validCards = resultCardsRef.current.filter(Boolean);
      if (validCards.length > 0) {
        gsap.set(validCards, { opacity: 0, y: 20 });
        gsap.to(validCards, {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: 'power2.out',
          delay: 0.3,
        });
      }
    }
  }, [result]);

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

  function formatPhone(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function phoneDigits(formatted: string): string {
    return formatted.replace(/\D/g, '');
  }

  const phoneValid = phone === '' || phoneDigits(phone).length === 10;

  function addDateSlot() {
    setPreferredDates((prev) => [...prev, '']);
  }

  function removeDateSlot(index: number) {
    setPreferredDates((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDate(index: number, value: string) {
    setPreferredDates((prev) => prev.map((d, i) => (i === index ? value : d)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setResult(null);

    try {
      const body: CreateDiscoveryRequest = {
        firstName,
        lastName,
        email: email || undefined,
        phone: phone ? phoneDigits(phone) : undefined,
        preferredDates: preferredDates.filter((d) => d).map((date) => ({ date, timeOfDay })),
        timeOfDay,
        notes: notes || undefined,
      };

      const res = await api.post<{ data: DiscoveryResponse }>('/discovery-flights', body);
      setResult(res.data);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Failed to find available slots. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmBooking(suggestionId: string) {
    setConfirmingId(suggestionId);
    try {
      const res = await api.post<{
        data: {
          booking: {
            prospectName: string;
            prospectEmail?: string;
            proposedStart: string;
            proposedEnd: string;
            instructorName?: string;
            aircraftRegistration?: string;
            activityType: string;
          };
          emailSent: boolean;
        };
      }>(`/discovery-flights/${suggestionId}/book`, {});

      const booking = res.data.booking;
      setConfirmedSuggestion({
        id: suggestionId,
        proposedStart: booking.proposedStart,
        proposedEnd: booking.proposedEnd,
        instructorName: booking.instructorName,
        aircraftRegistration: booking.aircraftRegistration,
        prospectEmail: booking.prospectEmail,
      });

      // Remove all sibling suggestion cards (they're expired on the backend)
      if (result) {
        setResult({
          ...result,
          suggestions: result.suggestions.filter((s: { id: string }) => s.id === suggestionId),
        });
      }

      setToast({
        message: res.data.emailSent
          ? 'Discovery flight confirmed! Confirmation email sent.'
          : 'Discovery flight confirmed!',
        type: 'success',
      });
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Failed to confirm booking';
      setToast({ message: msg, type: 'error' });
    } finally {
      setConfirmingId(null);
    }
  }

  function handleBookAnother() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setPreferredDates(['']);
    setTimeOfDay('anytime');
    setNotes('');
    setResult(null);
    setConfirmedSuggestion(null);
    setError('');
  }

  function formatSlotTime(isoString: string): string {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  }

  return (
    <div style={styles.page}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>Discovery Flights</h1>
        <p style={styles.pageSubtitle}>Schedule introductory flights for prospects</p>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Form Card */}
      <div ref={formCardRef} className="card" style={styles.formCard}>
        <div style={styles.formHeader}>
          <div style={styles.formIcon}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </div>
          <div>
            <h2 style={styles.formTitle}>Prospect Information</h2>
            <p style={styles.formDesc}>Enter the prospect details and preferred schedule</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Name Row */}
          <div style={styles.fieldRow}>
            <div style={styles.fieldHalf}>
              <label style={styles.label}>First Name *</label>
              <input
                className="input"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                required
              />
            </div>
            <div style={styles.fieldHalf}>
              <label style={styles.label}>Last Name *</label>
              <input
                className="input"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                required
              />
            </div>
          </div>

          {/* Contact Row */}
          <div style={styles.fieldRow}>
            <div style={styles.fieldHalf}>
              <label style={styles.label}>Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div style={styles.fieldHalf}>
              <label style={styles.label}>Phone</label>
              <input
                className="input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(555) 123-4567"
                maxLength={14}
              />
              {phone && !phoneValid && (
                <span style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '4px' }}>
                  Phone must be 10 digits
                </span>
              )}
            </div>
          </div>

          {/* Preferred Dates */}
          <div style={styles.fieldFull}>
            <div style={styles.datesHeader}>
              <label style={styles.label}>Preferred Dates</label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addDateSlot}
                style={{ padding: '4px 10px' }}
              >
                + Add Date
              </button>
            </div>
            <div style={styles.datesList}>
              {preferredDates.map((date, idx) => (
                <div key={idx} style={styles.dateRow}>
                  <input
                    className="input"
                    type="date"
                    value={date}
                    onChange={(e) => updateDate(idx, e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {preferredDates.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeDateSlot(idx)}
                      style={{
                        padding: '6px 10px',
                        color: '#dc2626',
                        flexShrink: 0,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Time of Day */}
          <div style={styles.fieldFull}>
            <label style={styles.label}>Time of Day</label>
            <select
              className="select"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value as typeof timeOfDay)}
            >
              <option value="anytime">Anytime</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </div>

          {/* Notes */}
          <div style={styles.fieldFull}>
            <label style={styles.label}>Notes</label>
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any special requirements or preferences..."
              style={{
                resize: 'vertical' as const,
                lineHeight: 1.6,
              }}
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !firstName || !lastName || !phoneValid}
            style={styles.submitBtn}
          >
            {submitting && (
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            )}
            {submitting ? 'Searching...' : 'Find Available Slots'}
          </button>
        </form>
      </div>

      {/* Confirmation Card */}
      {confirmedSuggestion && (
        <div ref={resultsRef} style={styles.resultsSection}>
          <div className="card" style={styles.confirmationCard}>
            <div style={styles.confirmationIcon}>
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#4ade80"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 style={styles.confirmationTitle}>Booking Confirmed!</h2>
            <p style={styles.confirmationSubtitle}>
              Discovery flight for{' '}
              <strong style={{ color: 'var(--color-text)' }}>
                {result?.prospect.firstName} {result?.prospect.lastName}
              </strong>{' '}
              has been booked.
            </p>

            <div style={styles.confirmationDetails}>
              <div style={styles.confirmationDetailRow}>
                <span style={styles.confirmationDetailLabel}>Date & Time</span>
                <span style={styles.confirmationDetailValue}>
                  {formatSlotTime(confirmedSuggestion.proposedStart)}
                </span>
              </div>
              <div style={styles.confirmationDetailRow}>
                <span style={styles.confirmationDetailLabel}>End Time</span>
                <span style={styles.confirmationDetailValue}>
                  {formatSlotTime(confirmedSuggestion.proposedEnd)}
                </span>
              </div>
              {confirmedSuggestion.instructorName && (
                <div style={styles.confirmationDetailRow}>
                  <span style={styles.confirmationDetailLabel}>Instructor</span>
                  <span style={styles.confirmationDetailValue}>
                    {confirmedSuggestion.instructorName}
                  </span>
                </div>
              )}
              {confirmedSuggestion.aircraftRegistration && (
                <div style={styles.confirmationDetailRow}>
                  <span style={styles.confirmationDetailLabel}>Aircraft</span>
                  <span style={styles.confirmationDetailValue}>
                    {confirmedSuggestion.aircraftRegistration}
                  </span>
                </div>
              )}
            </div>

            {confirmedSuggestion.prospectEmail && (
              <div style={styles.emailSentNotice}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <span>
                  Confirmation email sent to <strong>{confirmedSuggestion.prospectEmail}</strong>
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' as const }}>
              <a href="/reservations" className="btn btn-primary" style={styles.bookAnotherBtn}>
                View All Reservations
              </a>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleBookAnother}
                style={{ width: '100%', padding: '12px 24px', fontSize: '0.9rem' }}
              >
                Book Another Discovery Flight
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Section */}
      {result && !confirmedSuggestion && (
        <div ref={resultsRef} style={styles.resultsSection}>
          <div style={styles.resultsHeader}>
            <h2 style={styles.resultsTitle}>
              {result.isAlternative ? 'Recommended Alternatives' : 'Available Slots'}
            </h2>
            {result.isAlternative && result.preferredDate && (
              <div
                style={{
                  background: 'var(--color-warning-glow)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  marginBottom: '12px',
                  color: '#d97706',
                  fontSize: '0.85rem',
                }}
              >
                No flights available on{' '}
                {new Date(result.preferredDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                — showing nearest alternatives
              </div>
            )}
            <p style={styles.resultsSubtitle}>
              Found {result.suggestions.length} option{result.suggestions.length !== 1 ? 's' : ''}{' '}
              for{' '}
              <strong style={{ color: 'var(--color-text)' }}>
                {result.prospect.firstName} {result.prospect.lastName}
              </strong>
            </p>
          </div>

          {result.suggestions.length === 0 ? (
            <div className="card" style={styles.noResults}>
              No available slots found for the selected criteria. Try adjusting dates or time
              preferences.
            </div>
          ) : (
            <div style={styles.resultsGrid}>
              {result.suggestions.map((suggestion, idx) => (
                <div
                  key={suggestion.id}
                  ref={(el) => {
                    resultCardsRef.current[idx] = el;
                  }}
                  className="card"
                  style={styles.resultCard}
                >
                  {/* Rank badge */}
                  <div style={styles.rankBadge}>#{idx + 1}</div>

                  {/* Time slot */}
                  <div style={styles.slotTime}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span style={styles.slotTimeText}>
                      {formatSlotTime(suggestion.proposedStart)}
                    </span>
                  </div>
                  <div style={styles.slotEndTime}>to {formatSlotTime(suggestion.proposedEnd)}</div>

                  {/* Details */}
                  <div style={styles.slotDetails}>
                    {(suggestion.instructorName || suggestion.instructorId) && (
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Instructor</span>
                        <span style={styles.detailValue}>
                          {suggestion.instructorName || suggestion.instructorId}
                        </span>
                      </div>
                    )}
                    {(suggestion.aircraftRegistration || suggestion.aircraftId) && (
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Aircraft</span>
                        <span style={styles.detailValue}>
                          {suggestion.aircraftRegistration || suggestion.aircraftId}
                        </span>
                      </div>
                    )}
                    {suggestion.rankingScore !== undefined && (
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Match Score</span>
                        <span style={{ ...styles.detailValue, color: '#3b82f6', fontWeight: 600 }}>
                          {Number(suggestion.rankingScore).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirm Button */}
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => handleConfirmBooking(suggestion.id)}
                    disabled={confirmingId === suggestion.id}
                    style={styles.confirmBtn}
                  >
                    {confirmingId === suggestion.id && (
                      <span
                        className="spinner"
                        style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: '#fff' }}
                      />
                    )}
                    {confirmingId === suggestion.id ? 'Confirming...' : 'Confirm Booking'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '920px',
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

  // Form
  formCard: {
    padding: '28px',
  },
  formHeader: {
    display: 'flex',
    gap: '14px',
    marginBottom: '28px',
    alignItems: 'flex-start',
  },
  formIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  formTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '4px',
  },
  formDesc: {
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '18px',
  },
  fieldHalf: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  fieldFull: {
    marginBottom: '18px',
  },
  datesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  datesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  dateRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  submitBtn: {
    width: '100%',
    marginTop: '8px',
    padding: '14px 24px',
    fontSize: '0.95rem',
    fontWeight: 600,
  },

  // Results
  resultsSection: {
    marginTop: '32px',
  },
  resultsHeader: {
    marginBottom: '20px',
  },
  resultsTitle: {
    fontSize: '1.3rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: '6px',
  },
  resultsSubtitle: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  noResults: {
    textAlign: 'center' as const,
    padding: '48px 20px',
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
  },
  resultsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  resultCard: {
    padding: '24px',
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  rankBadge: {
    position: 'absolute' as const,
    top: '12px',
    right: '12px',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--color-text-secondary)',
    background: 'var(--color-surface-elevated)',
    padding: '3px 8px',
    borderRadius: '6px',
    letterSpacing: '0.03em',
  },
  slotTime: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  slotTimeText: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  slotEndTime: {
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
    marginLeft: '24px',
  },
  slotDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    paddingTop: '8px',
    borderTop: '1px solid var(--color-border)',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: '0.78rem',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  detailValue: {
    fontSize: '0.85rem',
    color: 'var(--color-text-secondary)',
  },
  confirmBtn: {
    width: '100%',
    marginTop: '4px',
    padding: '10px 20px',
  },

  // Confirmation
  confirmationCard: {
    padding: '40px 32px',
    textAlign: 'center' as const,
    maxWidth: '520px',
    margin: '0 auto',
  },
  confirmationIcon: {
    marginBottom: '16px',
  },
  confirmationTitle: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#16a34a',
    marginBottom: '8px',
    letterSpacing: '-0.02em',
  },
  confirmationSubtitle: {
    fontSize: '0.9rem',
    color: 'var(--color-text-secondary)',
    marginBottom: '28px',
    lineHeight: 1.6,
  },
  confirmationDetails: {
    textAlign: 'left' as const,
    background: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '20px',
  },
  confirmationDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--color-border)',
  },
  confirmationDetailLabel: {
    fontSize: '0.8rem',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  confirmationDetailValue: {
    fontSize: '0.9rem',
    color: 'var(--color-text)',
    fontWeight: 600,
  },
  emailSentNotice: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'var(--color-accent-glow)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '0.82rem',
    color: '#2563eb',
    marginBottom: '24px',
    textAlign: 'left' as const,
  },
  bookAnotherBtn: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '0.95rem',
    fontWeight: 600,
  },
};
