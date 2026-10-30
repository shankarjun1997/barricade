import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MODES, modeById, timeControlById, type ModeId } from '@barricade/engine';
import { useApp } from '../state/AppContext.js';
import { useOnline } from '../online/OnlineProvider.js';
import { Modal } from '../components/Modal.js';
import { formatDuration, formatTimeControl } from '../lib/format.js';

type Tab = 'play' | 'rooms' | 'ranking';

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

  const [tab, setTab] = useState<Tab>('play');
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
  const savedName = self?.name ?? online.identity.name;
  const nameDirty = nameDraft.trim() !== savedName;

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

  const commitName = () => {
    if (!nameDirty) return;
    if (online.setName(nameDraft)) {
      sfx('click');
      toast('Name updated.', 'success');
    }
  };

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

  const createRoom = () => {
    online.createRoom(modeId, timeControlId, visibility);
    setTab('rooms');
    sfx('click');
  };

  const setup = !online.configured;

  return (
    <div className="stack">
      <header className="page-head compact-head">
        <div>
          <span className="eyebrow">Online</span>
          <h1>Play online</h1>
          <p className="page-sub">Global matchmaking and private rooms, refereed by the server.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {room && room.status === 'waiting' ? (
            <button type="button" className="pill pill-gold" onClick={() => setTab('rooms')}>
              Room {room.code}
            </button>
          ) : null}
          <span className={`pill ${status === 'online' ? 'pill-green' : status === 'reconnecting' ? 'pill-gold' : 'pill-red'}`}>
            {statusLabel(status)}
            {online.latencyMs !== null && status === 'online' ? ` · ${online.latencyMs}ms` : ''}
          </span>
        </div>
      </header>

      {online.notice ? (
        <div className={`notice-line ${online.notice.kind}`} role="status">
          <span>{online.notice.message}</span>
        </div>
      ) : null}

      {online.sessionNotice ? (
        <div className="notice-line error" role="alert">
          <span>{online.sessionNotice}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(true)}>
            Reset identity
          </button>
        </div>
      ) : null}

      {status === 'reconnecting' ? (
        <div className="notice-line warning" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Reconnecting…</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={online.retry}>
            Retry
          </button>
        </div>
      ) : null}

      {online.serverNotice ? (
        <details className="quiet-details server-note">
          <summary>Demo server limitations</summary>
          <p className="small muted">{online.serverNotice}</p>
        </details>
      ) : null}

      {setup ? (
        <section className="panel">
          <div className="card-title">Online server not configured</div>
          <p className="small muted">
            Set <code>VITE_WS_URL</code> to the game server and rebuild. Local play remains available.
          </p>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <pre className="code-block">npm run server:dev{'\n'}npm run dev</pre>
            <pre className="code-block">VITE_WS_URL=wss://host/ws{'\n'}ALLOWED_ORIGINS=https://your-web-origin</pre>
          </div>
        </section>
      ) : (
        <>
          <div className="identity-strip">
            <div className="identity-main">
              <label htmlFor="online-name" className="visually-hidden">Display name</label>
              <input
                id="online-name"
                type="text"
                maxLength={24}
                value={nameDraft}
                aria-label="Display name"
                className="inline-name"
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              {nameDirty ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={commitName}>
                  Save
                </button>
              ) : null}
            </div>
            <div className="identity-meta small muted">
              <span className="mono green">{self?.rating ?? 1000}</span>
              <span>{self ? `${self.wins}W · ${self.losses}L · ${self.draws}D` : 'Guest'}</span>
            </div>
          </div>

          <details className="quiet-details">
            <summary>Connection & identity</summary>
            <div className="quiet-content small muted">
              <div className="row-between">
                <span>Server</span>
                <span className="mono tiny">{online.serverUrl}</span>
              </div>
              <div className="row-between">
                <span>Status</span>
                <span>{statusLabel(status)}</span>
              </div>
              <div className="row-between">
                <span>Guest id</span>
                <span className="mono tiny">{online.identity.playerId}</span>
              </div>
              <div className="btn-row" style={{ marginTop: 8 }}>
                {status !== 'online' ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={online.retry}>
                    Reconnect
                  </button>
                ) : null}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmReset(true)}>
                  New guest identity
                </button>
              </div>
            </div>
          </details>

          <div className="online-setup">
            <div className="field">
              <label htmlFor="online-mode">Mode</label>
              <select id="online-mode" value={modeId} onChange={(event) => chooseMode(event.target.value as ModeId)}>
                {ONLINE_MODES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.arena.size}×{item.arena.size} · {item.arena.wallsPerPlayer} walls
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="online-clock">Clock</label>
              <select id="online-clock" value={timeControlId} onChange={(event) => setTimeControlId(event.target.value)}>
                {timeControls.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.label} — {tc.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="segmented online-tabs" role="tablist" aria-label="Online sections">
            <button type="button" role="tab" aria-selected={tab === 'play'} aria-pressed={tab === 'play'} onClick={() => setTab('play')}>
              Play
            </button>
            <button type="button" role="tab" aria-selected={tab === 'rooms'} aria-pressed={tab === 'rooms'} onClick={() => setTab('rooms')}>
              Rooms
            </button>
            <button type="button" role="tab" aria-selected={tab === 'ranking'} aria-pressed={tab === 'ranking'} onClick={() => setTab('ranking')}>
              Ranking
            </button>
          </div>

          {tab === 'play' ? (
            <section className="panel tab-panel">
              {queueActive ? (
                <div className="queue-state">
                  <span className="spinner" aria-hidden="true" />
                  <div>
                    <strong>Searching…</strong>
                    <p className="small muted">
                      {modeById(queue.modeId ?? modeId)?.name ?? 'Mode'} ·{' '}
                      {timeControlById(queue.timeControlId ?? timeControlId)?.label ?? ''} · position {queue.position ?? 1} ·{' '}
                      {formatDuration(queue.waitMs ?? 0)}
                    </p>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { online.cancelQueue(); sfx('click'); }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    disabled={status !== 'online' || Boolean(room)}
                    onClick={() => { online.quickMatch(modeId, timeControlId); sfx('start'); }}
                  >
                    Find opponent
                  </button>
                  <p className="tiny dim" style={{ marginTop: 10 }}>
                    {selectedControl ? `${formatTimeControl(selectedControl.initialMs, selectedControl.incrementMs)} · Elo-rated` : 'Elo-rated'}
                    {lobby ? ` · ${lobby.online} online · ${lobby.inQueue} searching` : ''}
                    {room ? ' · Leave your room to search' : ''}
                  </p>
                </>
              )}
            </section>
          ) : null}

          {tab === 'rooms' ? (
            <section className="panel tab-panel">
              {room ? (
                <div className="room-panel">
                  <div className="row-between">
                    <div>
                      <span className="tiny muted">Room code</span>
                      <div className="room-code">{room.code}</div>
                    </div>
                    <span className={`pill ${room.status === 'waiting' ? 'pill-gold' : 'pill-green'}`}>
                      {room.status === 'waiting' ? 'Waiting' : room.status === 'playing' ? 'Starting' : 'Finished'}
                    </span>
                  </div>
                  <p className="small muted">
                    {modeById(room.modeId)?.name ?? room.modeId} · {room.config.size}×{room.config.size} ·{' '}
                    {room.config.wallsPerPlayer} walls · {room.visibility}
                  </p>
                  <div className="row small">
                    <span className="pill pill-blue">Blue · {room.host.name}</span>
                    <span className="pill">{room.guest ? `Red · ${room.guest.name}` : 'Waiting for challenger'}</span>
                  </div>
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <button type="button" className="btn btn-sm" onClick={() => void copy(room.code, 'Room code')}>
                      Copy code
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => shareRoom(room.code)}>
                      Copy invite link
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => { online.leaveRoom(); sfx('click'); }}>
                      Leave
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="row-between room-create">
                    <div className="segmented" role="group" aria-label="Room visibility">
                      <button type="button" aria-pressed={visibility === 'public'} onClick={() => setVisibility('public')}>
                        Public
                      </button>
                      <button type="button" aria-pressed={visibility === 'private'} onClick={() => setVisibility('private')}>
                        Private
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={status !== 'online' || queueActive}
                      onClick={createRoom}
                    >
                      Create room
                    </button>
                  </div>

                  <div className="join-row">
                    <label htmlFor="join-code" className="visually-hidden">Room code</label>
                    <input
                      id="join-code"
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      maxLength={6}
                      placeholder="Join with code"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && joinCode.length === 6) {
                          online.joinRoom(joinCode);
                          sfx('click');
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={status !== 'online' || joinCode.length !== 6 || queueActive}
                      onClick={() => { online.joinRoom(joinCode); sfx('click'); }}
                    >
                      Join
                    </button>
                  </div>
                  {roomParam ? <p className="tiny dim">Invite code: {roomParam}</p> : null}

                  <div className="divider" />
                  <div className="card-title">Open rooms</div>
                  {lobby && lobby.rooms.length > 0 ? (
                    <div className="compact-rows">
                      {lobby.rooms.slice(0, 5).map((item) => (
                        <div key={item.code} className="compact-row static">
                          <span>
                            <strong>{item.hostName}</strong>
                            <small>
                              {modeById(item.modeId)?.name ?? item.modeId} · {item.config.size}×{item.config.size} ·{' '}
                              {timeControlById(item.timeControlId)?.label ?? item.timeControlId}
                            </small>
                          </span>
                          <span className="row" style={{ gap: 8 }}>
                            <span className="mono small muted">{item.code}</span>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={status !== 'online' || queueActive || Boolean(room)}
                              onClick={() => { online.joinRoom(item.code); sfx('click'); }}
                            >
                              Join
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-note">{lobby ? 'No open rooms.' : 'Connecting…'}</p>
                  )}
                </>
              )}
            </section>
          ) : null}

          {tab === 'ranking' ? (
            <section className="panel tab-panel">
              {lobby && lobby.leaderboard.length > 0 ? (
                <div className="table-wrap bare">
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
                          <td className="mono muted">{index + 1}</td>
                          <td>
                            <strong>{entry.name}</strong>
                            {entry.id === self?.id ? <span className="pill pill-green" style={{ marginLeft: 8 }}>You</span> : null}
                          </td>
                          <td className="mono">{entry.rating}</td>
                          <td className="small muted">
                            {entry.wins}W · {entry.losses}L · {entry.draws}D
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-note">No rated games yet.</p>
              )}
              <p className="tiny dim" style={{ marginTop: 10 }}>
                Server-side Elo. The demo server does not persist ratings across restarts yet.
              </p>
            </section>
          ) : null}

          <p className="tiny dim">
            Moves, clocks and results are server-authoritative. Disconnected players have a 60-second reconnect window.
          </p>
        </>
      )}

      {confirmReset ? (
        <Modal
          title="Create a new guest identity?"
          confirmLabel="New identity"
          danger
          onConfirm={() => { setConfirmReset(false); online.resetIdentity(); }}
          onCancel={() => setConfirmReset(false)}
        >
          <p>
            Your guest rating and online record belong to this browser identity. A new identity abandons
            access to that guest profile. Local progress is unaffected.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
