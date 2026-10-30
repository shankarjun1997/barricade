import { Link } from 'react-router-dom';
import { MODES, timeControlById } from '@barricade/engine';

export function ModeSelectScreen() {
  return (
    <div className="stack">
      <header className="page-head compact-head">
        <div>
          <span className="eyebrow">Play</span>
          <h1>Choose a mode</h1>
          <p className="page-sub">Each mode sets the arena, walls and clock. Rules stay identical.</p>
        </div>
        <Link className="btn btn-ghost" to="/bots">
          Play a bot
        </Link>
      </header>

      <div className="list-panel">
        {MODES.map((mode) => {
          const tc = timeControlById(mode.defaultTimeControl);
          return (
            <Link key={mode.id} className="mode-row" to={`/config?mode=${mode.id}`}>
              <div className="mode-row-main">
                <strong>{mode.name}</strong>
                <small>{mode.tagline}</small>
              </div>
              <div className="mode-row-meta small muted">
                <span>{mode.arena.size}×{mode.arena.size}</span>
                <span>{mode.arena.wallsPerPlayer} walls</span>
                {tc ? <span>{tc.label}</span> : null}
                {!mode.ranked ? <span className="dim">Casual</span> : null}
              </div>
              <span className="mode-row-chevron" aria-hidden="true">→</span>
            </Link>
          );
        })}
      </div>

      <p className="tiny dim">
        Ranked matches use fixed rulesets. Purchases can never add moves, walls, time or rating advantages.
      </p>
    </div>
  );
}
