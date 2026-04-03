'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import type { SuggestionFilters, SuggestionType, SuggestionStatus } from '@/lib/types';

interface FilterBarProps {
  initialFilters?: SuggestionFilters;
  onChange: (filters: SuggestionFilters) => void;
}

const TYPE_OPTIONS: { value: SuggestionType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'reschedule', label: 'Reschedule' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'next_lesson', label: 'Next Lesson' },
];

const STATUS_OPTIONS: { value: SuggestionStatus | 'all' | ''; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
];

export default function FilterBar({ initialFilters, onChange }: FilterBarProps) {
  const [type, setType] = useState<SuggestionType | ''>(initialFilters?.type || '');
  const [status, setStatus] = useState<SuggestionStatus | ''>(initialFilters?.status || 'pending');
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom || '');
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo || '');
  const barRef = useRef<HTMLDivElement>(null);

  // Auto-apply filters whenever any value changes
  const applyFilters = useCallback(
    (t: string, s: string, df: string, dt: string) => {
      onChange({
        type: (t || undefined) as SuggestionType | undefined,
        status: (s || undefined) as SuggestionStatus | 'all' | undefined,
        dateFrom: df || undefined,
        dateTo: dt || undefined,
        page: 1,
      });
    },
    [onChange],
  );

  // GSAP: slide down on mount
  useEffect(() => {
    if (barRef.current) {
      gsap.fromTo(
        barRef.current,
        { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
      );
    }
  }, []);

  function handleReset() {
    setType('');
    setStatus('pending');
    setDateFrom('');
    setDateTo('');
    onChange({ status: 'pending', page: 1 });
  }

  return (
    <div ref={barRef} style={styles.bar}>
      <div style={styles.filterGroup}>
        <label htmlFor="filter-type">Type</label>
        <select
          id="filter-type"
          className="select"
          value={type}
          onChange={(e) => {
            const v = e.target.value as SuggestionType | '';
            setType(v);
            applyFilters(v, status, dateFrom, dateTo);
          }}
          style={styles.filterInput}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.filterGroup}>
        <label htmlFor="filter-status">Status</label>
        <select
          id="filter-status"
          className="select"
          value={status}
          onChange={(e) => {
            const v = e.target.value as SuggestionStatus | '';
            setStatus(v);
            applyFilters(type, v, dateFrom, dateTo);
          }}
          style={styles.filterInput}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.filterGroup}>
        <label htmlFor="filter-date-from">From</label>
        <input
          id="filter-date-from"
          className="input"
          type="date"
          value={dateFrom}
          onChange={(e) => {
            const v = e.target.value;
            setDateFrom(v);
            applyFilters(type, status, v, dateTo);
          }}
          style={styles.filterInput}
        />
      </div>

      <div style={styles.filterGroup}>
        <label htmlFor="filter-date-to">To</label>
        <input
          id="filter-date-to"
          className="input"
          type="date"
          value={dateTo}
          onChange={(e) => {
            const v = e.target.value;
            setDateTo(v);
            applyFilters(type, status, dateFrom, v);
          }}
          style={styles.filterInput}
        />
      </div>

      <div style={styles.buttonGroup}>
        <button className="btn btn-ghost btn-sm" onClick={handleReset}>
          Reset
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '16px',
    padding: '16px 20px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    flexWrap: 'wrap' as const,
    boxShadow: 'var(--shadow)',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: '120px',
    flex: '1 1 140px',
  },
  filterInput: {
    width: '100%',
    maxWidth: '200px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
    paddingBottom: '1px',
  },
};
