import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Move, Player, WallMove } from '@barricade/engine';
import { isLegalMove, legalWallMoves, modeById, timeControlById } from '@barricade/engine';
import { Board } from '../components/Board.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { BackIcon, ChatIcon, DrawIcon, FlagIcon, OptionsIcon } from '../components/GameIcons.js';
import { GameOptions } from '../components/GameOptions.js';
import { Modal } from '../components/Modal.js';
import { PlayerBar } from '../components/PlayerBar.js';
import { useOnline } from '../online/OnlineProvider.js';
import { useApp } from '../state/AppContext.js';
import { useFixedMatchScreen } from '../lib/useFixedMatchScreen.js';
import { useWallDrag } from '../lib/useWallDrag.js';
import { BLOCKADE_RULES, BLOCKADE_RULES_SUMMARY } from '../lib/rules.js';
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
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeen, setChatSeen] = useState(0);
  const [preMove, setPreMove] = useState<Move | null>(null);
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
      setPreMove(null);
      setChatSeen(0);
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
  const canPremove =
    Boolean(match) &&
    match!.status === 'active' &&
    status === 'online' &&
    match!.game.turn !== match!.youAre &&
    !pending &&
    !match!.game.result;
  const canInteract = canAct || canPremove;
  const boardRef = useRef<HTMLDivElement | null>(null);

  const sendMove = (move: Move) => {
    if (!canAct || !match) return;
    setPending(true);
    online.move(match.id, move, createId('mv'));
    sfx(move.kind === 'wall' ? 'wall' : 'move');
  };

  const handleBoardMove = (move: Move) => {
    if (canAct) {
      sendMove(move);
      setMode('move');
      return;
    }
    if (canPremove) {
      setPreMove(move);
      setMode('move');
    }
  };

  const dragLegalWalls = useMemo<WallMove[]>(() => {
    if (!match || !canInteract) return [];
    return legalWallMoves(match.game, match.youAre);
  }, [match, canInteract]);

  const wallDrag = useWallDrag({
    size: match?.game.config.size ?? 9,
    orientation,
    enabled: Boolean(match) && canInteract && match!.game.wallsLeft[match!.youAre] > 0,
    legalWalls: dragLegalWalls,
    boardRef,
    onDrop: (move) => {
      setMode('wall');
      handleBoardMove(move);
    },
    onInvalid: () => {
      sfx('invalid');
      toast('That spot overlaps another wall or seals a route. Use a highlighted slot.', 'error');
    },
  });

  useEffect(() => {
    if (!match || !preMove) return;
    if (match.status !== 'active' || match.game.turn !== match.youAre || pending) return;
    const queued = preMove;
    setPreMove(null);
    if (isLegalMove(match.game, queued)) {
      sendMove(queued);
      toast('Pre-move played.', 'success');
    } else {
      toast('Pre-move cancelled — the board changed.', 'info');
    }
  }, [match, preMove, pending, sendMove, toast]);

  useEffect(() => {
    if (!chatOpen || !match) return;
    const selfId = match[match.youAre].id;
    setChatSeen(online.chatLog.filter((entry) => entry.from.id !== selfId).length);
  }, [chatOpen, online.chatLog, match]);

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
  const opponentChatCount = online.chatLog.filter((entry) => entry.from.id !== you.id).length;
  const unreadChat = Math.max(0, opponentChatCount - chatSeen);
  const openChat = () => {
    setChatSeen(opponentChatCount);
    setChatOpen(true);
  };

  const backToLobby = () => {
    online.leaveMatch(match.id);
    navigate('/online');
  };
  const canPlaceWall = canInteract && match.game.wallsLeft[match.youAre] > 0;

  return (
    <div className="game-screen">
      <header className="game-topbar page-head">
        <button type="button" className="game-back" onClick={backToLobby} aria-label="Back to online lobby">
          <BackIcon />
        </button>
        <div className="game-topbar-title">
          <span className="eyebrow">
            Online · {match.roomCode ? `Room ${match.roomCode}` : 'Global'}
          </span>
          <span className="game-title-sub">
            {modeInfo?.name ?? match.modeId} · {match.config.size}×{match.config.size}
          </span>
        </div>
        <div className="game-topbar-meta">
          <span className={`pill ${match.youAre === 'blue' ? 'pill-blue' : 'pill-red'}`}>
            {match.youAre === 'blue' ? 'Blue' : 'Red'}
          </span>
          <span className={`pill ${status === 'online' ? 'pill-green' : 'pill-gold'}`}>
            {status === 'online' ? 'Online' : status}
          </span>
        </div>
      </header>

      {online.notice ? (
        <div className={`game-notice ${online.notice.kind}`} role="status">
          {online.notice.message}
        </div>
      ) : null}

      {status === 'reconnecting' ? (
        <div className="game-notice warning" role="alert">
          <span className="spinner" aria-hidden="true" />
          <span>Connection lost. Reconnecting…</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={online.retry}>
            Retry
          </button>
        </div>
      ) : null}

      {online.sessionNotice ? (
        <div className="game-notice error" role="alert">
          <span>{online.sessionNotice}</span>
          <Link className="btn btn-sm btn-ghost" to="/online">
            Lobby
          </Link>
        </div>
      ) : null}

      {active && !presence.connected ? (
        <div className="game-notice warning" role="alert">
          Opponent disconnected.
          {forfeitIn !== null ? ` Forfeit in ${Math.ceil(forfeitIn / 1000)}s.` : ' Waiting for the server rule.'}
        </div>
      ) : null}

      {active && incomingDraw ? (
        <div className="game-notice success" role="status">
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

      <PlayerBar
        side="opponent"
        player={opponentColor}
        name={opponent.name}
        rating={opponent.rating}
        subtitle={
          presence.connected
            ? 'Online opponent'
            : `Disconnected${forfeitIn !== null ? ` · ${Math.ceil(forfeitIn / 1000)}s` : ''}`
        }
        wallsLeft={match.game.wallsLeft[opponentColor]}
        totalWalls={match.config.wallsPerPlayer}
        clockMs={clockFor(opponentColor)}
        hasClock={match.initialMs > 0}
        active={active && match.game.turn === opponentColor}
        thinking={active && match.game.turn === opponentColor}
      />

      <div className="game-board-slot">
        {finished ? (
          <section className={`online-result game-result ${outcome}`} aria-live="polite">
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
            <div className="row game-result-meta">
              <span className="pill">{match.game.ply} {plural(match.game.ply, 'ply', 'plies')}</span>
              <span className="pill">{formatDuration(Math.max(1000, match.serverNow - match.createdAt))}</span>
              {match.ratingChanges ? <span className="pill">Elo updated</span> : null}
            </div>

            {rematchRequestedByOpponent && !rematchRequestedByMe ? (
              <div className="game-notice success">
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
              <p className="small muted">Rematch requested — waiting for {opponent.name}.</p>
            ) : null}

            <div className="btn-row game-result-actions">
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
              <button type="button" className="btn btn-sm" onClick={openChat}>
                Chat{unreadChat > 0 ? ` (${unreadChat})` : ''}
              </button>
              <button type="button" className="btn btn-sm" onClick={backToLobby}>
                Back to lobby
              </button>
              <Link className="btn btn-sm btn-ghost" to="/">
                Home
              </Link>
            </div>
          </section>
        ) : (
          <Board
            boardRef={boardRef}
            state={match.game}
            interactive={canInteract}
            player={match.youAre}
            premove={canPremove}
            premoveTarget={preMove?.kind === 'move' ? preMove.to : null}
            mode={mode}
            wallOrientation={orientation}
            onMove={(to) => handleBoardMove({ kind: 'move', to })}
            onWall={(wallMove) => handleBoardMove(wallMove)}
            lastMove={match.game.lastMove?.move ?? null}
            dragging={wallDrag.dragging}
            dragCandidate={wallDrag.candidate}
          />
        )}
      </div>

      <PlayerBar
        side="self"
        player={match.youAre}
        name={you.name}
        wallsLeft={match.game.wallsLeft[match.youAre]}
        totalWalls={match.config.wallsPerPlayer}
        clockMs={clockFor(match.youAre)}
        hasClock={match.initialMs > 0}
        active={active && isMyTurn}
      />

      <div className="game-status" role="status" aria-live="polite">
        <span className={`game-status-dot${match.game.turn === opponentColor ? ' red' : ''}`} aria-hidden="true" />
        <span>
          {finished ? 'Match complete.' : pending ? 'Sending…' : isMyTurn ? 'Your move.' : `${opponent.name}'s move.`}
        </span>
        <span className="game-status-ply">
          {match.game.ply} {plural(match.game.ply, 'ply', 'plies')}
        </span>
        {drawOfferByMe && active ? <span className="game-status-ply">Draw offered</span> : null}
      </div>

      {active && preMove ? (
        <div className="game-premove">
          <span>
            Pre-move queued · {describeMove(preMove, match.config.size)}
          </span>
          <button type="button" onClick={() => setPreMove(null)}>
            Cancel
          </button>
        </div>
      ) : active && canPremove ? (
        <div className="game-premove hint">Opponent’s turn — tap a dot or wall slot to queue your pre-move.</div>
      ) : null}

      {!finished ? (
        <>
          <div className="wall-picker" role="group" aria-label="Wall orientation">
            <button
              type="button"
              className={`wall-choice${orientation === 'H' ? ' selected' : ''}`}
              aria-pressed={orientation === 'H'}
              aria-label="Horizontal wall. Tap to select or drag onto the board."
              disabled={!canPlaceWall}
              onPointerDown={(event) => {
                if (!canPlaceWall) return;
                setOrientation('H');
                setMode('wall');
                wallDrag.start(event, 'H');
              }}
              onClick={() => wallDrag.onClick(() => {
                setOrientation('H');
                setMode('wall');
              })}
            >
              <span className={`wall-choice-piece h${orientation === 'H' ? ' active' : ''}`} aria-hidden="true" />
              <span className="wall-choice-label">Horizontal</span>
            </button>
            <button
              type="button"
              className={`wall-choice${orientation === 'V' ? ' selected' : ''}`}
              aria-pressed={orientation === 'V'}
              aria-label="Vertical wall. Tap to select or drag onto the board."
              disabled={!canPlaceWall}
              onPointerDown={(event) => {
                if (!canPlaceWall) return;
                setOrientation('V');
                setMode('wall');
                wallDrag.start(event, 'V');
              }}
              onClick={() => wallDrag.onClick(() => {
                setOrientation('V');
                setMode('wall');
              })}
            >
              <span className={`wall-choice-piece v${orientation === 'V' ? ' active' : ''}`} aria-hidden="true" />
              <span className="wall-choice-label">Vertical</span>
            </button>
          </div>

          {mode === 'wall' || wallDrag.dragging ? (
            <div className="wall-legend" aria-hidden="true">
              <span><i className="minor" /> Minor</span>
              <span><i className="low" /> Light</span>
              <span><i className="strong" /> Strong</span>
              <span><i className="critical" /> Critical</span>
            </div>
          ) : null}

          <nav className="game-actions" aria-label="Match actions">
            <button type="button" className="game-action" onClick={openChat}>
              <ChatIcon />
              <span>Chat{unreadChat > 0 ? ` (${unreadChat})` : ''}</span>
            </button>
            <button
              type="button"
              className="game-action"
              onClick={() => online.offerDraw(match.id)}
              disabled={!active || match.drawOfferBy !== null}
            >
              <DrawIcon />
              <span>Draw</span>
            </button>
            <button type="button" className="game-action" onClick={() => setOptionsOpen(true)}>
              <OptionsIcon />
              <span>Options</span>
            </button>
            <button type="button" className="game-action danger" onClick={() => setConfirmResign(true)} disabled={!active}>
              <FlagIcon />
              <span>Resign</span>
            </button>
          </nav>
        </>
      ) : null}

      {chatOpen ? (
        <ChatPanel
          messages={online.chatLog}
          selfId={you.id}
          onSend={(option) => online.sendChat(match.id, option.id)}
          onClose={() => setChatOpen(false)}
          disabled={status !== 'online'}
        />
      ) : null}

      {optionsOpen ? (
        <GameOptions title="Options" onClose={() => setOptionsOpen(false)}>
          <section className="game-options-section">
            <h3>How to play · Blockade</h3>
            <p className="game-options-lead">{BLOCKADE_RULES_SUMMARY}</p>
            {BLOCKADE_RULES.map((rule) => (
              <div key={rule.title} className="rule-row">
                <strong>{rule.title}</strong>
                <p>{rule.body}</p>
              </div>
            ))}
            <p className="game-options-note">
              This build still uses the previous movement engine; the Blockade movement update arrives next.
            </p>
          </section>

          <section className="game-options-section">
            <h3>Move log · {match.game.ply}</h3>
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
          </section>

          <section className="game-options-section">
            <h3>Match details</h3>
            <div className="game-options-rows">
              <div className="row-between"><span>Mode</span><span>{modeInfo?.name ?? match.modeId}</span></div>
              <div className="row-between"><span>Clock</span><span>{tc?.label ?? match.timeControlId}</span></div>
              <div className="row-between"><span>Room</span><span>{match.roomCode ?? 'Global'}</span></div>
              <div className="row-between"><span>Connection</span><span>{status}</span></div>
              <div className="row-between"><span>Format</span><span>{formatTimeControl(match.initialMs, match.incrementMs)}</span></div>
            </div>
            <div className="game-options-actions">
              <button type="button" className="btn btn-sm btn-ghost" onClick={backToLobby}>
                Leave match
              </button>
            </div>
            <p className="game-options-note">
              Pre-move: while waiting, tap a dot or wall slot to queue your next move — it plays automatically
              if it is still legal. Undo is disabled online and moves are authoritative on the server.
            </p>
          </section>
        </GameOptions>
      ) : null}

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
