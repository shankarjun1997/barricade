import type { Player } from '@barricade/engine';
import { formatClock } from '../lib/format.js';

type PlayerBarSide = 'opponent' | 'self';

interface PlayerBarProps {
  readonly player: Player;
  readonly name: string;
  readonly subtitle?: string;
  readonly rating?: number;
  readonly wallsLeft: number;
  readonly totalWalls: number;
  readonly clockMs: number;
  readonly hasClock: boolean;
  readonly active: boolean;
  readonly thinking?: boolean;
  readonly side?: PlayerBarSide;
}

function initials(name: string, player: Player): string {
  const trimmed = name.trim();
  if (!trimmed) return player === 'blue' ? 'B' : 'R';
  return trimmed.charAt(0).toUpperCase();
}

export function PlayerBar({
  player,
  name,
  subtitle,
  rating,
  wallsLeft,
  totalWalls,
  clockMs,
  hasClock,
  active,
  thinking = false,
  side = 'opponent',
}: PlayerBarProps) {
  const pipCount = Math.min(totalWalls, 16);
  const pips = [];
  for (let i = 0; i < pipCount; i++) {
    pips.push(<span key={i} className={`game-pip${i >= wallsLeft ? ' spent' : ''}`} aria-hidden="true" />);
  }

  const clock = (
    <div
      className={`game-clock${hasClock ? '' : ' inactive'}${hasClock && clockMs <= 15_000 ? ' low' : ''}${
        active ? ' active' : ''
      }`}
      aria-label={hasClock ? `${name} clock ${formatClock(clockMs)}` : 'No clock'}
    >
      {hasClock ? formatClock(clockMs) : '—'}
    </div>
  );

  if (side === 'self') {
    return (
      <div className={`game-player self ${player}${active ? ' active' : ''}`}>
        <div className="game-self">
          <div className={`game-pips self${wallsLeft === 0 ? ' empty' : ''}`} title={`${wallsLeft} of ${totalWalls} walls remaining`}>
            {pips}
          </div>
          <div className="game-self-caption">
            {name} · {wallsLeft} left
          </div>
        </div>
        <div className="game-clock-wrap">{clock}</div>
      </div>
    );
  }

  return (
    <div className={`game-player opponent ${player}${active ? ' active' : ''}${thinking ? ' thinking' : ''}`}>
      <div className={`game-avatar ${player}`} aria-hidden="true">
        {initials(name, player)}
      </div>
      <div className="game-opponent-info">
        <div className="game-name-line">
          <span className="game-name">{name}</span>
          {rating !== undefined ? <span className="game-rating">{rating}</span> : null}
        </div>
        <div className="game-state">
          {active ? (
            thinking ? (
              <>
                <span className="thinking-pulse" aria-hidden="true" />
                <span>Thinking…</span>
              </>
            ) : (
              'To move'
            )
          ) : (
            subtitle ?? 'Waiting'
          )}
        </div>
      </div>
      <div className="game-clock-wrap">
        {clock}
        <div className={`game-pips opponent${wallsLeft === 0 ? ' empty' : ''}`} title={`${wallsLeft} of ${totalWalls} walls remaining`}>
          {pips}
        </div>
      </div>
    </div>
  );
}
