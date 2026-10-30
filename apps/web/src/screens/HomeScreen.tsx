import { Link, useNavigate } from 'react-router-dom';
import { MODES } from '@barricade/engine';
import { useApp } from '../state/AppContext.js';
import { dailyPuzzle, createPuzzleMatch, puzzleBudget, solvedPuzzles } from '../lib/puzzles.js';
import { formatDuration } from '../lib/format.js';
import { levelInfo, winRate } from '../lib/profile.js';
import { saveMatch } from '../lib/match.js';

const FEATURED_MODES = ['sprint', 'dash', 'tempo', 'marathon'];

export function HomeScreen() {
  const navigate = useNavigate();
  const { profile, sfx, toast } = useApp();
  const daily = dailyPuzzle();
  const solved = solvedPuzzles(profile);
  const level = levelInfo(profile.xp);
  const rate = Math.round(winRate(profile) * 100);

  const playDaily = () => {
    const match = createPuzzleMatch(daily);
    saveMatch(match);
    sfx('start');
    toast(`Daily puzzle: ${daily.title}`, 'success');
    navigate('/match');
  };

  return (
    <div className="stack">
      <section className="hero home-hero">
        <div>
          <span className="eyebrow">Competitive grid duel</span>
          <h1>Race. Wall. Outthink.</h1>
          <p className="page-sub">
            Race to the rival's home space. Place walls. Cut their path before they cut yours.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/online">
              Play online
            </Link>
            <Link className="btn" to="/config?mode=dash">
              Quick match
            </Link>
            <button type="button" className="btn btn-ghost" onClick={playDaily}>
              Daily puzzle
            </button>
          </div>
          <div className="hero-links small muted">
            <Link to="/bots">Challenge a bot</Link>
            <span aria-hidden="true">·</span>
            <Link to="/puzzles">Puzzles</Link>
            <span aria-hidden="true">·</span>
            <Link to="/play">All modes</Link>
          </div>
        </div>
      </section>

      <section className="home-stats" aria-label="Your record">
        <div className="home-stat">
          <span className="stat-label">Rating</span>
          <span className="stat-value green">{profile.rating}</span>
        </div>
        <div className="home-stat">
          <span className="stat-label">Level {level.level}</span>
          <span className="stat-value">{profile.xp.toLocaleString()}<small> XP</small></span>
        </div>
        <div className="home-stat">
          <span className="stat-label">Record</span>
          <span className="stat-value">
            {profile.wins}–{profile.losses}
            <small> · {rate}%</small>
          </span>
        </div>
        <div className="home-stat">
          <span className="stat-label">Time on board</span>
          <span className="stat-value">{formatDuration(profile.playtimeMs)}</span>
        </div>
      </section>

      <section className="home-split">
        <div className="panel">
          <div className="row-between">
            <span className="eyebrow">Daily puzzle</span>
            {solved.has(daily.id) ? <span className="pill pill-green">Solved</span> : null}
          </div>
          <h2>{daily.title}</h2>
          <p className="small muted">{daily.description}</p>
          <div className="row small muted">
            <span>{puzzleBudget(daily)} casts</span>
            <span aria-hidden="true">·</span>
            <span>{daily.size}×{daily.size}</span>
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={playDaily}>
              Play daily
            </button>
            <Link className="btn btn-ghost btn-sm" to="/puzzles">
              All puzzles
            </Link>
          </div>
        </div>

        <div className="panel">
          <div className="card-title">Practice</div>
          <div className="compact-rows">
            <Link className="compact-row" to="/bots">
              <span>
                <strong>Play a bot</strong>
                <small>8 personalities, offline</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="compact-row" to="/puzzles">
              <span>
                <strong>Puzzles</strong>
                <small>Five route drills</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="compact-row" to="/config?mode=dash">
              <span>
                <strong>Local duel</strong>
                <small>Two players, one board</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Modes</h2>
          <Link to="/play" className="small">
            All modes
          </Link>
        </div>
        <div className="grid-2">
          {MODES.filter((mode) => FEATURED_MODES.includes(mode.id)).map((mode) => (
            <Link key={mode.id} className="mode-row" to={`/config?mode=${mode.id}`}>
              <span>
                <strong>{mode.name}</strong>
                <small>{mode.tagline}</small>
              </span>
              <span className="small muted">
                {mode.arena.size}×{mode.arena.size} · {mode.arena.wallsPerPlayer} walls
              </span>
            </Link>
          ))}
        </div>
      </section>

      <p className="tiny dim" style={{ marginTop: 8 }}>
        Online play is server-authoritative. The demo server may sleep when idle; ratings on it are not
        permanent yet.
      </p>
    </div>
  );
}
