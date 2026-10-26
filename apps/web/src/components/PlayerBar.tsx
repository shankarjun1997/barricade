import type { Player } from '@barricade/engine';
import { formatClock } from '../lib/format.js';

interface PlayerBarProps {
  readonly player: Player;
  readonly name: string;
  readonly subtitle?: string;
  readonly wallsLeft: number;
  readonly totalWalls: number;
  readonly clockMs: number;
  readonly hasClock: boolean;
  readonly active: boolean;
  readonly thinking?: boolean;
}

export function PlayerBar({
  player,
  name,
  subtitle,
  wallsLeft,
  totalWalls,
  clockMs,
  hasClock,
  active,
  thinking = false,
}: PlayerBarProps) {
  const pipCount = Math.min(totalWalls, 16);
  const pips = [];
  for (let i = 0; i < pipCount; i++) {
    pips.push(<span key={i} className={`wall-pip${i >= wallsLeft ? ' spent' : ''}`} aria-hidden="true" />);
  }

  return (
    <div className={`player-card ${player}-side${active ? ' active' : ''}`}>
      <div className={`player-avatar ${player}`} aria-hidden="true">
        {player === 'blue' ? 'B' : 'R'}
      </div>
      <div className="player-info">
        <div className="player-name">{name}</div>
        <div className="player-meta">
          {subtitle ? <span>{subtitle}</span> : null}
          <span className="wall-stock" title={`${wallsLeft} of ${totalWalls} barriers remaining`}>
            {pips}
            <span style={{ marginLeft: 6 }}>{wallsLeft}</span>
          </span>
          {active ? (
            <span className="green" style={{ fontWeight: 700 }}>
              {thinking ? 'Thinking…' : 'To move'}
            </span>
          ) : null}
        </div>
      </div>
      <div
        className={`clock${hasClock ? '' : ' inactive'}${hasClock && clockMs <= 15_000 ? ' low' : ''}${active ? '' : ' inactive'}`}
        aria-label={hasClock ? `${name} clock ${formatClock(clockMs)}` : 'No clock'}
      >
        {hasClock ? formatClock(clockMs) : '—'}
      </div>
    </div>
  );
}
