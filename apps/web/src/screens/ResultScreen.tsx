import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { botById, modeById } from '@barricade/engine';
import { useApp } from '../state/AppContext.js';
import { formatDate, formatDuration, reasonLabel } from '../lib/format.js';
import { loadSetup, createMatch, saveMatch } from '../lib/match.js';
import { createPuzzleMatch, puzzleById } from '../lib/puzzles.js';
import { loadLastResult } from '../lib/settle.js';
import type { MatchSummary } from '../lib/profile.js';

export function ResultScreen() {
  const navigate = useNavigate();
  const { profile, sfx, toast } = useApp();
  const [summary] = useState<MatchSummary | null>(() => loadLastResult());

  const ratingDelta = summary ? summary.ratingAfter - summary.ratingBefore : 0;
  const recentRatings = useMemo(
    () => profile.history.slice(0, 10).map((entry) => entry.ratingAfter).reverse(),
    [profile.history],
  );

  if (!summary) {
    return (
      <div className="card">
        <h1 style={{ fontSize: '1.35rem', marginBottom: 8 }}>No result to show</h1>
        <p className="muted small">Finish a match and the result — including rating and XP changes — appears here.</p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn btn-primary" to="/config?mode=dash">Start a match</Link>
          <Link className="btn btn-ghost" to="/">Home</Link>
        </div>
      </div>
    );
  }

  const outcomeClass = summary.result === 'win' ? 'win' : summary.result === 'loss' ? 'loss' : 'draw';
  const title = summary.result === 'win' ? 'Victory' : summary.result === 'loss' ? 'Defeat' : 'Draw';
  const badge = summary.result === 'win' ? 'W' : summary.result === 'loss' ? 'L' : 'D';
  const mode = summary.modeId === 'puzzle' ? 'Puzzle' : modeById(summary.modeId)?.name ?? String(summary.modeId);

  const rematch = () => {
    if (summary.puzzleId) {
      const def = puzzleById(summary.puzzleId);
      if (def) {
        const match = createPuzzleMatch(def);
        saveMatch(match);
        sfx('start');
        navigate('/match');
        return;
      }
    }

    const stored = loadSetup();
    if (stored && stored.modeId === summary.modeId && stored.controller === summary.controller) {
      const match = createMatch(stored);
      saveMatch(match);
      sfx('start');
      navigate('/match');
      return;
    }

    const bot = summary.opponentBot ? botById(summary.opponentBot) : undefined;
    const match = createMatch({
      modeId: summary.modeId,
      controller: summary.controller === 'puzzle' ? 'local' : summary.controller,
      config: {
        size: summary.size,
        wallsPerPlayer: summary.wallsPerPlayer,
        moveLimit: 240,
        repetitionLimit: 3,
        firstPlayer: 'blue',
      },
      timeControlId: summary.timeControlId,
      names: {
        blue: profile.name || 'You',
        red: bot?.name ?? (summary.controller === 'local' ? 'Rival' : summary.opponentName),
      },
      ...(bot && summary.controller === 'bot'
        ? {
            bot: {
              personality: bot.id,
              seed: Math.floor(Math.random() * 2 ** 31),
              name: bot.name,
              rating: bot.elo,
            },
          }
        : {}),
    });
    saveMatch(match);
    sfx('start');
    toast('Rematch created.', 'success');
    navigate('/match');
  };

  return (
    <div className="stack">
      <section className={`result-hero ${outcomeClass}`}>
        <div className="result-badge" aria-hidden="true">{badge}</div>
        <span className="eyebrow">{mode} · {summary.controller === 'bot' ? 'Bot match' : summary.controller === 'puzzle' ? 'Puzzle' : 'Local duel'}</span>
        <h1>{title}</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          {summary.result === 'draw' ? 'Honours even' : summary.result === 'win' ? 'A clean finish' : 'A hard-fought loss'} ·{' '}
          {reasonLabel(summary.reason)} · vs {summary.opponentName}
        </p>

        {summary.controller === 'bot' ? (
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <span className="pill pill-gold">
              {summary.ratingBefore} → {summary.ratingAfter}
              {ratingDelta !== 0 ? ` (${ratingDelta > 0 ? '+' : ''}${ratingDelta})` : ' (0)'}
            </span>
            <span className="pill">+{summary.xpEarned} XP</span>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <span className="pill">{summary.controller === 'local' ? 'Unrated local match' : 'Puzzle XP'}</span>
            <span className="pill">+{summary.xpEarned} XP</span>
          </div>
        )}

        <div className="result-stats">
          <div className="result-stat">
            <span className="stat-label">Moves</span>
            <span className="stat-value">{summary.plies}</span>
          </div>
          <div className="result-stat">
            <span className="stat-label">Walls</span>
            <span className="stat-value">{summary.wallsPlaced}</span>
          </div>
          <div className="result-stat">
            <span className="stat-label">Duration</span>
            <span className="stat-value">{formatDuration(summary.durationMs)}</span>
          </div>
          <div className="result-stat">
            <span className="stat-label">Arena</span>
            <span className="stat-value">{summary.size}×{summary.size}</span>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Next</div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={rematch}>Rematch</button>
            <Link className="btn" to="/config?mode=dash">New match</Link>
            <Link className="btn btn-ghost" to="/play">Modes</Link>
            <Link className="btn btn-ghost" to="/">Home</Link>
          </div>
          <div className="divider" />
          <div className="small muted">
            {summary.controller === 'bot'
              ? 'Rematch keeps your settings and draws a fresh bot seed, so the game unfolds differently.'
              : 'Rematch replays the same ruleset with a fresh board. Local and puzzle results never alter online rating.'}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Rating progress</div>
          {recentRatings.length > 1 ? (
            <div className="rating-spark" aria-label="Recent rating progression">
              {recentRatings.map((value, index) => {
                const min = Math.min(...recentRatings);
                const max = Math.max(...recentRatings);
                const height = max === min ? 50 : 18 + ((value - min) / (max - min)) * 82;
                return <span key={index} style={{ height: `${height}%` }} title={`${value}`} />;
              })}
            </div>
          ) : (
            <div className="empty-note">Play more bot matches to build a rating trend.</div>
          )}
          <div className="divider" />
          <div className="row-between small">
            <span className="muted">Current rating</span>
            <span className="mono green">{profile.rating}</span>
          </div>
          <div className="row-between small" style={{ marginTop: 4 }}>
            <span className="muted">Best rating</span>
            <span className="mono">{profile.bestRating}</span>
          </div>
          <div className="row-between small" style={{ marginTop: 4 }}>
            <span className="muted">Last result</span>
            <span>{formatDate(summary.date)}</span>
          </div>
        </div>
      </div>

      <div className="banner">
        <strong>Integrity note:</strong>
        <span>
          This result was produced by the deterministic local engine. Online results will be settled by the
          authoritative server in Phase B.
        </span>
      </div>
    </div>
  );
}
