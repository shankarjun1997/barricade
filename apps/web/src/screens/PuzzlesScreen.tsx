import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext.js';
import { PUZZLES, createPuzzleMatch, dailyPuzzle, puzzleBudget, solvedPuzzles, type PuzzleDef } from '../lib/puzzles.js';
import { saveMatch } from '../lib/match.js';

function Difficulty({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="difficulty-dots" aria-label={`Difficulty ${level} of 3`}>
      {[1, 2, 3].map((step) => (
        <i key={step} className={step <= level ? 'on' : ''} aria-hidden="true" />
      ))}
    </span>
  );
}

export function PuzzlesScreen() {
  const navigate = useNavigate();
  const { profile, sfx, toast } = useApp();
  const daily = dailyPuzzle();
  const solved = solvedPuzzles(profile);

  const play = (puzzle: PuzzleDef) => {
    const match = createPuzzleMatch(puzzle);
    saveMatch(match);
    sfx('start');
    toast(`${puzzle.title} — budget ${puzzleBudget(puzzle)} casts.`, 'success');
    navigate('/match');
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">Puzzles</span>
          <h1>Sharpen your routes</h1>
          <p className="page-sub">
            Solo drills with a fixed move budget. Undo freely, retry as often as you like, and learn the
            geometry of the board. The solver-validated tactical set arrives in Phase B.
          </p>
        </div>
        <span className="pill pill-green">{solved.size}/{PUZZLES.length} solved</span>
      </header>

      <div className="card" style={{ borderColor: 'rgba(245,196,81,.35)' }}>
        <div className="row-between">
          <div>
            <span className="eyebrow gold">Daily puzzle</span>
            <h2 style={{ fontSize: '1.3rem', marginTop: 4 }}>{daily.title}</h2>
            <p className="small muted">{daily.description}</p>
          </div>
          <div className="row">
            <span className="pill">Budget {puzzleBudget(daily)} casts</span>
            <span className="pill">{daily.size}×{daily.size}</span>
            {solved.has(daily.id) ? <span className="pill pill-green">Solved</span> : null}
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-primary" onClick={() => play(daily)}>
            Play daily
          </button>
          <span className="small dim">Resets at 00:00 UTC · {new Date().toISOString().slice(0, 10)}</span>
        </div>
      </div>

      <div className="grid-3">
        {PUZZLES.map((puzzle) => (
          <article key={puzzle.id} className="puzzle-card">
            <div className="row-between">
              <h3 style={{ fontSize: '1rem' }}>{puzzle.title}</h3>
              <Difficulty level={puzzle.difficulty} />
            </div>
            <p className="small muted">{puzzle.description}</p>
            <div className="row" style={{ gap: 6 }}>
              <span className="pill">{puzzle.size}×{puzzle.size}</span>
              <span className="pill">{puzzleBudget(puzzle)} casts</span>
              {solved.has(puzzle.id) ? <span className="pill pill-green">Solved</span> : null}
            </div>
            <details className="small dim">
              <summary style={{ cursor: 'pointer' }}>Hint</summary>
              <p style={{ marginTop: 6 }}>{puzzle.hint}</p>
            </details>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => play(puzzle)}>
              {solved.has(puzzle.id) ? 'Replay' : 'Solve'}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
