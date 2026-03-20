'use client';

import { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import type { SuggestionRationale } from '@/lib/types';

interface RationalePanelProps {
  rationale: SuggestionRationale;
  defaultOpen?: boolean;
}

export default function RationalePanel({ rationale, defaultOpen = false }: RationalePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wrapperRef.current) return;
    if (open) {
      const body = bodyRef.current;
      if (body) {
        body.style.display = 'block';
        const height = body.scrollHeight;
        gsap.fromTo(
          body,
          { height: 0, opacity: 0 },
          { height, opacity: 1, duration: 0.35, ease: 'power2.out', onComplete: () => { body.style.height = 'auto'; } }
        );
      }
    } else {
      const body = bodyRef.current;
      if (body && body.style.display !== 'none') {
        gsap.to(body, {
          height: 0,
          opacity: 0,
          duration: 0.25,
          ease: 'power2.in',
          onComplete: () => { body.style.display = 'none'; },
        });
      }
    }
  }, [open]);

  return (
    <div ref={wrapperRef} style={styles.container}>
      <button
        onClick={() => setOpen(!open)}
        style={styles.toggle}
        type="button"
        aria-expanded={open}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <path d="M12 2a8 8 0 0 1 8 8c0 3-1.5 5.2-4 6.5V18a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-1.5C5.5 15.2 4 13 4 10a8 8 0 0 1 8-8z" />
          <path d="M9 22h6" />
        </svg>
        <span style={styles.toggleLabel}>AI Rationale</span>
        <span style={{ flex: 1 }} />
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s ease',
            flexShrink: 0,
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        ref={bodyRef}
        style={{ ...styles.body, display: defaultOpen ? 'block' : 'none', overflow: 'hidden' }}
      >
        {/* AI-generated summary (preferred) or deterministic fallback */}
        {(rationale.aiSummary || rationale.summary) && (
          <div style={rationale.aiSummary ? styles.aiSummaryBox : styles.summaryBox}>
            {rationale.aiSummary && (
              <div style={styles.aiBadgeRow}>
                <span style={styles.aiBadge}>AI</span>
                {rationale.riskLevel && (
                  <span style={{
                    ...styles.riskBadge,
                    background: rationale.riskLevel === 'low' ? 'rgba(34,197,94,0.15)' : rationale.riskLevel === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                    color: rationale.riskLevel === 'low' ? '#4ade80' : rationale.riskLevel === 'medium' ? '#fbbf24' : '#f87171',
                  }}>
                    {rationale.riskLevel} risk
                  </span>
                )}
              </div>
            )}
            <p style={styles.summaryText}>{rationale.aiSummary || rationale.summary}</p>
            {rationale.riskReason && (
              <p style={styles.riskReasonText}>{rationale.riskReason}</p>
            )}
          </div>
        )}

        {Array.isArray(rationale.inputs) && rationale.inputs.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Inputs Considered</div>
            <ul style={styles.list}>
              {rationale.inputs.map((item, i) => (
                <li key={i} style={styles.listItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(rationale.constraints) && rationale.constraints.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Constraints Evaluated</div>
            <ul style={styles.list}>
              {rationale.constraints.map((item, i) => (
                <li key={i} style={styles.listItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Array.isArray(rationale.policies) && rationale.policies.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Policies Matched</div>
            <ul style={styles.list}>
              {rationale.policies.map((item, i) => (
                <li key={i} style={styles.listItem}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#0f1320',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  toggle: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
    textAlign: 'left' as const,
    transition: 'color 0.2s ease',
  },
  toggleLabel: {
    fontWeight: 600,
    color: 'var(--color-text)',
    flexShrink: 0,
  },
  body: {
    padding: '0 16px 16px 16px',
  },
  summaryBox: {
    background: 'rgba(59, 130, 246, 0.08)',
    border: '1px solid rgba(59, 130, 246, 0.15)',
    borderRadius: '8px',
    padding: '12px 14px',
    marginBottom: '14px',
  },
  aiSummaryBox: {
    background: 'rgba(139, 92, 246, 0.08)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    borderRadius: '8px',
    padding: '12px 14px',
    marginBottom: '14px',
  },
  aiBadgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  aiBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '0.6rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    background: 'rgba(139, 92, 246, 0.2)',
    color: '#a78bfa',
  },
  riskBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '0.6rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  summaryText: {
    fontSize: '0.825rem',
    color: '#c8cdd8',
    lineHeight: 1.6,
    margin: 0,
  },
  riskReasonText: {
    fontSize: '0.75rem',
    color: '#7a8299',
    lineHeight: 1.5,
    margin: 0,
    marginTop: '6px',
    fontStyle: 'italic' as const,
  },
  section: {
    marginBottom: '12px',
  },
  sectionLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: '#5a6178',
    marginBottom: '6px',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  listItem: {
    fontSize: '0.8rem',
    color: 'var(--color-text-secondary)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    lineHeight: 1.5,
    padding: '2px 0',
  },
};
