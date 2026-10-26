import { Link } from 'react-router-dom';
import { MODES, timeControlById } from '@barricade/engine';

export function ModeSelectScreen() {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">Play</span>
          <h1>Select a mode</h1>
          <p className="page-sub">
            Every mode runs on the same engine with its own arena, barrier stock and clock. Ranked rulesets
            are fixed; custom matches are unranked.
          </p>
        </div>
        <Link className="btn btn-ghost" to="/bots">
          Play a bot instead
        </Link>
      </header>

      <div className="grid-3">
        {MODES.map((mode) => {
          const tc = timeControlById(mode.defaultTimeControl);
          return (
            <article key={mode.id} className="mode-card">
              <div className="mode-top">
                <h2 style={{ fontSize: '1.1rem' }}>{mode.name}</h2>
                <span className={`pill pill-${mode.accent === 'green' ? 'green' : mode.accent}`}>
                  {mode.ranked ? 'Ranked-ready' : 'Casual'}
                </span>
              </div>
              <span className="tagline">{mode.tagline}</span>
              <p className="small muted">{mode.description}</p>
              <div className="mode-meta">
                <span className="pill">{mode.arena.size}×{mode.arena.size}</span>
                <span className="pill">{mode.arena.wallsPerPlayer} barriers</span>
                {tc ? <span className="pill">{tc.label}</span> : null}
              </div>
              {mode.modifiers.length > 0 ? (
                <div className="row" style={{ gap: 6 }}>
                  {mode.modifiers.map((modifier) => (
                    <span key={modifier} className="pill tiny">{modifier.replace(/-/g, ' ')}</span>
                  ))}
                </div>
              ) : null}
              <div className="btn-row" style={{ marginTop: 10 }}>
                <Link className="btn btn-primary btn-sm" to={`/config?mode=${mode.id}`}>
                  Configure
                </Link>
                <Link className="btn btn-ghost btn-sm" to={`/config?mode=${mode.id}&opponent=bot`}>
                  vs Bot
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <div className="banner">
        <strong>Fair play:</strong>
        <span>
          Ranked matches use fixed, validated rulesets. No purchase can add moves, barriers, extra time or
          rating advantages.
        </span>
      </div>
    </div>
  );
}
