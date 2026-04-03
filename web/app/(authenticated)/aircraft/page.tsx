'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { api } from '@/lib/api';
import { getAircraftImage } from '@/lib/aircraft-images';

interface AircraftRecord {
  id: string;
  registration: string;
  makeModel: string;
  isSimulator: boolean;
  isActive: boolean;
  totalFlights: number;
  totalHours: number;
  lastFlightDate: string | null;
  nextFlightDate: string | null;
  hobbs: number | null;
  tach: number | null;
  totalTime: number | null;
  openSquawks: number;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'None scheduled';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatNum(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '--';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function AircraftPage() {
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const headerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  const fetchAircraft = useCallback(async () => {
    try {
      const res = await api.get<{ data: AircraftRecord[] }>('/directory/aircraft');
      const data = Array.isArray(res) ? res : ((res as { data: AircraftRecord[] }).data ?? []);
      setAircraft(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load aircraft.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAircraft();
  }, [fetchAircraft]);

  // Header animation — once only
  const headerAnimated = useRef(false);
  useEffect(() => {
    if (headerRef.current && !headerAnimated.current) {
      headerAnimated.current = true;
      gsap.fromTo(
        headerRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' },
      );
    }
  }, []);

  // Cards stagger animation — once on first data load
  const cardsAnimated = useRef(false);
  useEffect(() => {
    if (!loading && aircraft.length > 0) {
      const validCards = cardsRef.current.filter(Boolean);
      if (validCards.length === 0) return;
      if (cardsAnimated.current) {
        gsap.set(validCards, { opacity: 1, y: 0 });
        return;
      }
      cardsAnimated.current = true;
      gsap.fromTo(validCards,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out', delay: 0.15 },
      );
    }
  }, [loading, aircraft]);

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
          Aircraft
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Fleet status and utilization
        </p>
      </div>

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

      {/* Loading skeletons */}
      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={{ padding: 0, overflow: 'hidden', opacity: 0.5 }}>
              <div
                className="skeleton"
                style={{ width: '100%', height: 160, borderRadius: 0 }}
              />
              <div style={{ padding: 16 }}>
                <div
                  className="skeleton"
                  style={{ width: 120, height: 16, borderRadius: 4, marginBottom: 8 }}
                />
                <div
                  className="skeleton"
                  style={{ width: 180, height: 12, borderRadius: 4, marginBottom: 16 }}
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="skeleton" style={{ width: 60, height: 32, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 60, height: 32, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 60, height: 32, borderRadius: 4 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : aircraft.length === 0 ? (
        /* Empty state */
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: 12 }}
          >
            <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
          </svg>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            No aircraft found in your fleet.
          </p>
        </div>
      ) : (
        /* Card grid */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {aircraft.map((ac, idx) => {
            const imageSrc = getAircraftImage(ac.registration);
            const hasTimesData = ac.hobbs != null || ac.tach != null || ac.totalTime != null;

            return (
              <div
                key={ac.id}
                ref={(el) => { cardsRef.current[idx] = el; }}
                className="card"
                style={{ padding: 0, overflow: 'hidden' }}
              >
                {/* Image header with registration overlay */}
                <div
                  style={{
                    width: '100%',
                    height: 160,
                    background: 'var(--color-surface-elevated)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <img
                    src={imageSrc}
                    alt={ac.registration}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      right: 8,
                      background: 'rgba(0, 0, 0, 0.7)',
                      backdropFilter: 'blur(4px)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      fontFamily: "'SF Mono', 'Fira Code', monospace",
                      padding: '3px 10px',
                      borderRadius: '6px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {ac.registration}
                  </span>
                </div>

                {/* Card body */}
                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Title area */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          color: 'var(--color-text)',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {ac.registration}
                      </span>

                      {/* Status badges */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: ac.isActive
                            ? 'rgba(21,128,61,0.1)'
                            : 'rgba(156,163,175,0.15)',
                          color: ac.isActive ? '#15803d' : '#9ca3af',
                          border: `1px solid ${ac.isActive ? 'rgba(21,128,61,0.2)' : 'rgba(156,163,175,0.2)'}`,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: ac.isActive ? '#15803d' : '#9ca3af',
                          }}
                        />
                        {ac.isActive ? 'Active' : 'Inactive'}
                      </span>

                      {ac.isSimulator && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'rgba(59,130,246,0.1)',
                            color: '#3b82f6',
                            border: '1px solid rgba(59,130,246,0.2)',
                          }}
                        >
                          Simulator
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)' }}>
                      {ac.makeModel}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 8,
                      marginBottom: 14,
                      padding: '10px 0',
                      borderTop: '1px solid var(--color-border)',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: 'var(--color-text)',
                        }}
                      >
                        {ac.totalFlights}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                        Total Flights
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: 'var(--color-text)',
                        }}
                      >
                        {formatNum(ac.totalHours)}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                        Flight Hours
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: ac.openSquawks > 0 ? '#dc2626' : 'var(--color-text)',
                        }}
                      >
                        {ac.openSquawks}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                        Open Squawks
                      </div>
                    </div>
                  </div>

                  {/* Times section */}
                  {hasTimesData && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 6,
                        marginBottom: 14,
                      }}
                    >
                      {ac.hobbs != null && (
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: 2 }}>
                            Hobbs
                          </div>
                          <div style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            {formatNum(ac.hobbs)}
                          </div>
                        </div>
                      )}
                      {ac.tach != null && (
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: 2 }}>
                            Tach
                          </div>
                          <div style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            {formatNum(ac.tach)}
                          </div>
                        </div>
                      )}
                      {ac.totalTime != null && (
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: 2 }}>
                            Total Time
                          </div>
                          <div style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            {formatNum(ac.totalTime)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dates */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: 2 }}>
                        Last Flight
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {ac.lastFlightDate ? formatDate(ac.lastFlightDate) : 'None'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: 2 }}>
                        Next Flight
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {formatDate(ac.nextFlightDate)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
