'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { api, ApiRequestError } from '@/lib/api';
import { setToken, setStoredUser } from '@/lib/auth';
import type { LoginResponse } from '@/lib/types';

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
    <div className="login-wrapper">
      <div ref={cardRef} className="login-card">
        <div className="login-header">
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
