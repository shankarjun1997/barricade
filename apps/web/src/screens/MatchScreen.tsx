import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  agreeDraw,
  distanceToGoal,
  modeById,
  resign,
  timeControlById,
  type Move,
  type Player,
} from '@barricade/engine';
import { chooseBotMove } from '@barricade/bots';
import { Board } from '../components/Board.js';
import { Modal } from '../components/Modal.js';
import { PlayerBar } from '../components/PlayerBar.js';
import { useApp } from '../state/AppContext.js';
import {
  blueMovesPlayed,
  clearMatch,
  clocksRunning,
  commitMove,
  createMatch,
  loadMatch,
  passPuzzleOpponent,
  puzzleOutOfBudget,
  saveMatch,
  tickMatch,
  undoMatch,
  type ActiveMatch,
} from '../lib/match.js';
import { createPuzzleMatch, puzzleById } from '../lib/puzzles.js';
import { applySummary, buildSummary, saveLastResult } from '../lib/settle.js';
import { describeMove, formatDuration, formatTimeControl, plural, reasonLabel } from '../lib/format.js';

type ModalKind = 'resign' | 'draw' | 'restart' | null;

export function MatchScreen() {
  const navigate = useNavigate();
  const { profile, updateProfile, sfx, toast } = useApp();
  const [match, setMatchState] = useState<ActiveMatch | null>(() => loadMatch());
  const matchRef = useRef<ActiveMatch | null>(match);
  matchRef.current = match;

  const [mode, setMode] = useState<'move' | 'wall'>('move');
  const [orientation, setOrientation] = useState<'H' | 'V'>('H');
  const [modal, setModal] = useState<ModalKind>(null);
  const [settling, setSettling] = useState(false);
  const settledRef = useRef<string | null>(null);
  const lastAction = useRef<{ ply: number; at: number }>({ ply: -1, at: 0 });
  const logRef = useRef<HTMLOListElement>(null);

  const update = useCallback((next: ActiveMatch) => {
    matchRef.current = next;
    setMatchState(next);
  }, []);

  // Persist critical transitions immediately.
  useEffect(() => {
    if (match) saveMatch(match);
  }, [match?.id, match?.game.history.length, match?.game.result, match?.failed]);

  // Persist running clocks at a gentle cadence.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (matchRef.current) saveMatch(matchRef.current);
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  // Authoritative-for-local clock.
  useEffect(() => {
    if (!match || !clocksRunning(match)) return;
    const timer = window.setInterval(() => {
      const current = matchRef.current;
      if (!current) return;
      const next = tickMatch(current);
      if (next !== current) update(next);
    }, 200);
    return () => window.clearInterval(timer);
  }, [match?.id, match?.initialMs, match?.game.result, update]);

  // Bot turn.
  useEffect(() => {
    if (!match || match.controller !== 'bot' || !match.bot) return;
    if (match.game.result || match.failed || match.game.turn !== 'red') return;
    const ply = match.game.ply;
    const timer = window.setTimeout(() => {
      const current = matchRef.current;
      if (!current || current.controller !== 'bot' || !current.bot) return;
      if (current.game.result || current.game.turn !== 'red' || current.game.ply !== ply) return;
      const move = chooseBotMove(current.game, {
        personality: current.bot.personality,
        seed: (current.bot.seed + ply * 7919) >>> 0,
      });
      if (!move) return;
      const result = commitMove(current, move);
      if (result.error) return;
      update(result.match);
      sfx(move.kind === 'wall' ? 'wall' : 'move');
    }, 480);
    return () => window.clearTimeout(timer);
  }, [match?.id, match?.game.ply, match?.game.result, match?.controller, match?.failed, sfx, update]);

  // Puzzle opponent passes.
  useEffect(() => {
    if (!match || match.controller !== 'puzzle') return;
    if (match.game.result || match.failed || match.game.turn !== 'red') return;
    const timer = window.setTimeout(() => {
      const current = matchRef.current;
      if (!current || current.controller !== 'puzzle') return;
      if (current.game.result || current.game.turn !== 'red') return;
      update(passPuzzleOpponent(current));
    }, 240);
    return () => window.clearTimeout(timer);
  }, [match?.id, match?.game.ply, match?.game.result, match?.controller, match?.failed, update]);

  // Settle once per match, then open the result screen.
  useEffect(() => {
    const current = matchRef.current;
    if (!current) return;
    if (!current.game.result && !current.failed) return;

    const alreadySettled = profile.settled.includes(current.id);
    if (!alreadySettled && settledRef.current !== current.id) {
      settledRef.current = current.id;
      const summary = buildSummary(current, profile);
      updateProfile((existing) => applySummary(existing, summary));
      saveLastResult(summary);
      setSettling(true);
      sfx(summary.result === 'win' ? 'win' : summary.result === 'loss' ? 'lose' : 'draw');
    } else {
      settledRef.current = current.id;
      setSettling(true);
    }

    const timer = window.setTimeout(() => {
      clearMatch();
      navigate('/result', { replace: true });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [match?.id, match?.game.result, match?.failed, profile, updateProfile, sfx, navigate]);

  const canAct = Boolean(match) && !match!.game.result && !match!.failed && (match!.controller === 'local' || match!.game.turn === 'blue');

  const act = useCallback(
    (move: Move) => {
      const current = matchRef.current;
      if (!current || current.game.result || current.failed) return;
      if (current.controller !== 'local' && current.game.turn !== 'blue') return;
      if (lastAction.current.ply === current.game.ply && Date.now() - lastAction.current.at < 200) return;
      lastAction.current = { ply: current.game.ply, at: Date.now() };

      const result = commitMove(current, move);
      if (result.error) {
        sfx('invalid');
        toast(result.error, 'error');
        return;
      }
      let next = result.match;
      if (puzzleOutOfBudget(next)) next = { ...next, failed: true };
      update(next);
      if (move.kind === 'wall' && next.game.wallsLeft[next.game.turn] <= 0) setMode('move');
      sfx(move.kind === 'wall' ? 'wall' : 'move');
    },
    [sfx, toast, update],
  );

  const handleUndo = useCallback(() => {
    const current = matchRef.current;
    if (!current || !current.allowUndo || current.game.result || current.failed) return;
    if (current.game.history.length === 0) return;
    if (current.controller === 'bot' && current.game.turn === 'red') return;
    update(undoMatch(current));
    sfx('undo');
    toast('Move undone.');
  }, [sfx, toast, update]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'm') setMode('move');
      if (key === 'w') {
        event.preventDefault();
        setMode((current) => (current === 'move' ? 'wall' : 'move'));
      }
      if (key === 'h') {
        setOrientation('H');
        setMode('wall');
      }
      if (key === 'v') {
        setOrientation('V');
        setMode('wall');
      }
      if (key === 'u') {
        event.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [match?.game.history.length]);

  const modeInfo = match ? modeById(match.modeId) : undefined;
  const timeControl = match ? timeControlById(match.timeControlId) : undefined;
  const history = match?.game.history.slice(-30) ?? [];

  const status = useMemo(() => {
    if (!match) return '';
    if (match.failed) return 'Puzzle failed: move budget exceeded.';
    if (match.game.result) return `Match complete — ${reasonLabel(match.game.result.reason)}.`;
    if (match.controller === 'puzzle') {
      return `Puzzle · ${blueMovesPlayed(match)} of ${match.puzzle?.maxBlueMoves ?? '?'} casts used.`;
    }
    if (match.controller === 'bot' && match.game.turn === 'red') return `${match.names.red} is thinking…`;
    if (match.controller === 'local') return `${match.game.turn === 'blue' ? match.names.blue : match.names.red} to move.`;
    return 'Your move.';
  }, [match]);

  const confirmResign = () => {
    const current = matchRef.current;
    if (!current) return;
    const player: Player = current.controller === 'local' ? current.game.turn : 'blue';
    update({ ...current, game: resign(current.game, player) });
    setModal(null);
  };

  const confirmDraw = () => {
    const current = matchRef.current;
    if (!current) return;
    if (current.controller === 'local') {
      update({ ...current, game: agreeDraw(current.game) });
      setModal(null);
      return;
    }
    const botBehind = distanceToGoal(current.game, 'red') > distanceToGoal(current.game, 'blue');
    setModal(null);
    if (botBehind) {
      update({ ...current, game: agreeDraw(current.game) });
      sfx('draw');
      toast('Your opponent accepted the draw.', 'success');
    } else {
      toast('Your opponent declined the draw — they like their position.', 'info');
    }
  };

  const confirmRestart = () => {
    const current = matchRef.current;
    if (!current) return;
    let next: ActiveMatch;
    if (current.controller === 'puzzle' && current.puzzle) {
      const def = puzzleById(current.puzzle.id);
      if (!def) return;
      next = createPuzzleMatch(def);
    } else {
      next = createMatch({
        modeId: current.modeId,
        controller: current.controller,
        config: current.game.config,
        timeControlId: current.timeControlId,
        names: current.names,
        ...(current.bot
          ? { bot: { ...current.bot, seed: Math.floor(Math.random() * 2 ** 31) } }
          : {}),
      });
    }
    settledRef.current = null;
    setSettling(false);
    setMode('move');
    update(next);
    saveMatch(next);
    sfx('start');
    setModal(null);
    toast('New match started.', 'success');
  };

  if (!match) {
    return (
      <div className="card">
        <h1 style={{ fontSize: '1.3rem', marginBottom: 8 }}>No active match</h1>
        <p className="muted small">
          Start a local duel, challenge a bot, or take on today's puzzle. Saved matches restore automatically
          after a refresh.
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn btn-primary" to="/config?mode=dash">Start a match</Link>
          <Link className="btn btn-ghost" to="/play">Browse modes</Link>
          <Link className="btn btn-ghost" to="/">Home</Link>
        </div>
      </div>
    );
  }

  const hasClock = match.initialMs > 0;

  return (
    <div className="stack">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">
            {match.controller === 'puzzle' ? 'Puzzle' : modeInfo?.name ?? 'Match'}
            {match.controller === 'bot' ? ' · vs Bot' : match.controller === 'local' ? ' · Local duel' : ''}
          </span>
          <h1 style={{ fontSize: 'clamp(1.2rem, 2.2vw, 1.5rem)' }}>
            {match.game.config.size}×{match.game.config.size} arena
            <span className="muted" style={{ fontWeight: 500, fontSize: '0.8em' }}>
              {' '}· {match.game.config.wallsPerPlayer} barriers · {formatTimeControl(match.initialMs, match.incrementMs)}
            </span>
          </h1>
        </div>
        <div className="row small muted">
          <span>{match.controller === 'bot' ? 'Offline bot' : match.controller === 'puzzle' ? 'Solo puzzle' : 'Same-device duel'}</span>
        </div>
      </header>

      {settling ? (
        <div className="notice-line success" role="status">
          <span>Match complete. Opening results…</span>
        </div>
      ) : null}

      <div className="match-stage">
        <PlayerBar
          player="red"
          name={match.names.red}
          subtitle={
            match.controller === 'bot' && match.bot
              ? `Bot · ${match.bot.rating}`
              : match.controller === 'puzzle'
                ? 'Puzzle'
                : 'Local rival'
          }
          wallsLeft={match.game.wallsLeft.red}
          totalWalls={match.game.config.wallsPerPlayer}
          clockMs={match.clocks.red}
          hasClock={hasClock}
          active={match.game.turn === 'red' && !match.game.result}
          thinking={match.controller === 'bot' && match.game.turn === 'red' && !match.game.result}
        />

        <Board
          state={match.game}
          interactive={canAct}
          mode={mode}
          wallOrientation={orientation}
          onMove={(to) => act({ kind: 'move', to })}
          onWall={(wallMove) => act(wallMove)}
          lastMove={match.game.lastMove?.move ?? null}
        />

        <PlayerBar
          player="blue"
          name={match.names.blue}
          subtitle={match.controller === 'local' ? 'Local player' : 'You'}
          wallsLeft={match.game.wallsLeft.blue}
          totalWalls={match.game.config.wallsPerPlayer}
          clockMs={match.clocks.blue}
          hasClock={hasClock}
          active={match.game.turn === 'blue' && !match.game.result}
        />

        <div className="match-status" role="status" aria-live="polite">
          <span className="turn-dot" aria-hidden="true" />
          <span>{status}</span>
          <span className="pill">
            {match.game.history.length} {plural(match.game.history.length, 'ply', 'plies')}
          </span>
          {match.controller === 'puzzle' ? (
            <span className="pill pill-gold">
              {blueMovesPlayed(match)}/{match.puzzle?.maxBlueMoves} casts
            </span>
          ) : null}
        </div>

        <div className="action-dock">
          <div className="segmented" role="group" aria-label="Action mode">
            <button type="button" aria-pressed={mode === 'move'} onClick={() => setMode('move')}>
              Move
            </button>
            <button
              type="button"
              aria-pressed={mode === 'wall'}
              onClick={() => setMode('wall')}
              disabled={match.game.wallsLeft[match.game.turn] <= 0}
            >
              Barrier ({match.game.wallsLeft[match.game.turn]})
            </button>
          </div>
          {mode === 'wall' ? (
            <div className="segmented" role="group" aria-label="Barrier orientation">
              <button type="button" aria-pressed={orientation === 'H'} onClick={() => setOrientation('H')}>
                H
              </button>
              <button type="button" aria-pressed={orientation === 'V'} onClick={() => setOrientation('V')}>
                V
              </button>
            </div>
          ) : null}
          <div className="dock-actions">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleUndo}
              disabled={!match.allowUndo || match.game.history.length === 0 || Boolean(match.game.result)}
            >
              Undo
            </button>
            {match.controller !== 'puzzle' ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModal('draw')} disabled={Boolean(match.game.result)}>
                Draw
              </button>
            ) : null}
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setModal('resign')} disabled={Boolean(match.game.result)}>
              Resign
            </button>
          </div>
        </div>
      </div>

      <details className="quiet-details">
        <summary>Move log · {match.game.history.length}</summary>
        {history.length === 0 ? (
          <p className="empty-note">No moves yet.</p>
        ) : (
          <ol className="log-list" ref={logRef}>
            {history.map((record) => (
              <li key={record.ply} className={`log-entry ${record.by}-log`}>
                <span className="log-ply">{record.ply}.</span>
                <span className="log-actor">{record.by === 'blue' ? 'Blue' : 'Red'}</span>
                <span>{describeMove(record.move, match.game.config.size)}</span>
              </li>
            ))}
          </ol>
        )}
      </details>

      <details className="quiet-details">
        <summary>Match details</summary>
        <div className="quiet-content small muted">
          <div className="row-between">
            <span>Clock</span>
            <span>{timeControl ? timeControl.label : 'No clock'}</span>
          </div>
          <div className="row-between">
            <span>Duration</span>
            <span>{formatDuration(Math.max(0, Date.now() - match.createdAt))}</span>
          </div>
          <div className="row-between">
            <span>Barriers</span>
            <span>Blue {match.game.wallsLeft.blue} · Red {match.game.wallsLeft.red}</span>
          </div>
          <div className="divider" />
          <p>Move one square or place a barrier. A barrier cannot seal every route. Reach the far row to win.</p>
          <p>Shortcuts: M move · W barrier · H/V orientation · U undo.</p>
          <p>This match is stored on this device only. Refreshing is safe.</p>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setModal('restart')}>
            Restart match
          </button>
        </div>
      </details>

      {modal === 'resign' ? (
        <Modal
          title="Resign this match?"
          confirmLabel="Resign"
          danger
          onConfirm={confirmResign}
          onCancel={() => setModal(null)}
        >
          <p>
            {match.controller === 'local'
              ? `${match.game.turn === 'blue' ? match.names.blue : match.names.red} concedes the match.`
              : 'Your opponent will be awarded the win.'}
          </p>
        </Modal>
      ) : null}

      {modal === 'draw' ? (
        <Modal
          title="Offer a draw?"
          confirmLabel={match.controller === 'local' ? 'Agree draw' : 'Offer draw'}
          onConfirm={confirmDraw}
          onCancel={() => setModal(null)}
        >
          <p>
            {match.controller === 'local'
              ? 'In a local duel, offering a draw ends the match immediately.'
              : 'The bot will accept only if it believes it is worse off.'}
          </p>
        </Modal>
      ) : null}

      {modal === 'restart' ? (
        <Modal
          title="Restart with the same settings?"
          confirmLabel="Restart"
          onConfirm={confirmRestart}
          onCancel={() => setModal(null)}
        >
          <p>The current match will be discarded. Your profile record is only updated for finished matches.</p>
        </Modal>
      ) : null}
    </div>
  );
}
