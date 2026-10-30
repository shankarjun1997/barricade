import { useState } from 'react';
import { Link } from 'react-router-dom';
import { botById, modeById } from '@barricade/engine';
import { useApp } from '../state/AppContext.js';
import { ACHIEVEMENTS, favouriteMode, levelInfo, validateName, winRate } from '../lib/profile.js';
import { formatDate, formatDuration, plural } from '../lib/format.js';

export function ProfileScreen() {
  const { profile, updateProfile, sfx, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const level = levelInfo(profile.xp);
  const rate = Math.round(winRate(profile) * 100);
  const favourite = favouriteMode(profile.history);
  const unlocked = Object.keys(profile.achievements).length;

  const saveName = () => {
    const problem = validateName(name);
    if (problem) {
      toast(problem, 'error');
      sfx('invalid');
      return;
    }
    updateProfile((current) => ({ ...current, name: name.trim() }));
    setEditing(false);
    sfx('click');
    toast('Name updated.', 'success');
  };

  return (
    <div className="stack">
      <header className="page-head compact-head">
        <div>
          <span className="eyebrow">Player profile</span>
          <h1>Your record</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn btn-sm btn-ghost" to="/leaderboard">Leaderboard</Link>
          <Link className="btn btn-sm btn-ghost" to="/settings">Settings</Link>
        </div>
      </header>

      <section className="panel">
        <div className="profile-hero">
          <div className="avatar-large" aria-hidden="true">
            {profile.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="profile-name">Display name</label>
                  <input
                    id="profile-name"
                    type="text"
                    value={name}
                    maxLength={24}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveName();
                      if (event.key === 'Escape') setEditing(false);
                    }}
                  />
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={saveName}>Save</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setName(profile.name); setEditing(false); }}>Cancel</button>
              </div>
            ) : (
              <div className="row" style={{ gap: 10 }}>
                <h2 style={{ fontSize: '1.45rem' }}>{profile.name}</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
              </div>
            )}
            <p className="small muted">
              Level {level.level} · {profile.rating} rating · {unlocked}/{ACHIEVEMENTS.length} achievements · joined{' '}
              {formatDate(profile.createdAt)}
            </p>
            <div style={{ marginTop: 10 }}>
              <div className="xp-bar" aria-label={`Level progress ${Math.round(level.progress * 100)} percent`}>
                <div className="xp-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
              </div>
              <div className="row-between tiny muted" style={{ marginTop: 4 }}>
                <span>Level {level.level}</span>
                <span>{profile.xp} / {level.next} XP</span>
              </div>
            </div>
          </div>
        </div>
        <div className="divider" />
        <div className="row small muted" style={{ gap: 14, flexWrap: 'wrap' }}>
          <span>{formatDuration(profile.playtimeMs)} played</span>
          <span>{profile.counters.wallsPlaced} walls</span>
          <span>{profile.counters.puzzlesSolved} puzzles solved</span>
          {favourite ? <span>Favourite: {favourite.label}</span> : null}
        </div>
      </section>

      <section className="home-stats" aria-label="Career statistics">
        <div className="home-stat">
          <span className="stat-label">Rating</span>
          <span className="stat-value green">{profile.rating}</span>
        </div>
        <div className="home-stat">
          <span className="stat-label">Matches</span>
          <span className="stat-value">{profile.matches}<small> {profile.wins}W · {profile.losses}L</small></span>
        </div>
        <div className="home-stat">
          <span className="stat-label">Win rate</span>
          <span className="stat-value">{rate}%</span>
        </div>
        <div className="home-stat">
          <span className="stat-label">Streak</span>
          <span className="stat-value">{profile.streak}<small> best {profile.bestStreak}</small></span>
        </div>
      </section>

      <details className="quiet-details">
        <summary>Achievements · {unlocked}/{ACHIEVEMENTS.length}</summary>
        <div className="quiet-content grid-2">
          {ACHIEVEMENTS.map((achievement) => {
            const isUnlocked = profile.achievements[achievement.id] !== undefined;
            return (
              <div key={achievement.id} className={`achievement${isUnlocked ? '' : ' locked'}`}>
                <div className="achievement-icon" aria-hidden="true">{achievement.glyph}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="list-title">{achievement.name}</div>
                  <div className="list-sub">{achievement.description}</div>
                </div>
                <span className="visually-hidden">{isUnlocked ? 'Unlocked' : 'Locked'}</span>
              </div>
            );
          })}
        </div>
      </details>

      <section className="panel">
        <div className="card-title">Recent matches</div>
        {profile.history.length === 0 ? (
          <p className="empty-note">No matches yet. Start a local duel or challenge a bot.</p>
        ) : (
          <div className="list">
            {profile.history.slice(0, 8).map((entry) => {
              const modeName = entry.modeId === 'puzzle' ? 'Puzzle' : modeById(entry.modeId)?.name ?? entry.modeId;
              const bot = entry.opponentBot ? botById(entry.opponentBot) : undefined;
              return (
                <div key={entry.id} className="list-row">
                  <span className={`pill ${entry.result === 'win' ? 'pill-green' : entry.result === 'loss' ? 'pill-red' : 'pill-gold'}`}>
                    {entry.result === 'win' ? 'W' : entry.result === 'loss' ? 'L' : 'D'}
                  </span>
                  <div className="list-main">
                    <div className="list-title">{modeName} · {entry.size}×{entry.size}</div>
                    <div className="list-sub">
                      vs {entry.opponentName}{bot ? ` (${bot.title})` : ''} · {entry.plies} {plural(entry.plies, 'ply', 'plies')} · {formatDate(entry.date)}
                    </div>
                  </div>
                  <div className="small mono" style={{ textAlign: 'right' }}>
                    <div>{entry.ratingAfter}</div>
                    <div className={`tiny ${entry.ratingAfter > entry.ratingBefore ? 'green' : entry.ratingAfter < entry.ratingBefore ? 'red' : 'dim'}`}>
                      {entry.ratingAfter === entry.ratingBefore
                        ? 'unrated'
                        : `${entry.ratingAfter > entry.ratingBefore ? '+' : ''}${entry.ratingAfter - entry.ratingBefore}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="tiny dim">
        Profile data is stored locally on this device. Billing and private analytics never appear publicly.
      </p>
    </div>
  );
}
