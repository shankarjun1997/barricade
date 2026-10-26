import { Link, useNavigate } from 'react-router-dom';
import { MODES, createGame } from '@barricade/engine';
import { Board } from '../components/Board.js';
import { useApp } from '../state/AppContext.js';
import { dailyPuzzle, createPuzzleMatch, puzzleBudget, solvedPuzzles, PUZZLES } from '../lib/puzzles.js';
import { formatDuration, plural } from '../lib/format.js';
import { favouriteMode, levelInfo, winRate } from '../lib/profile.js';
import { saveMatch } from '../lib/match.js';
import { loadLastResult } from '../lib/settle.js';

export function HomeScreen() {
  const navigate = useNavigate();
  const { profile, sfx, toast } = useApp();
  const daily = dailyPuzzle();
  const solved = solvedPuzzles(profile);
  const level = levelInfo(profile.xp);
  const rate = Math.round(winRate(profile) * 100);
  const favourite = favouriteMode(profile.history);
  const last = loadLastResult();
  const preview = createGame({ size: 7, wallsPerPlayer: 5, moveLimit: 240, repetitionLimit: 3, firstPlayer: 'blue' });

  const playDaily = () => {
    const match = createPuzzleMatch(daily);
    saveMatch(match);
    sfx('start');
    toast(`Daily puzzle: ${daily.title}`, 'success');
    navigate('/match');
  };

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Competitive grid duel</span>
          <h1>Race. Wall. Outthink.</h1>
          <p>
            Two rivals, one board. Cast your piece toward the far side while you place barriers to bend
            your opponent's route. Simple to learn, brutal to master.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/config?mode=dash">
              Quick match
            </Link>
            <Link className="btn" to="/bots">
              Challenge a bot
            </Link>
            <button type="button" className="btn btn-ghost" onClick={playDaily}>
              Today's puzzle
            </button>
          </div>
          <div className="row small muted" style={{ marginTop: 14, gap: 14 }}>
            <span>{PUZZLES.length} puzzles</span>
            <span>·</span>
            <span>8 bot personalities</span>
            <span>·</span>
            <span>Local play, no account needed</span>
          </div>
        </div>
        <div className="hero-side">
          <div className="stat-card">
            <span className="stat-label">Rating</span>
            <span className="stat-value green">{profile.rating}</span>
            <span className="tiny muted">Best {profile.bestRating}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Level {level.level}</span>
            <span className="stat-value">{profile.xp.toLocaleString()} XP</span>
            <div className="xp-bar" aria-label={`Level progress ${Math.round(level.progress * 100)} percent`}>
              <div className="xp-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">Record</span>
            <span className="stat-value">
              {profile.wins}–{profile.losses}
              <span className="muted" style={{ fontSize: '1rem' }}> · {rate}%</span>
            </span>
            <span className="tiny muted">{plural(profile.matches, 'match', 'matches')} played</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Time on board</span>
            <span className="stat-value">{formatDuration(profile.playtimeMs)}</span>
            <span className="tiny muted">This device</span>
          </div>
        </div>
      </section>

      {last ? (
        <section className="card" aria-label="Last match">
          <div className="row-between">
            <div>
              <div className="card-title">Last match</div>
              <div className="row" style={{ gap: 8 }}>
                <span className={`pill ${last.result === 'win' ? 'pill-green' : last.result === 'loss' ? 'pill-red' : 'pill-gold'}`}>
                  {last.result === 'win' ? 'Victory' : last.result === 'loss' ? 'Defeat' : 'Draw'}
                </span>
                <span className="small muted">
                  vs {last.opponentName} · {last.size}×{last.size} · {last.plies} plies
                </span>
                {last.ratingAfter !== last.ratingBefore ? (
                  <span className={`small ${last.ratingAfter > last.ratingBefore ? 'green' : 'red'}`}>
                    {last.ratingAfter > last.ratingBefore ? '+' : ''}
                    {last.ratingAfter - last.ratingBefore} rating
                  </span>
                ) : null}
              </div>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/result">
              View result
            </Link>
          </div>
        </section>
      ) : null}

      <section className="grid-2 section" aria-labelledby="daily-title">
        <div className="card">
          <div className="row-between">
            <span className="eyebrow">Daily puzzle</span>
            <span className="pill pill-gold">Free</span>
          </div>
          <h2 id="daily-title" style={{ margin: '8px 0 6px', fontSize: '1.35rem' }}>
            {daily.title}
          </h2>
          <p className="small muted">{daily.description}</p>
          <div className="row" style={{ marginTop: 14, gap: 10 }}>
            <span className="pill">Budget {puzzleBudget(daily)} casts</span>
            <span className="pill">{daily.size}×{daily.size}</span>
            {solved.has(daily.id) ? <span className="pill pill-green">Solved today</span> : null}
          </div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={playDaily}>
              Play daily puzzle
            </button>
            <Link className="btn btn-ghost" to="/puzzles">
              All puzzles
            </Link>
          </div>
        </div>
        <div className="card flush" style={{ padding: 14 }}>
          <div className="board-wrap mini">
            <Board state={preview} mini />
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="modes-title">
        <div className="section-head">
          <h2 id="modes-title">Choose your duel</h2>
          <Link to="/play" className="small">
            All modes
          </Link>
        </div>
        <div className="grid-3">
          {MODES.filter((mode) => mode.id !== 'custom' && mode.id !== 'survival')
            .slice(0, 6)
            .map((mode) => (
              <Link key={mode.id} className="mode-card" to={`/config?mode=${mode.id}`}>
                <div className="mode-top">
                  <h3>{mode.name}</h3>
                  <span className={`pill pill-${mode.accent === 'green' ? 'green' : mode.accent}`}>
                    {mode.ranked ? 'Ranked-ready' : 'Casual'}
                  </span>
                </div>
                <span className="tagline">{mode.tagline}</span>
                <p className="tiny muted">{mode.description}</p>
                <div className="mode-meta">
                  <span className="pill">{mode.arena.size}×{mode.arena.size}</span>
                  <span className="pill">{mode.arena.wallsPerPlayer} barriers</span>
                </div>
              </Link>
            ))}
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="card-title">How a duel works</div>
          <div className="grid-3">
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>1 · Move or build</h3>
              <p className="small muted">Cast one square orthogonally, or spend a barrier to reshape the board.</p>
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>2 · Never seal a route</h3>
              <p className="small muted">A barrier that leaves either player with no path to their goal is illegal.</p>
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>3 · Reach the far side</h3>
              <p className="small muted">Blue races to the top row, Red to the bottom. First across wins.</p>
            </div>
          </div>
          <div className="divider" />
          <div className="row-between small muted">
            <span>
              {favourite ? `Favourite: ${favourite.label} (${favourite.count} ${plural(favourite.count, 'match', 'matches')})` : 'Play a match to start your record.'}
            </span>
            <Link to="/profile" className="small">
              View profile
            </Link>
          </div>
        </div>
      </section>

      <div className="banner gold">
        <strong>Prototype status:</strong>
        <span>
          Phase C is live — local duels, bots, puzzles and clocks. Online ranked multiplayer, reactions and
          subscriptions arrive in Phase B.
        </span>
      </div>
    </div>
  );
}
