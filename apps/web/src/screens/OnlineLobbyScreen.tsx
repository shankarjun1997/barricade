import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MODES, modeById, timeControlById, type ModeId } from '@barricade/engine';
import { useApp } from '../state/AppContext.js';
import { useOnline } from '../online/OnlineProvider.js';
import { Modal } from '../components/Modal.js';
import { formatDuration, formatTimeControl } from '../lib/format.js';

const ONLINE_MODE_IDS = ['sprint', 'dash', 'tempo', 'marathon', 'fortress', 'tactical'] as const;
const ONLINE_MODES = MODES.filter((mode) => (ONLINE_MODE_IDS as readonly string[]).includes(mode.id));

function statusLabel(status: string): string {
  switch (status) {
    case 'online':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    case 'offline':
      return 'Offline';
    case 'unconfigured':
      return 'Server not configured';
    default:
      return 'Ready';
  }
}

export function OnlineLobbyScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast, sfx } = useApp();
  const online = useOnline();
  const { connect, status, room, match, queue, lobby, self } = online;

  const [modeId, setModeId] = useState<ModeId>('dash');
  const [timeControlId, setTimeControlId] = useState('dash-tc');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [joinCode, setJoinCode] = useState('');
  const [nameDraft, setNameDraft] = useState(self?.name ?? online.identity.name);
  const [confirmReset, setConfirmReset] = useState(false);
  const autoJoined = useRef<string | null>(null);

  const mode = modeById(modeId) ?? ONLINE_MODES[0]!;
  const roomParam = params.get('room')?.toUpperCase() ?? '';
  const queueActive = queue.state === 'queued';

  useEffect(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    if (match) navigate('/online/match');
  }, [match, navigate]);

  useEffect(() => {
    if (self?.name) setNameDraft(self.name);
  }, [self?.name]);

  useEffect(() => {
    if (!mode.timeControls.includes(timeControlId)) {
      setTimeControlId(mode.defaultTimeControl);
    }
  }, [mode, timeControlId]);

  useEffect(() => {
    if (!roomParam || status !== 'online' || room || match || queueActive) return;
    if (autoJoined.current === roomParam) return;
    autoJoined.current = roomParam;
    online.joinRoom(roomParam);
  }, [roomParam, status, room, match, queueActive, online]);

  const timeControls = useMemo(
    () => mode.timeControls.map((id) => timeControlById(id)).filter((tc): tc is NonNullable<typeof tc> => Boolean(tc)),
    [mode],
  );

  const selectedControl = timeControlById(timeControlId);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied.`, 'success');
    } catch {
      toast('Clipboard is unavailable on this device.', 'error');
    }
  };

  const shareRoom = (code: string) => {
    void copy(`${window.location.origin}/online?room=${code}`, 'Invite link');
  };

  const chooseMode = (next: ModeId) => {
    setModeId(next);
    const definition = modeById(next);
    if (definition) setTimeControlId(definition.defaultTimeControl);
  };

  const saveName = () => {
    if (online.setName(nameDraft)) {
      sfx('click');
      toast('Name updated.', 'success');
    }
  };

  const setup = !online.configured;

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">Online</span>
          <h1>Duel players worldwide</h1>
          <p className="page-sub">
            Global matchmaking and private rooms on an authoritative server. Moves, clocks, forfeits and ratings
            are decided server-side — the browser never referees its own game.
          </p>
        </div>
        <span className={`pill ${status === 'online' ? 'pill-green' : status === 'reconnecting' ? 'pill-gold' : 'pill-red'}`}>
          {statusLabel(status)}
          {online.latencyMs !== null && status === 'online' ? ` · ${online.latencyMs}ms` : ''}
        </span>
      </header>

      {online.notice ? (
        <div className={`banner ${online.notice.kind === 'error' ? 'gold' : online.notice.kind === 'success' ? 'green' : ''}`} role="status">
          <span>{online.notice.message}</span>
        </div>
      ) : null}

      {online.serverNotice ? (
        <div className="banner gold" role="status">
          <strong>Host notice:</strong>
          <span>{online.serverNotice}</span>
        </div>
      ) : null}

      {online.sessionNotice ? (
        <div className="banner gold" role="alert">
          <strong>Session problem:</strong>
          <span>{online.sessionNotice}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(true)}>
            Reset identity
          </button>
        </div>
      ) : null}

      {status === 'reconnecting' ? (
        <div className="banner" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Connection lost. Reconnecting with your session token…</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={online.retry}>Retry now</button>
        </div>
      ) : null}

      {setup ? (
        <section className="card">
          <div className="card-title">Online server not configured</div>
          <p className="small muted">
            The web build is ready, but no WebSocket endpoint was provided at build time. Set
            <code> VITE_WS_URL </code> to the deployed game server (for example <code>wss://your-server.example/ws</code>)
            and rebuild. Locally the client defaults to <code>ws://localhost:8787/ws</code>.
          </p>
          <div className="divider" />
          <div className="grid-2">
            <div>
              <div className="card-title">Run locally</div>
              <pre className="code-block">npm run server:dev{'\n'}npm run dev</pre>
            </div>
            <div>
              <div className="card-title">Production env</div>
              <pre className="code-block">VITE_WS_URL=wss://host/ws{'\n'}ALLOWED_ORIGINS=https://barricade-ruby.vercel.app</pre>
            </div>
          </div>
          <div className="tiny dim" style={{ marginTop: 12 }}>
            No simulated players are shown. Online play activates only when a real server is reachable.
          </div>
        </section>
      ) : null}

      <div className="grid-2">
        <section className="card">
          <div className="card-title">Your online identity</div>
          <div className="row-between">
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{self?.name ?? online.identity.name}</div>
              <div className="small muted">
                {self
                  ? `${self.rating} rating · ${self.wins}W ${self.losses}L ${self.draws}D`
                  : 'Guest session — rating starts at 1000'}
              </div>
            </div>
            <span className={`pill ${self ? 'pill-green' : ''}`}>{self ? 'Guest online' : statusLabel(status)}</span>
          </div>
          <div className="divider" />
          <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="online-name">Display name</label>
              <input
                id="online-name"
                type="text"
                maxLength={24}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && saveName()}
              />
            </div>
            <button type="button" className="btn btn-ghost" onClick={saveName}>Save</button>
          </div>
          <div className="row small muted" style={{ marginTop: 10, gap: 12 }}>
            <span>Server: <span className="mono tiny">{online.serverUrl ?? 'not configured'}</span></span>
            {status !== 'online' && online.configured ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={online.retry}>Reconnect</button>
            ) : null}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(true)}>
              New guest identity
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Global matchmaking</div>
          {queueActive ? (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row">
                <span className="spinner" aria-hidden="true" />
                <strong>Searching for an opponent…</strong>
              </div>
              <div className="small muted">
                {modeById(queue.modeId ?? modeId)?.name ?? 'Mode'} · {timeControlById(queue.timeControlId ?? timeControlId)?.label ?? ''} ·{' '}
                position {queue.position ?? 1} · waiting {formatDuration(queue.waitMs ?? 0)}
              </div>
              <div className="row">
                <button type="button" className="btn btn-danger" onClick={() => { online.cancelQueue(); sfx('click'); }}>
                  Cancel search
                </button>
                <span className="tiny dim">{lobby?.inQueue ?? 0} in queue · {lobby?.online ?? 0} online</span>
              </div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="online-mode">Mode</label>
                  <select id="online-mode" value={modeId} onChange={(event) => chooseMode(event.target.value as ModeId)}>
                    {ONLINE_MODES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.arena.size}×{item.arena.size} · {item.arena.wallsPerPlayer} barriers
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="online-clock">Clock</label>
                  <select id="online-clock" value={timeControlId} onChange={(event) => setTimeControlId(event.target.value)}>
                    {timeControls.map((tc) => (
                      <option key={tc.id} value={tc.id}>{tc.label} — {tc.description}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row-between">
                <span className="small muted">
                  {selectedControl ? formatTimeControl(selectedControl.initialMs, selectedControl.incrementMs) : ''} · Elo-rated
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={status !== 'online' || Boolean(room)}
                  onClick={() => { online.quickMatch(modeId, timeControlId); sfx('start'); }}
                >
                  Find opponent
                </button>
              </div>
              <div className="tiny dim">
                {lobby ? `${lobby.online} online · ${lobby.inQueue} searching · ${lobby.activeMatches} matches live` : 'Waiting for the server…'}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-title">Private & public rooms</div>
          {room ? (
            <div className="stack" style={{ gap: 12 }}>
              <div className="row-between">
                <div>
                  <div className="tiny muted">Room code</div>
                  <div className="room-code">{room.code}</div>
                </div>
                <span className={`pill ${room.status === 'waiting' ? 'pill-gold' : 'pill-green'}`}>
                  {room.status === 'waiting' ? 'Waiting for opponent' : room.status === 'playing' ? 'Match starting' : 'Finished'}
                </span>
              </div>
              <div className="small muted">
                {modeById(room.modeId)?.name ?? room.modeId} · {room.config.size}×{room.config.size} ·{' '}
                {room.config.wallsPerPlayer} barriers · {room.visibility}
              </div>
              <div className="row">
                <span className="pill pill-blue">Blue · {room.host.name}</span>
                <span className="pill">{room.guest ? `Red · ${room.guest.name}` : 'Waiting for a challenger…'}</span>
              </div>
              <div className="btn-row">
                <button type="button" className="btn btn-sm" onClick={() => void copy(room.code, 'Room code')}>Copy code</button>
                <button type="button" className="btn btn-sm" onClick={() => shareRoom(room.code)}>Copy invite link</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { online.leaveRoom(); sfx('click'); }}>
                  Leave room
                </button>
              </div>
              {room.status === 'playing' ? (
                <div className="banner green">
                  <span>Opponent joined. The match is starting — the server has assigned colours.</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <div className="grid-2">
                <div className="field">
                  <label id="room-mode-label">Room mode</label>
                  <select value={modeId} onChange={(event) => chooseMode(event.target.value as ModeId)} aria-labelledby="room-mode-label">
                    {ONLINE_MODES.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label id="room-clock-label">Room clock</label>
                  <select value={timeControlId} onChange={(event) => setTimeControlId(event.target.value)} aria-labelledby="room-clock-label">
                    {timeControls.map((tc) => (
                      <option key={tc.id} value={tc.id}>{tc.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row-between">
                <div className="segmented" role="group" aria-label="Room visibility">
                  <button type="button" aria-pressed={visibility === 'public'} onClick={() => setVisibility('public')}>Public</button>
                  <button type="button" aria-pressed={visibility === 'private'} onClick={() => setVisibility('private')}>Private</button>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={status !== 'online' || queueActive}
                  onClick={() => { online.createRoom(modeId, timeControlId, visibility); sfx('click'); }}
                >
                  Create room
                </button>
              </div>
              <div className="divider" />
              <div className="field">
                <label htmlFor="join-code">Join with a code</label>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    id="join-code"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    maxLength={6}
                    placeholder="ABC234"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={status !== 'online' || joinCode.length !== 6 || queueActive}
                    onClick={() => { online.joinRoom(joinCode); sfx('click'); }}
                  >
                    Join
                  </button>
                </div>
                {roomParam ? <span className="tiny dim">Invite code from link: {roomParam}</span> : null}
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-title">Open rooms</div>
          {lobby && lobby.rooms.length > 0 ? (
            <div className="list">
              {lobby.rooms.map((item) => (
                <div key={item.code} className="list-row">
                  <div className="list-main">
                    <div className="list-title">
                      {item.hostName} <span className="pill">{item.hostRating}</span>
                    </div>
                    <div className="list-sub">
                      {modeById(item.modeId)?.name ?? item.modeId} · {item.config.size}×{item.config.size} ·{' '}
                      {item.config.wallsPerPlayer} barriers · {timeControlById(item.timeControlId)?.label ?? item.timeControlId}
                    </div>
                  </div>
                  <span className="mono small">{item.code}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={status !== 'online' || queueActive || Boolean(room)}
                    onClick={() => { online.joinRoom(item.code); sfx('click'); }}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-note">
              {lobby ? 'No public rooms waiting. Create one or search globally.' : 'Loading rooms…'}
            </div>
          )}
          <div className="divider" />
          <div className="tiny dim">
            Waiting rooms expire after 10 minutes. Codes are six characters and omit ambiguous letters.
          </div>
        </section>
      </div>

      <section className="card">
        <div className="row-between">
          <div className="card-title" style={{ marginBottom: 0 }}>Online leaderboard</div>
          <span className="small muted">Updated live · server-side Elo</span>
        </div>
        {lobby && lobby.leaderboard.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="online-board">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Player</th>
                  <th scope="col">Rating</th>
                  <th scope="col">Record</th>
                </tr>
              </thead>
              <tbody>
                {lobby.leaderboard.map((entry, index) => (
                  <tr key={entry.id} style={entry.id === self?.id ? { background: 'rgba(53,224,127,.06)' } : undefined}>
                    <td><span className={`rank-badge${index < 3 ? ' top' : ''}`}>{index + 1}</span></td>
                    <td>
                      <strong>{entry.name}</strong>
                      {entry.id === self?.id ? <span className="pill pill-green" style={{ marginLeft: 8 }}>You</span> : null}
                    </td>
                    <td className="mono">{entry.rating}</td>
                    <td className="small muted">{entry.wins}W · {entry.losses}L · {entry.draws}D</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-note">No rated games yet. Be the first on the board.</div>
        )}
        <div className="divider" />
        <div className="tiny dim">
          Ratings, wins and losses are stored by the game server. Local matches and puzzles never affect them.
          Subscriptions cannot alter matchmaking or rating maths.
        </div>
      </section>

      <div className="banner">
        <strong>Fair play:</strong>
        <span>
          Every move is validated by the server engine. Clock expiry, forfeits and reconnects are measured
          server-side. Disconnected players get a 60-second reconnect window, then the predefined forfeit rule applies.
        </span>
      </div>

      {confirmReset ? (
        <Modal
          title="Create a new guest identity?"
          confirmLabel="New identity"
          danger
          onConfirm={() => { setConfirmReset(false); online.resetIdentity(); }}
          onCancel={() => setConfirmReset(false)}
        >
          <p>
            Your current guest rating and online record are tied to this browser identity. Creating a new one
            abandons access to that guest profile. Local progress is unaffected.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
