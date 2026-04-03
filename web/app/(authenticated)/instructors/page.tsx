'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { api } from '@/lib/api';

interface AvailabilitySlot {
  dayOfWeek: number;
  start: string;
  end: string;
}

interface InstructorRecord {
  id: string;
  firstName: string;
  lastName: string;
  instructorType: string;
  isActive: boolean;
  totalFlights: number;
  totalHours: number;
  activeStudentCount: number;
  lastFlightDate: string | null;
  nextFlightDate: string | null;
  availability?: AvailabilitySlot[];
  locationId: string | null;
}

interface Location {
  id: string;
  name: string;
  code: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_RING_COLORS: Record<string, string> = {
  CFII: '#a855f7',
  CFI: '#3b82f6',
};

const TYPE_BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CFII: {
    bg: 'rgba(168,85,247,0.12)',
    text: '#a855f7',
    border: 'rgba(168,85,247,0.25)',
  },
  CFI: {
    bg: 'rgba(59,130,246,0.12)',
    text: '#3b82f6',
    border: 'rgba(59,130,246,0.25)',
  },
};

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(first: string, last: string): string {
  return `${(first?.[0] ?? '').toUpperCase()}${(last?.[0] ?? '').toUpperCase()}`;
}

export default function InstructorsPage() {
  const [instructors, setInstructors] = useState<InstructorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('all');

  const headerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const hasAnimatedCards = useRef(false);

  const fetchInstructors = useCallback(async () => {
    try {
      const res = await api.get<{ data: InstructorRecord[] }>('/directory/instructors');
      const data = Array.isArray(res) ? res : ((res as { data: InstructorRecord[] }).data ?? []);
      setInstructors(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load instructors.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstructors();
  }, [fetchInstructors]);

  useEffect(() => {
    api.get<{ data: Location[] }>('/directory/locations').then((res) => {
      const data = Array.isArray(res) ? res : ((res as { data: Location[] }).data ?? []);
      setLocations(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  // GSAP header fade-in
  useEffect(() => {
    if (headerRef.current) {
      gsap.fromTo(
        headerRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
      );
    }
  }, []);

  // GSAP stagger-in cards when data loads
  useEffect(() => {
    if (!loading && instructors.length > 0) {
      const cards = cardsRef.current.filter(Boolean) as HTMLDivElement[];
      if (cards.length > 0) {
        if (hasAnimatedCards.current) {
          gsap.set(cards, { opacity: 1, y: 0 });
          return;
        }
        hasAnimatedCards.current = true;
        gsap.fromTo(
          cards,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: 'power3.out',
            stagger: 0.07,
          },
        );
      }
    }
  }, [loading, instructors]);

  const filtered = selectedLocation === 'all'
    ? instructors
    : instructors.filter((i) => i.locationId === selectedLocation);

  return (
    <div>
      {/* Header */}
      <div ref={headerRef} style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: 'var(--color-text)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Instructors
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Instructor directory and workload
        </p>
      </div>

      {/* Location Filter */}
      {!loading && locations.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <select
            className="select"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            style={{
              maxWidth: 280,
              fontSize: '0.85rem',
            }}
          >
            <option value="all">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: 'rgba(220,38,38,0.08)',
            color: '#dc2626',
            border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: '0.875rem',
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={{ padding: 20, opacity: 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div
                  className="skeleton"
                  style={{ width: 44, height: 44, borderRadius: '50%' }}
                />
                <div>
                  <div
                    className="skeleton"
                    style={{ width: 120, height: 14, borderRadius: 4, marginBottom: 6 }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: 60, height: 10, borderRadius: 4 }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="skeleton" style={{ flex: 1, height: 40, borderRadius: 6 }} />
                <div className="skeleton" style={{ flex: 1, height: 40, borderRadius: 6 }} />
                <div className="skeleton" style={{ flex: 1, height: 40, borderRadius: 6 }} />
              </div>
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            No instructors found.
          </p>
        </div>
      ) : (
        /* Card grid */
        <>
        <style>{`
          .instructor-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
          }
          @media (max-width: 1024px) {
            .instructor-grid { grid-template-columns: repeat(2, 1fr); }
          }
          @media (max-width: 640px) {
            .instructor-grid { grid-template-columns: 1fr; }
          }
        `}</style>
        <div className="instructor-grid">
          {filtered.map((inst, idx) => {
            const ringColor = inst.isActive
              ? (TYPE_RING_COLORS[inst.instructorType] ?? '#3b82f6')
              : '#6b7280';
            const badge = TYPE_BADGE_COLORS[inst.instructorType] ?? {
              bg: 'rgba(107,114,128,0.12)',
              text: '#6b7280',
              border: 'rgba(107,114,128,0.25)',
            };

            return (
              <div
                key={inst.id}
                ref={(el) => { cardsRef.current[idx] = el; }}
                className="card instructor-grid-card"
                style={{ padding: 20 }}
              >
                {/* Card header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      border: `2.5px solid ${ringColor}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--color-surface-elevated)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: ringColor,
                      flexShrink: 0,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {getInitials(inst.firstName, inst.lastName)}
                  </div>

                  {/* Name + badges */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {inst.firstName} {inst.lastName}
                      </span>

                      {/* Type pill */}
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: badge.bg,
                          color: badge.text,
                          border: `1px solid ${badge.border}`,
                        }}
                      >
                        {inst.instructorType}
                      </span>

                      {/* Inactive badge */}
                      {!inst.isActive && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'rgba(107,114,128,0.12)',
                            color: '#6b7280',
                            border: '1px solid rgba(107,114,128,0.25)',
                          }}
                        >
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Status dot */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        marginTop: 3,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: inst.isActive ? '#22c55e' : '#6b7280',
                          display: 'inline-block',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {inst.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {inst.locationId && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginTop: 2,
                      }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                          {locations.find(l => l.id === inst.locationId)?.code ?? inst.locationId}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  {[
                    { label: 'Total Hours', value: inst.totalHours.toFixed(1) },
                    { label: 'Total Flights', value: String(inst.totalFlights) },
                    { label: 'Active Students', value: String(inst.activeStudentCount) },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      style={{
                        flex: 1,
                        background: 'var(--color-surface-elevated)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: 'var(--color-text)',
                          lineHeight: 1.2,
                        }}
                      >
                        {stat.value}
                      </div>
                      <div
                        style={{
                          fontSize: '0.62rem',
                          color: 'var(--color-text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          fontWeight: 500,
                          marginTop: 2,
                        }}
                      >
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                    Last Flight:{' '}
                    <span style={{ color: 'var(--color-text)' }}>
                      {inst.lastFlightDate ? formatShortDate(inst.lastFlightDate) : 'No flights yet'}
                    </span>
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                    Next Flight:{' '}
                    <span style={{ color: 'var(--color-text)' }}>
                      {inst.nextFlightDate ? formatShortDate(inst.nextFlightDate) : 'None scheduled'}
                    </span>
                  </span>
                </div>

                {/* Weekly availability */}
                {inst.availability && inst.availability.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        borderTop: '1px solid var(--color-border)',
                        paddingTop: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--color-text-muted)',
                          marginBottom: 6,
                        }}
                      >
                        Weekly Schedule
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {[...inst.availability]
                          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                          .map((slot, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '0.75rem',
                                color: 'var(--color-text-muted)',
                                fontFamily: 'monospace',
                              }}
                            >
                              <span style={{ width: 32, flexShrink: 0, fontWeight: 500 }}>
                                {DAY_NAMES[slot.dayOfWeek]}
                              </span>
                              <span>
                                {slot.start} – {slot.end}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
