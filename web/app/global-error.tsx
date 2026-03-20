'use client';

/**
 * Global error boundary for the root layout.
 * Catches rendering errors that occur outside of nested error boundaries.
 * This is the last line of defense for unhandled React errors.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          background: '#f8faf8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            textAlign: 'center',
            padding: '48px 24px',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#1a1a1a',
              margin: '0 0 8px',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: '0.95rem',
              color: '#6b7280',
              margin: '0 0 24px',
              lineHeight: 1.5,
            }}
          >
            An unexpected error occurred. This has been logged for our team.
            {error.digest && (
              <span
                style={{ display: 'block', fontSize: '0.8rem', marginTop: 8, color: '#9ca3af' }}
              >
                Error ID: {error.digest}
              </span>
            )}
          </p>
          <button
            onClick={reset}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#14532d',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
