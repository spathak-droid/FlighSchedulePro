'use client';

/**
 * Error boundary for authenticated pages.
 * Catches rendering errors within the authenticated layout and provides
 * a user-friendly recovery UI without losing the shell navigation.
 */

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: '#fef3c7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#d97706"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h2
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--color-text, #1a1a1a)',
          margin: '0 0 8px',
        }}
      >
        This page encountered an error
      </h2>
      <p
        style={{
          fontSize: '0.9rem',
          color: 'var(--color-text-muted, #6b7280)',
          margin: '0 0 8px',
          maxWidth: 400,
          lineHeight: 1.5,
        }}
      >
        {error.message || 'An unexpected error occurred while loading this page.'}
      </p>
      {error.digest && (
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-text-muted, #9ca3af)',
            margin: '0 0 24px',
          }}
        >
          Error ID: {error.digest}
        </p>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={reset}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--color-accent, #14532d)',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
        <a
          href="/dashboard"
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid var(--color-border, #e5e7eb)',
            background: 'transparent',
            color: 'var(--color-text, #1a1a1a)',
            fontSize: '0.9rem',
            fontWeight: 500,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
