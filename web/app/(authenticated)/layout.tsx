'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import gsap from 'gsap';
import { isAuthenticated, clearToken, getStoredUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { Logo } from '@/components/logo';

interface FlightAlertItem {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  description: string | null;
  createdAt: string;
}

function AlertBell() {
  const [count, setCount] = useState(0);
  const [alerts, setAlerts] = useState<FlightAlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await api.get<{ data: { count: number } }>('/flight-alerts/count');
        setCount(res.data.count);
      } catch {
        // non-critical
      }
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handleToggle() {
    if (!open && alerts.length === 0) {
      try {
        const res = await api.get<{ data: FlightAlertItem[] }>('/flight-alerts?limit=5');
        const data = Array.isArray(res) ? res : (res as { data: FlightAlertItem[] }).data ?? [];
        setAlerts(Array.isArray(data) ? data : []);
      } catch {
        // show empty
      }
    }
    setOpen(!open);
  }

  const severityColor: Record<string, string> = {
    critical: '#dc2626',
    warning: '#d97706',
    info: '#15803d',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="app-topbar-action"
        aria-label="Notifications"
        onClick={handleToggle}
        style={{ position: 'relative' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            background: '#ef4444',
            color: '#fff',
            fontSize: '0.6rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
          }}>
            {count}
          </span>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 8,
          width: 340,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 200,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: '0.9rem' }}>
            Notifications {count > 0 && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({count})</span>}
          </div>
          {alerts.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              No active alerts
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {alerts.map((a) => (
                <div key={a.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: severityColor[a.severity] || '#94a3b8',
                    flexShrink: 0,
                    marginTop: 6,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text)' }}>{a.title}</div>
                    {a.description && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{a.description}</div>}
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {new Date(a.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link href="/alerts" onClick={() => setOpen(false)} style={{
            display: 'block',
            padding: '12px 16px',
            textAlign: 'center',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--color-accent)',
            borderTop: '1px solid var(--color-border)',
          }}>
            View all alerts
          </Link>
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Queue', href: '/queue', icon: 'queue' },
  { label: 'Schedule', href: '/reservations', icon: 'reservations' },
  { label: 'Discovery', href: '/discovery', icon: 'discovery' },
  { label: 'Templates', href: '/templates', icon: 'templates' },
  { label: 'Policies', href: '/policies', icon: 'policies' },
];

function NavIcon({ type }: { type: string }) {
  switch (type) {
    case 'dashboard':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'queue':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5" /><path d="M8 3H3v5" />
          <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
          <path d="m15 9 6-6" />
        </svg>
      );
    case 'discovery':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case 'templates':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    case 'policies':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'reservations':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="M9 16l2 2 4-4" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    const user = getStoredUser();
    if (user) {
      setUserEmail(user.email);
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (ready && navRef.current) {
      const items = navRef.current.querySelectorAll('.sidebar-nav-item');
      gsap.fromTo(
        items,
        { opacity: 0, x: -16 },
        {
          opacity: 1,
          x: 0,
          duration: 0.35,
          ease: 'power2.out',
          stagger: 0.06,
          delay: 0.1,
        },
      );
    }
  }, [ready]);

  useEffect(() => {
    if (ready && mainRef.current && prevPathname.current !== pathname) {
      gsap.fromTo(
        mainRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
      );
      prevPathname.current = pathname;
    }
  }, [pathname, ready]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSidebarOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  function handleLogout() {
    api.del('/auth/logout').catch(() => {});
    clearToken();
    router.replace('/login');
  }

  if (!ready) {
    return (
      <div className="loading-wrapper">
        <span className="spinner-pulse" />
      </div>
    );
  }

  const currentPage = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
  );

  const displayName = userEmail ? userEmail.split('@')[0] : 'User';

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <Logo size={36} />
          <div>
            <div className="sidebar-logo">FlighSchedule Pro</div>
            <div className="sidebar-logo-sub">Agentic Scheduler</div>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={closeSidebar}
            aria-label="Close sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <nav ref={navRef} className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-nav-item${isActive ? ' active' : ''}`}
              >
                <span className="sidebar-nav-icon">
                  <NavIcon type={item.icon} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Book New Flight CTA */}
        <div className="sidebar-cta">
          <Link href="/discovery" className="sidebar-cta-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Book New Flight
          </Link>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="sidebar-user-details">
              <div className="sidebar-user-email">{displayName}</div>
              <button onClick={handleLogout} className="sidebar-logout">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="app-main">
        <header className="app-topbar">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>

          <span className="app-topbar-title">{currentPage?.label || 'FlighSchedule Pro'}</span>

          <div style={{ flex: 1 }} />

          {/* Notifications — wired to flight alerts API */}
          <AlertBell />
        </header>
        <div ref={mainRef} className="app-content">
          {children}
        </div>
      </div>
    </div>
  );
}
