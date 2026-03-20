'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { WeatherData, FlightCategory } from '@/lib/types';

// ─── Flight Category Colors ────────────────────────────────────────────────

const CATEGORY_COLORS: Record<FlightCategory, string> = {
  VFR: '#16a34a', // green
  MVFR: '#0369a1', // blue (aviation standard)
  IFR: '#dc2626', // red
  LIFR: '#9333ea', // purple
};

const CATEGORY_BG: Record<FlightCategory, string> = {
  VFR: 'rgba(22,163,74,0.12)',
  MVFR: 'rgba(3,105,161,0.12)',
  IFR: 'rgba(220,38,38,0.12)',
  LIFR: 'rgba(147,51,234,0.12)',
};

// ─── Weather Code Labels ───────────────────────────────────────────────────

function weatherCodeLabel(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 49) return 'Fog';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 84) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

// ─── Wind Direction Arrow ──────────────────────────────────────────────────

function windDirectionLabel(deg: number): string {
  const dirs = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const i = Math.round(deg / 22.5) % 16;
  return dirs[i] ?? 'N';
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function WeatherWidget() {
  const [weatherList, setWeatherList] = useState<WeatherData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchWeather() {
      try {
        const resp = await api.get<{ data: WeatherData[] }>('/weather');
        // Handle both { data: [...] } and direct array
        const data = Array.isArray(resp) ? resp : ((resp as { data: WeatherData[] }).data ?? resp);
        setWeatherList(Array.isArray(data) ? data : []);
      } catch {
        setError('Unable to load weather data.');
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();

    // Auto-refresh every 15 minutes
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={styles.container}>
        <h3 style={styles.sectionTitle}>Live Weather</h3>
        <div style={styles.grid}>
          {[1, 2].map((i) => (
            <div key={i} style={{ ...styles.card, opacity: 0.5 }}>
              <div
                className="skeleton"
                style={{ width: 140, height: 14, borderRadius: 4, marginBottom: 12 }}
              />
              <div className="skeleton" style={{ width: 80, height: 28, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h3 style={styles.sectionTitle}>Live Weather</h3>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  if (weatherList.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.sectionTitle}>Live Weather</h3>
      <div style={styles.grid}>
        {weatherList.map((w) => (
          <WeatherCard key={w.locationId} weather={w} />
        ))}
      </div>
    </div>
  );
}

function WeatherCard({ weather }: { weather: WeatherData }) {
  const { current, locationName } = weather;
  const category = current.flightCategory;
  const color = CATEGORY_COLORS[category];
  const bg = CATEGORY_BG[category];

  // Extract airport code from location name (e.g., "KPAO - Palo Alto Airport" -> "KPAO")
  const airportCode = locationName.split(' - ')[0] ?? locationName;

  return (
    <div style={{ ...styles.card, borderTopColor: color }}>
      {/* Header */}
      <div style={styles.cardHeader}>
        <div>
          <div style={styles.airportCode}>{airportCode}</div>
          <div style={styles.locationName}>{locationName.split(' - ')[1] ?? locationName}</div>
        </div>
        <span
          style={{
            ...styles.categoryBadge,
            color,
            background: bg,
            borderColor: color,
          }}
        >
          {category}
        </span>
      </div>

      {/* Temperature + Conditions */}
      <div style={styles.tempRow}>
        <span style={styles.temperature}>{Math.round(current.temperature)}&deg;C</span>
        <span style={styles.conditions}>{weatherCodeLabel(current.weatherCode)}</span>
      </div>

      {/* Details Grid */}
      <div style={styles.detailsGrid}>
        <div style={styles.detailItem}>
          <span style={styles.detailLabel}>Wind</span>
          <span style={styles.detailValue}>
            {Math.round(current.windSpeed)} km/h {windDirectionLabel(current.windDirection)}
          </span>
        </div>
        <div style={styles.detailItem}>
          <span style={styles.detailLabel}>Gusts</span>
          <span style={styles.detailValue}>{Math.round(current.windGust)} km/h</span>
        </div>
        <div style={styles.detailItem}>
          <span style={styles.detailLabel}>Visibility</span>
          <span style={styles.detailValue}>{current.visibility.toFixed(1)} sm</span>
        </div>
        <div style={styles.detailItem}>
          <span style={styles.detailLabel}>Cloud Cover</span>
          <span style={styles.detailValue}>{current.cloudCover}%</span>
        </div>
      </div>

      {/* Mini forecast strip (next 6 hours) */}
      {weather.forecast.length > 0 && (
        <div style={styles.forecastStrip}>
          {weather.forecast.slice(0, 6).map((h) => {
            const hourLabel = new Date(h.time).toLocaleTimeString('en-US', {
              hour: 'numeric',
              hour12: true,
            });
            const fColor = CATEGORY_COLORS[h.flightCategory];
            return (
              <div key={h.time} style={styles.forecastHour}>
                <span style={styles.forecastTime}>{hourLabel}</span>
                <span
                  style={{
                    ...styles.forecastDot,
                    background: fColor,
                  }}
                />
                <span style={styles.forecastTemp}>{Math.round(h.temperature)}&deg;</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: '0 0 16px 0',
    letterSpacing: '-0.01em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderTop: '3px solid #16a34a',
    borderRadius: '12px',
    padding: '20px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  airportCode: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '0.02em',
  },
  locationName: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
    marginTop: '2px',
  },
  categoryBadge: {
    display: 'inline-block',
    fontSize: '0.75rem',
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid',
    letterSpacing: '0.05em',
  },
  tempRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
    marginBottom: '16px',
  },
  temperature: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
  },
  conditions: {
    fontSize: '0.825rem',
    color: 'var(--color-text-secondary)',
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginBottom: '16px',
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  detailLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
  },
  detailValue: {
    fontSize: '0.825rem',
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  forecastStrip: {
    display: 'flex',
    gap: '4px',
    paddingTop: '12px',
    borderTop: '1px solid var(--color-border)',
    overflowX: 'auto',
  },
  forecastHour: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    flex: '1 1 0',
    minWidth: '40px',
  },
  forecastTime: {
    fontSize: '0.65rem',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  forecastDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'block',
  },
  forecastTemp: {
    fontSize: '0.7rem',
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.08)',
    color: '#dc2626',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '10px',
    padding: '12px 16px',
    fontSize: '0.875rem',
  },
};
