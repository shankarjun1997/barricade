import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Move, Player, WallMove } from '@barricade/engine';
import { legalWallMoves, modeById, timeControlById } from '@barricade/engine';
import { Board } from '../components/Board.js';
import { Modal } from '../components/Modal.js';
import { PlayerBar } from '../components/PlayerBar.js';
import { useOnline } from '../online/OnlineProvider.js';
import { useApp } from '../state/AppContext.js';
import { useFixedMatchScreen } from '../lib/useFixedMatchScreen.js';
import { useWallDrag } from '../lib/useWallDrag.js';
import { createId } from '../lib/storage.js';
import { describeMove, formatDuration, formatTimeControl, plural, reasonLabel } from '../lib/format.js';

export function OnlineMatchScreen() {
  const navigate = useNavigate();
  const { sfx, toast } = useApp();
  const online = useOnline();
  const { match, status, connect } = online;

  const [mode, setMode] = useState<'move' | 'wall'>('move');
  const [orientation, setOrientation] = useState<'H' | 'V'>('H');
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [confirmResign, setConfirmResign] = useState(false);
  const previousPly = useRef(0);
  const previousMatchId = useRef<string | null>(null);
  const previousStatus = useRef<string | null>(null);

  useEffect(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 4000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    if (online.notice?.kind === 'error') setPending(false);
  }, [online.notice?.id, online.notice?.kind]);

  useEffect(() => {
    if (!match) return;
    const last = match.game.lastMove;

    if (previousMatchId.current !== match.id) {
      previousMatchId.current = match.id;
      previousPly.current = match.game.ply;
      previousStatus.current = match.status;
      setPending(false);
      setMode('move');
      return;
    }

    if (match.game.ply > previousPly.current) {
      previousPly.current = match.game.ply;
      setPending(false);
      if (last && last.by !== match.youAre) {
        sfx(last.move.kind === 'wall' ? 'wall' : 'move');
      }
    }

    if (match.status === 'finished' && previousStatus.current !== 'finished') {
      previousStatus.current = match.status;
      const outcome =
        !match.result ? 'draw' : match.result.kind === 'draw' ? 'draw' : match.result.winner === match.youAre ? 'win' : 'loss';
      sfx(outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'draw');
    }
  }, [match, sfx]);

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
      if (key === 'r') {
        event.preventDefault();
        setMode('wall');
        setOrientation((current) => (current === 'H' ? 'V' : 'H'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const canAct = Boolean(match) && match!.status === 'active' && status === 'online' && match!.game.turn === match!.youAre && !pending;
  const boardRef = useRef<HTMLDivElement | null>(null);

  const sendMove = (move: Move) => {
    if (!canAct || !match) return;
    setPending(true);
    online.move(match.id, move, createId('mv'));
    sfx(move.kind === 'wall' ? 'wall' : 'move');
  };

  const dragLegalWalls = useMemo<WallMove[]>(() => {
    if (!match || !canAct) return [];
    return legalWallMoves(match.game, match.game.turn).filter((wall) => wall.orientation === orientation);
  }, [match, canAct, orientation]);

  const wallDrag = useWallDrag({
    size: match?.game.config.size ?? 9,
    orientation,
    enabled: Boolean(match) && canAct && match!.game.wallsLeft[match!.game.turn] > 0,
    legalWalls: dragLegalWalls,
    boardRef,
    onDrop: (move) => {
      setMode('wall');
      sendMove(move);
    },
    onInvalid: () => {
      sfx('invalid');
      toast('That spot overlaps another barrier or seals a route. Use a highlighted slot.', 'error');
    },
    onTap: () => {
      setMode('wall');
      setOrientation((current) => (current === 'H' ? 'V' : 'H'));
    },
  });

  useFixedMatchScreen(Boolean(match));

  if (!match) {
    return (
      <div className="panel">
        <span className="eyebrow">Online</span>
        <h1 style={{ fontSize: '1.35rem', margin: '6px 0 8px' }}>
          {!online.configured
            ? 'Online server not configured'
            : status === 'connecting' || status === 'reconnecting'
              ? 'Connecting…'
              : 'No active online match'}
        </h1>
        <p className="muted small">
          {!online.configured
            ? 'Set VITE_WS_URL to the game server and rebuild. Local play remains available.'
            : 'Start global matchmaking or create a room from the online lobby.'}
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link className="btn btn-primary" to="/online">Online lobby</Link>
          <Link className="btn btn-ghost" to="/play">Local play</Link>
        </div>
      </div>
    );
  }

  const you = match[match.youAre];
  const opponentColor: Player = match.youAre === 'blue' ? 'red' : 'blue';
  const opponent = match[opponentColor];
  const presence = match.presence[opponentColor];
  const liveServerNow = now + online.serverOffset;

  const clockFor = (color: Player): number => {
    if (match.status !== 'active') return match.clocks[color];
    const elapsed = match.game.turn === color ? Math.max(0, liveServerNow - match.serverNow) : 0;
    return Math.max(0, match.clocks[color] - elapsed);
  };

  const finished = match.status === 'finished';
  const active = match.status === 'active';
  const forfeitIn = presence.reconnectDeadline ? Math.max(0, presence.reconnectDeadline - liveServerNow) : null;
  const isMyTurn = active && match.game.turn === match.youAre;
  const modeInfo = modeById(match.modeId);
  const tc = timeControlById(match.timeControlId);
  const history = match.game.history.slice(-40);

  const outcome = !match.result
    ? 'abandoned'
    : match.result.kind === 'draw'
      ? 'draw'
      : match.result.winner === match.youAre
        ? 'win'
        : 'loss';
  const title = outcome === 'win' ? 'Victory' : outcome === 'loss' ? 'Defeat' : outcome === 'draw' ? 'Draw' : 'Match abandoned';
  const ratingDelta = match.ratingChanges?.[match.youAre] ?? 0;
  const drawOfferByMe = match.drawOfferBy === match.youAre;
  const incomingDraw = online.drawOffer?.matchId === match.id ? online.drawOffer : null;
  const rematchRequestedByMe = online.rematchRequests.some((player) => player.id === you.id);
  const rematchRequestedByOpponent = online.rematchRequests.some((player) => player.id !== you.id);

  const backToLobby = () => {
    online.leaveMatch(match.id);
    navigate('/online');
  };

  return (
    <div className="stack">
      <header className="page-head compact-head">
        <div>
          <span className="eyebrow">
            Online · {modeInfo?.name ?? match.modeId} · {match.roomCode ? `Room ${match.roomCode}` : 'Global'}
          </span>
          <h1 style={{ fontSize: 'clamp(1.15rem, 2.2vw, 1.4rem)' }}>
            {match.config.size}×{match.config.size}
            <span className="muted" style={{ fontWeight: 500, fontSize: '0.85em' }}>
              {' '}· {match.config.wallsPerPlayer} barriers · {formatTimeControl(match.initialMs, match.incrementMs)}
            </span>
          </h1>
        </div>
        <div className="row small" style={{ gap: 8 }}>
          <span className={`pill ${match.youAre === 'blue' ? 'pill-blue' : 'pill-red'}`}>
            {match.youAre === 'blue' ? 'Blue' : 'Red'}
          </span>
          <span className={`pill ${status === 'online' ? 'pill-green' : 'pill-gold'}`}>
            {status === 'online' ? 'Online' : status}
          </span>
        </div>
      </header>

      {online.notice ? (
        <div className={`notice-line ${online.notice.kind}`} role="status">
          <span>{online.notice.message}</span>
        </div>
      ) : null}

      {status === 'reconnecting' ? (
        <div className="notice-line warning" role="alert">
          <span className="spinner" aria-hidden="true" />
          <span>Connection lost. Reconnecting…</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={online.retry}>Retry</button>
        </div>
      ) : null}

      {online.sessionNotice ? (
        <div className="notice-line error" role="alert">
          <span>{online.sessionNotice}</span>
          <Link className="btn btn-sm btn-ghost" to="/online">Lobby</Link>
        </div>
      ) : null}

      {active && !presence.connected ? (
        <div className="notice-line warning" role="alert">
          <span>
            Opponent disconnected.
            {forfeitIn !== null ? ` Forfeit in ${Math.ceil(forfeitIn / 1000)}s.` : ' Waiting for the server rule.'}
          </span>
        </div>
      ) : null}

      {active && incomingDraw ? (
        <div className="notice-line success" role="status">
          <span>{incomingDraw.from.name} offers a draw.</span>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => online.respondDraw(match.id, true)}>
              Accept
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => online.respondDraw(match.id, false)}>
              Decline
            </button>
          </div>
        </div>
      ) : null}

      {finished ? (
        <section className={`online-result ${outcome}`} aria-live="polite">
          <div className="online-result-top">
            <div className={`result-badge ${outcome}`} aria-hidden="true">
              {outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : outcome === 'draw' ? 'D' : '–'}
            </div>
            <div>
              <span className="eyebrow">Server result</span>
              <h2>{title}</h2>
              <p className="small muted">
                {match.result ? reasonLabel(match.result.reason) : 'Abandoned'} · vs {opponent.name}
              </p>
            </div>
            <div className="online-result-rating">
              <div className="tiny muted">Rating</div>
              <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{you.rating}</div>
              {match.ratingChanges ? (
                <div className={`small ${ratingDelta > 0 ? 'green' : ratingDelta < 0 ? 'red' : 'dim'}`}>
                  {ratingDelta > 0 ? '+' : ''}{ratingDelta}
                </div>
              ) : null}
            </div>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 6 }}>
            <span className="pill">{match.game.ply} {plural(match.game.ply, 'ply', 'plies')}</span>
            <span className="pill">{formatDuration(Math.max(1000, match.serverNow - match.createdAt))}</span>
            {match.ratingChanges ? <span className="pill">Elo updated</span> : null}
          </div>

          {rematchRequestedByOpponent && !rematchRequestedByMe ? (
            <div className="notice-line success" style={{ marginTop: 10 }}>
              <span>{opponent.name} wants a rematch.</span>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => online.respondRematch(match.id, true)}>
                  Accept rematch
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => online.respondRematch(match.id, false)}>
                  Decline
                </button>
              </div>
            </div>
          ) : null}
          {rematchRequestedByMe ? (
            <p className="small muted" style={{ marginTop: 10 }}>Rematch requested — waiting for {opponent.name}.</p>
          ) : null}

          <div className="btn-row" style={{ marginTop: 12 }}>
            {!rematchRequestedByMe ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => online.requestRematch(match.id)}
                disabled={!presence.connected}
              >
                Rematch
              </button>
            ) : null}
            <button type="button" className="btn btn-sm" onClick={backToLobby}>Back to lobby</button>
            <Link className="btn btn-sm btn-ghost" to="/">Home</Link>
          </div>
        </section>
      ) : null}

      <div className="match-stage">
        <PlayerBar
          player={opponentColor}
          name={opponent.name}
          subtitle={
            presence.connected
              ? `Opponent · ${opponent.rating}`
              : `Disconnected${forfeitIn !== null ? ` · ${Math.ceil(forfeitIn / 1000)}s` : ''}`
          }
          wallsLeft={match.game.wallsLeft[opponentColor]}
          totalWalls={match.config.wallsPerPlayer}
          clockMs={clockFor(opponentColor)}
          hasClock={match.initialMs > 0}
          active={active && match.game.turn === opponentColor}
        />

        <div className="board-slot">
          <Board
            boardRef={boardRef}
            state={match.game}
            interactive={canAct}
            mode={mode}
            wallOrientation={orientation}
            onMove={(to) => sendMove({ kind: 'move', to })}
            onWall={(wallMove) => sendMove(wallMove)}
            lastMove={match.game.lastMove?.move ?? null}
            dragging={wallDrag.dragging}
            dragCandidate={wallDrag.candidate}
          />
        </div>

        <PlayerBar
          player={match.youAre}
          name={you.name}
          subtitle={`You · ${you.rating}`}
          wallsLeft={match.game.wallsLeft[match.youAre]}
          totalWalls={match.config.wallsPerPlayer}
          clockMs={clockFor(match.youAre)}
          hasClock={match.initialMs > 0}
          active={active && isMyTurn}
          thinking={pending}
        />

        <div className="match-status" role="status" aria-live="polite">
          <span className="turn-dot" aria-hidden="true" />
          <span>
            {finished ? 'Match complete.' : pending ? 'Sending…' : isMyTurn ? 'Your move.' : `${opponent.name}'s move.`}
          </span>
          <span className="pill">{match.game.ply} {plural(match.game.ply, 'ply', 'plies')}</span>
          {drawOfferByMe && active ? <span className="pill">Draw offered</span> : null}
        </div>

        <div className="action-dock">
          <div className="segmented" role="group" aria-label="Action mode">
            <button type="button" aria-pressed={mode === 'move'} onClick={() => setMode('move')} disabled={!active}>
              Move
            </button>
            <button
              type="button"
              aria-pressed={mode === 'wall'}
              onClick={() => setMode('wall')}
              disabled={!active || match.game.wallsLeft[match.game.turn] <= 0}
            >
              Barrier ({match.game.wallsLeft[match.game.turn]})
            </button>
          </div>
          {canAct && match.game.wallsLeft[match.game.turn] > 0 ? (
            <div className="wall-tray" role="group" aria-label="Barrier tray">
              <button
                type="button"
                className={`wall-tray-stick ${orientation === 'H' ? 'h' : 'v'}`}
                onPointerDown={(event) => {
                  setMode('wall');
                  wallDrag.start(event);
                }}
                onClick={wallDrag.onClick}
                aria-label={`Drag a ${orientation === 'H' ? 'horizontal' : 'vertical'} barrier onto the board. Click to rotate.`}
                title={`Drag barrier · ${orientation === 'H' ? 'horizontal' : 'vertical'} (click to rotate)`}
              />
              <div className="segmented" role="group" aria-label="Barrier orientation">
                <button
                  type="button"
                  aria-pressed={orientation === 'H'}
                  onClick={() => {
                    setOrientation('H');
                    setMode('wall');
                  }}
                >
                  H
                </button>
                <button
                  type="button"
                  aria-pressed={orientation === 'V'}
                  onClick={() => {
                    setOrientation('V');
                    setMode('wall');
                  }}
                >
                  V
                </button>
              </div>
            </div>
          ) : null}
          <div className="dock-actions">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => online.offerDraw(match.id)}
              disabled={!active || match.drawOfferBy !== null}
            >
              Draw
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmResign(true)} disabled={!active}>
              Resign
            </button>
          </div>
        </div>
      </div>

      <details className="quiet-details">
        <summary>Move log · {match.game.ply}</summary>
        {history.length === 0 ? (
          <p className="empty-note">No moves yet.</p>
        ) : (
          <ol className="log-list">
            {history.map((record) => (
              <li key={record.ply} className={`log-entry ${record.by}-log`}>
                <span className="log-ply">{record.ply}.</span>
                <span className="log-actor">{record.by === 'blue' ? 'Blue' : 'Red'}</span>
                <span>{describeMove(record.move, match.config.size)}</span>
              </li>
            ))}
          </ol>
        )}
      </details>

      <details className="quiet-details">
        <summary>Match details</summary>
        <div className="quiet-content small muted">
          <div className="row-between"><span>Mode</span><span>{modeInfo?.name ?? match.modeId}</span></div>
          <div className="row-between"><span>Clock</span><span>{tc?.label ?? match.timeControlId}</span></div>
          <div className="row-between"><span>Room</span><span>{match.roomCode ?? 'Global'}</span></div>
          <div className="row-between"><span>Connection</span><span>{status}</span></div>
          <div className="divider" />
          <p>Move one square or drag a barrier onto a highlighted slot. A barrier cannot seal every route. Reach the far row to win.</p>
          <p>Shortcuts: M move · W barrier · H/V orientation · R rotate. Undo is disabled online.</p>
        </div>
      </details>

      {confirmResign ? (
        <Modal
          title="Resign this match?"
          confirmLabel="Resign"
          danger
          onConfirm={() => {
            setConfirmResign(false);
            online.resign(match.id);
          }}
          onCancel={() => setConfirmResign(false)}
        >
          <p>The server awards the win to your opponent and updates both ratings.</p>
        </Modal>
      ) : null}
    </div>
  );
}
