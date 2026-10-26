import { NavLink, Outlet, Link } from 'react-router-dom';
import { useApp } from '../state/AppContext.js';
import { LogoMark } from './LogoMark.js';

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
      {on ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 6a9 9 0 0 1 0 12" />
        </>
      ) : (
        <>
          <path d="m16 9 5 6" />
          <path d="m21 9-5 6" />
        </>
      )}
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
    </svg>
  );
}

const NAV = [
  { to: '/', label: 'Home', short: 'Home', glyph: 'H', end: true },
  { to: '/play', label: 'Play', short: 'Play', glyph: 'P' },
  { to: '/online', label: 'Online', short: 'Online', glyph: 'O' },
  { to: '/puzzles', label: 'Puzzles', short: 'Puzzles', glyph: '?' },
  { to: '/leaderboard', label: 'Ranks', short: 'Ranks', glyph: 'R' },
  { to: '/profile', label: 'Profile', short: 'Me', glyph: 'Me' },
];

export function Shell() {
  const { profile, toasts, dismissToast, settings, updateSettings } = useApp();

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Barricade home">
          <span className="brand-mark">
            <LogoMark />
          </span>
          Barricade
        </Link>
        <nav className="topnav" aria-label="Primary">
          {NAV.filter((item) => item.to !== '/').map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label === 'Ranks' ? 'Leaderboard' : item.label}
            </NavLink>
          ))}
          <NavLink to="/config?mode=dash" className="cta-link">
            Quick match
          </NavLink>
        </nav>
        <div className="topbar-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={settings.sound ? 'Mute sound' : 'Unmute sound'}
            title={settings.sound ? 'Mute sound' : 'Unmute sound'}
            onClick={() => updateSettings({ sound: !settings.sound })}
          >
            <SoundIcon on={settings.sound} />
          </button>
          <Link to="/settings" className="icon-button" aria-label="Settings" title="Settings">
            <GearIcon />
          </Link>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="bottomnav" aria-label="Primary mobile">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-glyph" aria-hidden="true">
              {item.glyph}
            </span>
            {item.short}
          </NavLink>
        ))}
      </nav>

      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            className={`toast ${toast.kind}`}
            onClick={() => dismissToast(toast.id)}
            aria-label={`Dismiss message: ${toast.message}`}
          >
            {toast.message}
          </button>
        ))}
      </div>

      <span className="visually-hidden" aria-live="polite">
        Signed in locally as {profile.name}. {profile.matches} matches recorded.
      </span>
    </div>
  );
}
