'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import gsap from 'gsap';
import { api } from '@/lib/api';

interface StudentRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  totalFlightHours: number;
  totalFlights: number;
  lastFlightDate: string | null;
  nextFlightDate: string | null;
  recentInstructorName: string | null;
  enrollmentProgress: number;
  completedLessons: number;
  totalLessons: number;
  isCheckrideReady: boolean;
  isAtRisk: boolean;
  riskReason: string | null;
  isInactive: boolean;
  locationId: string | null;
}

interface Location {
  id: string;
  name: string;
  code: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(first: string, last: string): string {
  return `${(first?.[0] ?? '').toUpperCase()}${(last?.[0] ?? '').toUpperCase()}`;
}

function getStatusColor(student: StudentRecord): string {
  if (student.isCheckrideReady) return '#22c55e';
  if (student.isAtRisk) return '#dc2626';
  if (student.isInactive) return '#d97706';
  return '#3b82f6';
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('all');

  // Email modal
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState<StudentRecord | null>(null);
  const [emailSubject, setEmailSubject] = useState('Message from your flight school');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Refs for GSAP
  const headerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const hasAnimatedHeader = useRef(false);
  const hasAnimatedCards = useRef(false);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await api.get<{ data: StudentRecord[] }>('/directory/students');
      const data = Array.isArray(res) ? res : ((res as { data: StudentRecord[] }).data ?? []);
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    api.get<{ data: Location[] }>('/directory/locations').then((res) => {
      const data = Array.isArray(res) ? res : ((res as { data: Location[] }).data ?? []);
      setLocations(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  // GSAP animations
  useEffect(() => {
    if (!loading && headerRef.current) {
      if (hasAnimatedHeader.current) {
        gsap.set(headerRef.current, { opacity: 1, y: 0 });
        return;
      }
      hasAnimatedHeader.current = true;
      gsap.fromTo(
        headerRef.current,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
      );
    }
  }, [loading]);

  useEffect(() => {
    if (!loading && cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll('[data-student-card]');
      if (cards.length > 0) {
        if (hasAnimatedCards.current) {
          gsap.set(cards, { opacity: 1, y: 0 });
          return;
        }
        hasAnimatedCards.current = true;
        gsap.fromTo(
          cards,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out' },
        );
      }
    }
  }, [loading, students, searchQuery]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  function openEmailModal(student: StudentRecord) {
    setEmailTarget(student);
    setEmailSubject('Message from your flight school');
    setEmailMessage('');
    setEmailModalOpen(true);
  }

  async function handleSendEmail() {
    if (!emailTarget) return;
    setEmailSending(true);
    try {
      await api.post('/directory/send-email', {
        to: emailTarget.email,
        subject: emailSubject,
        message: emailMessage,
      });
      setToast({ type: 'success', message: `Email sent to ${emailTarget.firstName} ${emailTarget.lastName}.` });
      setEmailModalOpen(false);
    } catch {
      setToast({ type: 'error', message: 'Failed to send email.' });
    } finally {
      setEmailSending(false);
    }
  }

  const filtered = students
    .filter((s) => selectedLocation === 'all' || s.locationId === selectedLocation)
    .filter((s) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    });

  return (
    <div>
      {/* Page header */}
      <div ref={headerRef} style={{ marginBottom: 24, opacity: loading ? 1 : undefined }}>
        <h1 style={styles.pageTitle}>Students</h1>
        <p style={styles.pageSubtitle}>Student directory and progress tracking</p>
      </div>

      {/* Error */}
      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Search bar */}
      {!loading && students.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            type="text"
            placeholder="Search students by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ ...styles.searchInput, flex: 1, minWidth: 200 }}
          />
          {locations.length > 0 && (
            <select
              className="select"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              style={{ maxWidth: 280, fontSize: '0.85rem' }}
            >
              <option value="all">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Loading skeletons */}
      {loading ? (
        <div data-students-grid style={styles.cardGrid}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={styles.skeletonCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%' }} />
                <div>
                  <div className="skeleton" style={{ width: 120, height: 14, borderRadius: 4, marginBottom: 6 }} />
                  <div className="skeleton" style={{ width: 160, height: 10, borderRadius: 4 }} />
                </div>
              </div>
              <div className="skeleton" style={{ width: '100%', height: 10, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '80%', height: 10, borderRadius: 4, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '60%', height: 10, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* Empty state */
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: 12 }}
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            {searchQuery ? 'No students match your search.' : 'No students found.'}
          </p>
        </div>
      ) : (
        /* Card grid */
        <div ref={cardsRef} data-students-grid style={styles.cardGrid}>
          {filtered.map((student) => {
            const statusColor = getStatusColor(student);
            return (
              <div
                key={student.id}
                data-student-card
                className="card"
                style={styles.studentCard}
              >
                {/* Card header */}
                <div style={styles.cardHeader}>
                  <div style={styles.avatarRow}>
                    <div
                      style={{
                        ...styles.avatar,
                        border: `2px solid ${statusColor}`,
                        boxShadow: `0 0 0 3px ${statusColor}22`,
                      }}
                    >
                      <span style={styles.avatarText}>{getInitials(student.firstName, student.lastName)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.nameRow}>
                        <span style={styles.studentName}>
                          {student.firstName} {student.lastName}
                        </span>
                        {student.isCheckrideReady && (
                          <span style={styles.badgeCheckride}>Checkride Ready</span>
                        )}
                        {student.isAtRisk && (
                          <span style={styles.badgeAtRisk}>At Risk</span>
                        )}
                        {student.isInactive && (
                          <span style={styles.badgeInactive}>Inactive</span>
                        )}
                      </div>
                      <p style={styles.studentEmail}>{student.email}</p>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div style={styles.statsRow}>
                  <div style={styles.statItem}>
                    <span style={styles.statValue}>{student.totalFlightHours.toFixed(1)}</span>
                    <span style={styles.statLabel}>Hours</span>
                  </div>
                  <div style={styles.statDivider} />
                  <div style={styles.statItem}>
                    <span style={styles.statValue}>{student.totalFlights}</span>
                    <span style={styles.statLabel}>Flights</span>
                  </div>
                  <div style={styles.statDivider} />
                  <div style={styles.statItem}>
                    <span style={styles.statValue}>{Math.round(student.enrollmentProgress)}%</span>
                    <span style={styles.statLabel}>Progress</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={styles.progressBarBg}>
                  <div
                    style={{
                      ...styles.progressBarFill,
                      width: `${Math.min(Math.round(student.enrollmentProgress), 100)}%`,
                    }}
                  />
                </div>

                {/* Details */}
                <div style={styles.detailsSection}>
                  <div style={styles.detailRow}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span style={styles.detailText}>
                      Last Flight: {student.lastFlightDate ? formatDate(student.lastFlightDate) : <span style={styles.detailMuted}>No flights yet</span>}
                    </span>
                  </div>
                  <div style={styles.detailRow}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span style={styles.detailText}>
                      Next Flight: {student.nextFlightDate ? formatDate(student.nextFlightDate) : <span style={styles.detailMuted}>None scheduled</span>}
                    </span>
                  </div>
                  <div style={styles.detailRow}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span style={styles.detailText}>
                      Instructor: {student.recentInstructorName || <span style={styles.detailMuted}>Unassigned</span>}
                    </span>
                  </div>
                  <div style={styles.detailRow}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                    <span style={styles.detailText}>
                      Enrollment: {student.completedLessons}/{student.totalLessons} lessons
                    </span>
                  </div>
                  <div style={styles.detailRow}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span style={styles.detailText}>
                      Location: {student.locationId ? (locations.find(l => l.id === student.locationId)?.code ?? student.locationId) : <span style={styles.detailMuted}>Unassigned</span>}
                    </span>
                  </div>
                  {student.isAtRisk && student.riskReason && (
                    <div style={styles.riskRow}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span style={styles.riskText}>{student.riskReason}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={styles.cardActions}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => openEmailModal(student)}
                    style={styles.emailButton}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    Email
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Email Modal */}
      {emailModalOpen && emailTarget && (
        <div className="modal-overlay" onClick={() => setEmailModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--color-text)', fontSize: '1.1rem', fontWeight: 700 }}>
              Send Email
            </h3>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.modalLabel}>To</label>
              <input
                className="input"
                type="text"
                value={`${emailTarget.firstName} ${emailTarget.lastName} <${emailTarget.email}>`}
                readOnly
                style={{ opacity: 0.7, cursor: 'not-allowed' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.modalLabel}>Subject</label>
              <input
                className="input"
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject..."
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={styles.modalLabel}>Message</label>
              <textarea
                className="input"
                rows={5}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Type your message..."
                style={{ resize: 'vertical' as const }}
              />
            </div>
            <div style={styles.modalActions}>
              <button className="btn btn-ghost" onClick={() => setEmailModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleSendEmail}
                disabled={emailSending || !emailMessage.trim()}
                style={{
                  background: 'var(--color-accent)',
                  color: '#fff',
                  border: 'none',
                  opacity: emailSending || !emailMessage.trim() ? 0.5 : 1,
                }}
              >
                {emailSending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '12px 20px',
            borderRadius: 10,
            fontSize: '0.85rem',
            fontWeight: 600,
            zIndex: 100,
            background: toast.type === 'success' ? 'var(--color-success-glow, rgba(34,197,94,0.15))' : 'var(--color-danger-glow, rgba(220,38,38,0.15))',
            color: toast.type === 'success' ? '#16a34a' : '#dc2626',
            border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(220,38,38,0.3)'}`,
            backdropFilter: 'blur(12px)',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 1024px) {
          [data-students-grid] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          [data-students-grid] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
    background: 'rgba(220,38,38,0.08)',
    color: '#dc2626',
    border: '1px solid rgba(220,38,38,0.2)',
    borderRadius: 10,
    padding: '12px 16px',
    fontSize: '0.875rem',
    marginBottom: 16,
  },
  searchInput: {
    width: '100%',
    maxWidth: 400,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
  },
  skeletonCard: {
    padding: 20,
    opacity: 0.5,
  },
  studentCard: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
  },
  cardHeader: {
    marginBottom: 14,
  },
  avatarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'var(--color-surface-elevated, rgba(255,255,255,0.05))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.02em',
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  studentName: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  studentEmail: {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
    margin: '2px 0 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  badgeCheckride: {
    fontSize: '0.6rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '2px 7px',
    borderRadius: 4,
    background: 'rgba(34,197,94,0.12)',
    color: '#22c55e',
    border: '1px solid rgba(34,197,94,0.25)',
  },
  badgeAtRisk: {
    fontSize: '0.6rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '2px 7px',
    borderRadius: 4,
    background: 'rgba(220,38,38,0.1)',
    color: '#dc2626',
    border: '1px solid rgba(220,38,38,0.2)',
  },
  badgeInactive: {
    fontSize: '0.6rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '2px 7px',
    borderRadius: 4,
    background: 'rgba(217,119,6,0.1)',
    color: '#d97706',
    border: '1px solid rgba(217,119,6,0.2)',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '10px 0',
    borderTop: '1px solid var(--color-border)',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: 8,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
  },
  statDivider: {
    width: 1,
    height: 28,
    background: 'var(--color-border)',
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    background: 'var(--color-surface-elevated, rgba(255,255,255,0.06))',
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
    background: 'var(--color-accent)',
    transition: 'width 0.3s ease',
  },
  detailsSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    marginBottom: 14,
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.4,
  },
  detailMuted: {
    color: 'var(--color-text-muted)',
    fontStyle: 'italic' as const,
  },
  riskRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(220,38,38,0.06)',
    border: '1px solid rgba(220,38,38,0.12)',
    marginTop: 4,
  },
  riskText: {
    fontSize: '0.75rem',
    color: '#dc2626',
    fontWeight: 500,
  },
  cardActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    borderTop: '1px solid var(--color-border)',
    paddingTop: 10,
    marginTop: 'auto',
  },
  emailButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: 'var(--color-accent)',
    fontSize: '0.78rem',
    fontWeight: 600,
  },
  modalLabel: {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    marginBottom: 6,
  },
  modalActions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
  },
};
