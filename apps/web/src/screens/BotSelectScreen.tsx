import { useNavigate } from 'react-router-dom';
import { BOT_PERSONALITIES, modeById, toGameConfig } from '@barricade/engine';
import { useApp } from '../state/AppContext.js';
import { createMatch, saveMatch } from '../lib/match.js';

export function BotSelectScreen() {
  const navigate = useNavigate();
  const { profile, sfx, toast } = useApp();
  const dash = modeById('dash')!;

  const challenge = (personalityId: string) => {
    const personality = BOT_PERSONALITIES.find((bot) => bot.id === personalityId);
    if (!personality) return;
    const match = createMatch({
      modeId: 'dash',
      controller: 'bot',
      config: toGameConfig(dash),
      timeControlId: 'dash-tc',
      names: { blue: profile.name || 'You', red: personality.name },
      bot: {
        personality: personality.id,
        seed: Math.floor(Math.random() * 2 ** 31),
        name: personality.name,
        rating: personality.elo,
      },
    });
    saveMatch(match);
    sfx('start');
    toast(`Match started against ${personality.name}.`, 'success');
    navigate('/match');
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">AI opponents</span>
          <h1>Choose a rival</h1>
          <p className="page-sub">
            Eight personalities running on a local strategy engine — legal-move search, pathfinding and
            seeded randomness. No external AI service, no data leaves the device.
          </p>
        </div>
      </header>

      <div className="grid-3">
        {BOT_PERSONALITIES.map((bot) => (
          <article key={bot.id} className="mode-card">
            <div className="row-between">
              <h2 style={{ fontSize: '1.1rem' }}>{bot.name}</h2>
              <span className={`pill pill-${bot.accent === 'green' ? 'green' : bot.accent}`}>{bot.elo}</span>
            </div>
            <span className="tagline">{bot.title}</span>
            <p className="small muted">{bot.blurb}</p>
            <div className="mode-meta">
              <span className="pill">9×9 Dash</span>
              <span className="pill">10 walls</span>
              <span className="pill">3 min +1s</span>
            </div>
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => challenge(bot.id)}>
              Challenge {bot.name}
            </button>
          </article>
        ))}
      </div>

      <div className="banner">
        <strong>Deterministic bots:</strong>
        <span>
          Each match stores its seed, so a bot's decisions can be reproduced exactly for debugging. Bots
          never disguise themselves as human opponents.
        </span>
      </div>
    </div>
  );
}
