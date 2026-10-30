import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ARENA_PRESETS,
  BOT_PERSONALITIES,
  MODES,
  botById,
  createGame,
  modeById,
  timeControlById,
  validateConfig,
  type BotPersonalityId,
  type GameConfig,
  type ModeId,
  type Player,
} from '@barricade/engine';
import { Board } from '../components/Board.js';
import { useApp } from '../state/AppContext.js';
import { createMatch, saveMatch } from '../lib/match.js';
import { formatClock } from '../lib/format.js';

const MAX_WALLS_UI = 24;

export function ArenaConfigScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile, sfx, toast } = useApp();

  const initialMode = modeById(params.get('mode') ?? 'dash') ?? MODES[1]!;
  const [modeId, setModeId] = useState<ModeId>(initialMode.id);
  const [size, setSize] = useState(initialMode.arena.size);
  const [walls, setWalls] = useState(initialMode.arena.wallsPerPlayer);
  const [timeControlId, setTimeControlId] = useState(initialMode.defaultTimeControl);
  const [controller, setController] = useState<'local' | 'bot'>(
    params.get('opponent') === 'bot' ? 'bot' : 'local',
  );
  const [botId, setBotId] = useState<BotPersonalityId>('intermediate');
  const [firstPlayer, setFirstPlayer] = useState<Player>('blue');
  const [blueName, setBlueName] = useState(profile.name || 'You');
  const [redName, setRedName] = useState('Rival');

  const mode = modeById(modeId) ?? MODES[1]!;
  const bot = botById(botId);
  const maxWalls = Math.min(MAX_WALLS_UI, 2 * (size - 1) * (size - 1));

  const config: GameConfig = useMemo(
    () => ({
      size,
      wallsPerPlayer: walls,
      moveLimit: 240,
      repetitionLimit: 3,
      firstPlayer,
    }),
    [size, walls, firstPlayer],
  );

  const configError = validateConfig(config);
  const preview = useMemo(() => {
    try {
      return createGame(config);
    } catch {
      return null;
    }
  }, [config]);

  const routes = useMemo(() => {
    if (!preview) return null;
    return {
      blue: preview.config.size - 1,
      red: preview.config.size - 1,
    };
  }, [preview]);

  const timeControls = mode.timeControls
    .map((id) => timeControlById(id))
    .filter((tc): tc is NonNullable<typeof tc> => Boolean(tc));

  const chooseMode = (id: ModeId) => {
    const next = modeById(id);
    if (!next) return;
    setModeId(next.id);
    setSize(next.arena.size);
    setWalls(next.arena.wallsPerPlayer);
    setTimeControlId(next.defaultTimeControl);
  };

  const resize = (nextSize: number) => {
    setSize(nextSize);
    setWalls((current) => Math.min(current, Math.min(MAX_WALLS_UI, 2 * (nextSize - 1) * (nextSize - 1))));
  };

  const applyPreset = (preset: { size: number; wallsPerPlayer: number }) => {
    setSize(preset.size);
    setWalls(preset.wallsPerPlayer);
  };

  const startMatch = () => {
    if (configError) {
      toast(configError, 'error');
      sfx('invalid');
      return;
    }
    const chosenBuilder = controller === 'bot' ? botById(botId) : undefined;
    const match = createMatch({
      modeId: mode.id,
      controller,
      config,
      timeControlId,
      names: {
        blue: blueName.trim() || (controller === 'bot' ? profile.name || 'You' : 'Blue'),
        red: controller === 'bot' && chosenBuilder ? chosenBuilder.name : redName.trim() || 'Rival',
      },
      ...(chosenBuilder
        ? {
            bot: {
              personality: chosenBuilder.id,
              seed: Math.floor(Math.random() * 2 ** 31),
              name: chosenBuilder.name,
              rating: chosenBuilder.elo,
            },
          }
        : {}),
    });
    saveMatch(match);
    sfx('start');
    navigate('/match');
  };

  const tc = timeControlById(timeControlId);

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">Arena configuration</span>
          <h1>Set the terms</h1>
          <p className="page-sub">Configure the board, wall stock and clock. Preview the exact ruleset before you start.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/play')}>
          Change mode
        </button>
      </header>

      <div className="grid-2">
        <div className="panel stack">
          <div className="field">
            <label htmlFor="mode-select">Game mode</label>
            <select id="mode-select" value={modeId} onChange={(event) => chooseMode(event.target.value as ModeId)}>
              {MODES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.tagline}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label id="format-label">Format</label>
            <div className="segmented" role="group" aria-labelledby="format-label">
              <button type="button" aria-pressed={controller === 'local'} onClick={() => setController('local')}>
                Local duel
              </button>
              <button type="button" aria-pressed={controller === 'bot'} onClick={() => setController('bot')}>
                vs Bot
              </button>
            </div>
          </div>

          {controller === 'bot' ? (
            <div className="field">
              <label htmlFor="bot-select">Bot opponent</label>
              <select id="bot-select" value={botId} onChange={(event) => setBotId(event.target.value as BotPersonalityId)}>
                {BOT_PERSONALITIES.map((personality) => (
                  <option key={personality.id} value={personality.id}>
                    {personality.name} · {personality.title} ({personality.elo})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="divider" />

          <div className="field">
            <label>Arena size</label>
            <div className="row" style={{ gap: 6 }}>
              {ARENA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`btn btn-sm ${size === preset.arena.size ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => applyPreset(preset.arena)}
                >
                  {preset.label} {preset.arena.size}×{preset.arena.size}
                </button>
              ))}
            </div>
            <div className="range-row" style={{ marginTop: 6 }}>
              <input
                type="range"
                min={5}
                max={15}
                step={2}
                value={size}
                aria-label="Board size"
                onChange={(event) => resize(Number(event.target.value))}
              />
              <output>{size}×{size}</output>
            </div>
          </div>

          <div className="field">
            <label htmlFor="walls-range">Walls per player</label>
            <div className="range-row">
              <input
                id="walls-range"
                type="range"
                min={0}
                max={maxWalls}
                value={Math.min(walls, maxWalls)}
                onChange={(event) => setWalls(Number(event.target.value))}
              />
              <output>{Math.min(walls, maxWalls)}</output>
            </div>
            <span className="tiny muted">
              {walls === 0
                ? 'No walls — a pure race.'
                : walls > 14
                  ? 'Wall-heavy: expect slower, grindier matches.'
                  : 'Each player may place this many walls before their stock runs dry.'}
            </span>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="tc-select">Time control</label>
              <select id="tc-select" value={timeControlId} onChange={(event) => setTimeControlId(event.target.value)}>
                {timeControls.map((control) => (
                  <option key={control.id} value={control.id}>
                    {control.label} — {control.description}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label id="first-label">First move</label>
              <div className="segmented" role="group" aria-labelledby="first-label">
                <button type="button" aria-pressed={firstPlayer === 'blue'} onClick={() => setFirstPlayer('blue')}>
                  Blue
                </button>
                <button type="button" aria-pressed={firstPlayer === 'red'} onClick={() => setFirstPlayer('red')}>
                  Red
                </button>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="blue-name">Blue player</label>
              <input id="blue-name" type="text" maxLength={24} value={blueName} onChange={(event) => setBlueName(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="red-name">Red player</label>
              <input
                id="red-name"
                type="text"
                maxLength={24}
                value={controller === 'bot' && bot ? bot.name : redName}
                disabled={controller === 'bot'}
                onChange={(event) => setRedName(event.target.value)}
              />
            </div>
          </div>

          {mode.modifiers.length > 0 ? (
            <div className="banner gold">
              <strong>Mode note:</strong>
              <span>
                {mode.name} modifiers ({mode.modifiers.join(', ')}) arrive in Phase B. This match uses the core
                ruleset with the arena and clock above.
              </span>
            </div>
          ) : null}

          {configError ? (
            <div className="banner" role="alert" style={{ borderColor: 'rgba(255,93,108,.5)' }}>
              {configError}
            </div>
          ) : null}

          <button type="button" className="btn btn-primary btn-block" onClick={startMatch} disabled={Boolean(configError)}>
            Start {mode.name} match
          </button>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="card-title">Preview</div>
            {preview ? <Board state={preview} /> : <div className="empty-note">Invalid configuration</div>}
            <div className="divider" />
            <div className="grid-2 small">
              <div>
                <div className="muted tiny">Arena</div>
                <div>{size}×{size} · {walls} walls each</div>
              </div>
              <div>
                <div className="muted tiny">Clock</div>
                <div>{tc ? `${tc.label} · ${tc.initialMs === 0 ? 'No clock' : formatClock(tc.initialMs)}${tc.incrementMs ? ` +${tc.incrementMs / 1000}s` : ''}` : '—'}</div>
              </div>
              <div>
                <div className="muted tiny">Format</div>
                <div>{controller === 'bot' && bot ? `Bot · ${bot.title}` : 'Local hotseat'}</div>
              </div>
              <div>
                <div className="muted tiny">Route</div>
                <div>{routes ? `${routes.blue} steps each` : '—'}</div>
              </div>
            </div>
          </div>
          <details className="quiet-details">
            <summary>Rules in effect</summary>
            <div className="quiet-content small muted">
              <p>Race a pawn onto the opponent’s home space. Move two spaces orthogonally or one diagonally, then place a wall if you have one.</p>
              <p>Walls cannot overlap, cross or seal every route. Blue walls are horizontal, green walls are vertical; each wall blocks two spaces.</p>
              <p>Home spaces always keep an open path. Once your wall supply runs out, keep taking turns by moving pawns only.</p>
              <p>{tc && tc.initialMs > 0 ? 'Each player has their own clock; it runs only on their turn.' : 'No competitive clock in this match.'}</p>
              <p className="tiny dim">Blockade movement is the target ruleset; this build currently resolves one-step pawn moves while the engine migration ships.</p>
            </div>
          </details>
          <p className="tiny dim">Local and bot matches are unranked. Online play uses server-side Elo.</p>
        </div>
      </div>
    </div>
  );
}
