'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { api, ApiRequestError } from '@/lib/api';
import { setToken, setStoredUser } from '@/lib/auth';
import type { LoginResponse } from '@/lib/types';
import { Logo } from '@/components/logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  // GSAP refs
  const cardRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' },
      );
    }

    if (fieldsRef.current) {
      const children = fieldsRef.current.children;
      gsap.fromTo(
        children,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out', stagger: 0.1, delay: 0.3 },
      );
    }
  }, [mfaRequired]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post<LoginResponse>('/auth/login', { email, password });

      if (res.mfaRequired) {
        setMfaRequired(true);
        setMfaToken(res.mfaToken || res.token);
        setLoading(false);
        return;
      }

      setToken(res.token);
      setStoredUser({
        userId: res.user.userId,
        email: res.user.email,
        operatorId: res.user.operatorId,
        permissions: res.user.permissions,
      });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      setLoading(false);
    }
  }

  async function handleMfa(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post<LoginResponse>('/auth/mfa', {
        mfaToken,
        mfaCode,
        mfaMethod: 1,
      });

      setToken(res.token);
      setStoredUser({
        userId: res.user.userId,
        email: res.user.email,
        operatorId: res.user.operatorId,
        permissions: res.user.permissions,
      });
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Invalid MFA code. Please try again.');
      }
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper login-aerial">
      {/* Aerial airport background */}
      <div className="login-aerial-bg">
        <div className="login-aerial-field login-aerial-field-1" />
        <div className="login-aerial-field login-aerial-field-2" />
        <div className="login-aerial-field login-aerial-field-3" />
        <div className="login-aerial-wave login-aerial-wave-1" />
        <div className="login-aerial-wave login-aerial-wave-2" />
        <div className="login-aerial-wave login-aerial-wave-3" />
        <div className="login-aerial-runway" />
        <div className="login-aerial-taxiway login-aerial-taxiway-1" />
        <div className="login-aerial-taxiway login-aerial-taxiway-2" />
        <div className="login-aerial-building login-aerial-building-1" />
        <div className="login-aerial-building login-aerial-building-2" />
        <div className="login-aerial-building login-aerial-building-3" />
        <div className="login-aerial-roof login-aerial-roof-1" />
        <div className="login-aerial-roof login-aerial-roof-2" />
        <div className="login-aerial-overlay" />
      </div>

      {/* Floating airplane */}
      <div className="login-airplane">
        <svg viewBox="0 0 240 360" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="120" cy="340" rx="60" ry="8" fill="rgba(0,0,0,0.12)" />
          <path d="M120 10C112 10 106 30 104 60L104 280C104 300 108 320 120 340C132 320 136 300 136 280L136 60C134 30 128 10 120 10Z" fill="#f0f2f5" stroke="#d1d5db" strokeWidth="0.5" />
          <ellipse cx="120" cy="28" rx="6" ry="10" fill="#14532d" opacity="0.8" />
          <ellipse cx="120" cy="28" rx="4" ry="8" fill="#166534" opacity="0.5" />
          <line x1="120" y1="45" x2="120" y2="310" stroke="#cdd3dc" strokeWidth="0.8" strokeDasharray="3,4" />
          <path d="M104 130L14 185C10 187 10 192 14 193L42 198L104 168Z" fill="#e2e6ec" stroke="#c8cdd5" strokeWidth="0.5" />
          <path d="M104 135L22 186L26 188L104 140Z" fill="#15803d" opacity="0.6" />
          <path d="M136 130L226 185C230 187 230 192 226 193L198 198L136 168Z" fill="#e2e6ec" stroke="#c8cdd5" strokeWidth="0.5" />
          <path d="M136 135L218 186L214 188L136 140Z" fill="#15803d" opacity="0.6" />
          <rect x="48" y="172" width="12" height="24" rx="5" fill="#bcc3d0" stroke="#a0a8b8" strokeWidth="0.5" />
          <ellipse cx="54" cy="172" rx="5" ry="3" fill="#9ca3af" />
          <rect x="180" y="172" width="12" height="24" rx="5" fill="#bcc3d0" stroke="#a0a8b8" strokeWidth="0.5" />
          <ellipse cx="186" cy="172" rx="5" ry="3" fill="#9ca3af" />
          <path d="M108 285L72 310C70 312 71 316 74 316L90 318L108 300Z" fill="#e2e6ec" stroke="#c8cdd5" strokeWidth="0.5" />
          <path d="M132 285L168 310C170 312 169 316 166 316L150 318L132 300Z" fill="#e2e6ec" stroke="#c8cdd5" strokeWidth="0.5" />
          <path d="M118 295L120 330L122 295Z" fill="#15803d" opacity="0.5" />
          <line x1="111" y1="35" x2="111" y2="310" stroke="#15803d" strokeWidth="1.5" opacity="0.4" />
          <line x1="129" y1="35" x2="129" y2="310" stroke="#15803d" strokeWidth="1.5" opacity="0.4" />
        </svg>
      </div>

      {/* Headline */}
      <h1 className="login-aerial-headline">Ready to take off?</h1>

      {/* Existing login card */}
      <div ref={cardRef} className="login-card">
        <div className="login-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Logo size={56} />
          </div>
          <h1 className="login-title">
            <span className="login-title-accent">Flight</span>Schedule Pro
          </h1>
          <p className="login-subtitle">Agentic Scheduler Console</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        {!mfaRequired ? (
          <form onSubmit={handleLogin}>
            <div ref={fieldsRef}>
              <div className="login-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="scheduler@flightschool.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="login-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary login-submit"
                disabled={loading || !email || !password}
              >
                {loading ? <span className="spinner" /> : null}
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleMfa}>
            <div ref={fieldsRef}>
              <p className="login-mfa-info">
                A verification code has been sent to your registered device.
                Enter the code below to continue.
              </p>

              <div className="login-field">
                <label htmlFor="mfaCode">Verification Code</label>
                <input
                  id="mfaCode"
                  className="input"
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  required
                  autoFocus
                  maxLength={6}
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary login-submit"
                disabled={loading || mfaCode.length < 6}
              >
                {loading ? <span className="spinner" /> : null}
                {loading ? 'Verifying...' : 'Verify'}
              </button>

              <button
                type="button"
                className="btn btn-outline login-submit"
                style={{ marginTop: '8px' }}
                onClick={() => {
                  setMfaRequired(false);
                  setMfaCode('');
                  setMfaToken('');
                  setError('');
                }}
              >
                Back to Login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
