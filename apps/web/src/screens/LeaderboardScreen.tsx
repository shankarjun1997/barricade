import { Link } from 'react-router-dom';
import { BOT_PERSONALITIES } from '@barricade/engine';
import { useApp } from '../state/AppContext.js';
import { formatDate } from '../lib/format.js';

interface Row {
  id: string;
  name: string;
  rating: number;
  type: string;
  record?: { wins: number; losses: number; draws: number };
  isPlayer?: boolean;
}

export function LeaderboardScreen() {
  const { profile } = useApp();

  const records = new Map<string, { wins: number; losses: number; draws: number }>();
  for (const entry of profile.history) {
    if (!entry.opponentBot) continue;
    const current = records.get(entry.opponentBot) ?? { wins: 0, losses: 0, draws: 0 };
    if (entry.result === 'win') current.wins += 1;
    if (entry.result === 'loss') current.losses += 1;
    if (entry.result === 'draw') current.draws += 1;
    records.set(entry.opponentBot, current);
  }

  const rows: Row[] = [
    ...BOT_PERSONALITIES.map((bot) => ({
      id: bot.id,
      name: bot.name,
      rating: bot.elo,
      type: `Bot · ${bot.title}`,
      record: records.get(bot.id),
    })),
    {
      id: profile.id,
      name: profile.name,
      rating: profile.rating,
      type: 'You · local',
      isPlayer: true,
    },
  ].sort((a, b) => b.rating - a.rating);

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">Competitive</span>
          <h1>Leaderboard</h1>
          <p className="page-sub">
            Local sparring standings. Bot ratings are their designed strength; your rating moves only in
            bot matches, using Elo. Online global, friends and seasonal boards arrive in Phase B.
          </p>
        </div>
        <Link className="btn btn-primary" to="/bots">Challenge a bot</Link>
      </header>

      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">Local leaderboard including sparring bots and the local player</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">Rating</th>
              <th scope="col">Type</th>
              <th scope="col">Your record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} style={row.isPlayer ? { background: 'rgba(53,224,127,.06)' } : undefined}>
                <td>
                  <span className={`rank-badge${index < 3 ? ' top' : ''}`}>{index + 1}</span>
                </td>
                <td>
                  <strong>{row.name}</strong>
                  {row.isPlayer ? <span className="pill pill-green" style={{ marginLeft: 8 }}>You</span> : null}
                </td>
                <td className="mono">{row.rating}</td>
                <td className="muted small">{row.type}</td>
                <td className="small">
                  {row.record ? `${row.record.wins}W · ${row.record.losses}L · ${row.record.draws}D` : row.isPlayer ? '—' : 'Unplayed'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">How this works</div>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
            <li>Bot matches adjust your rating with the Elo formula (K = 24).</li>
            <li>Local hotseat and puzzle results never change rating.</li>
            <li>Bot ratings are fixed difficulty anchors, not simulated live users.</li>
            <li>No subscription tier can change matchmaking or rating maths.</li>
          </ul>
        </div>
        <div className="card">
          <div className="card-title">Your form</div>
          <div className="row-between small">
            <span className="muted">Current streak</span>
            <span className="mono">{profile.streak}</span>
          </div>
          <div className="row-between small" style={{ marginTop: 6 }}>
            <span className="muted">Best streak</span>
            <span className="mono">{profile.bestStreak}</span>
          </div>
          <div className="row-between small" style={{ marginTop: 6 }}>
            <span className="muted">Best rating</span>
            <span className="mono">{profile.bestRating}</span>
          </div>
          <div className="row-between small" style={{ marginTop: 6 }}>
            <span className="muted">Last match</span>
            <span>{profile.history[0] ? formatDate(profile.history[0].date) : '—'}</span>
          </div>
          <div className="divider" />
          <div className="tiny dim">
            Public leaderboards will expose usernames, ratings and records only — never account emails,
            billing data or private analytics.
          </div>
        </div>
      </div>
    </div>
  );
}
