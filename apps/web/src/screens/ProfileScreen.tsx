import { useState } from 'react';
import { Link } from 'react-router-dom';
import { botById, modeById } from '@barricade/engine';
import { useApp } from '../state/AppContext.js';
import {
  ACHIEVEMENTS,
  favouriteMode,
  levelInfo,
  validateName,
  winRate,
} from '../lib/profile.js';
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
      <header className="page-head">
        <div>
          <span className="eyebrow">Player profile</span>
          <h1>Your record</h1>
          <p className="page-sub">Everything here is stored locally on this device. Accounts and public profiles arrive with online play.</p>
        </div>
        <Link className="btn btn-ghost" to="/settings">Settings</Link>
      </header>

      <section className="card">
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
                <button type="button" className="btn btn-primary" onClick={saveName}>Save</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setName(profile.name); setEditing(false); }}>Cancel</button>
              </div>
            ) : (
              <>
                <div className="row" style={{ gap: 10 }}>
                  <h2 style={{ fontSize: '1.5rem' }}>{profile.name}</h2>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
                </div>
                <div className="row small muted" style={{ gap: 10 }}>
                  <span className="pill pill-green">Level {level.level}</span>
                  <span className="pill">{profile.rating} rated</span>
                  <span className="pill">{unlocked}/{ACHIEVEMENTS.length} achievements</span>
                  <span>Joined {formatDate(profile.createdAt)}</span>
                </div>
              </>
            )}
            <div style={{ marginTop: 14 }}>
              <div className="row-between tiny muted">
                <span>Level {level.level}</span>
                <span>{profile.xp} / {level.next} XP</span>
              </div>
              <div className="xp-bar" style={{ marginTop: 6 }} aria-label={`Level progress ${Math.round(level.progress * 100)} percent`}>
                <div className="xp-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid-4" aria-label="Career statistics">
        <div className="stat-card">
          <span className="stat-label">Rating</span>
          <span className="stat-value green">{profile.rating}</span>
          <span className="tiny muted">Best {profile.bestRating}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Matches</span>
          <span className="stat-value">{profile.matches}</span>
          <span className="tiny muted">{profile.wins}W · {profile.losses}L · {profile.draws}D</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Win rate</span>
          <span className="stat-value">{rate}%</span>
          <span className="tiny muted">{profile.wins} victories</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Streak</span>
          <span className="stat-value">{profile.streak}</span>
          <span className="tiny muted">Best {profile.bestStreak}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Playtime</span>
          <span className="stat-value">{formatDuration(profile.playtimeMs)}</span>
          <span className="tiny muted">Recorded match time</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Barriers placed</span>
          <span className="stat-value">{profile.counters.wallsPlaced}</span>
          <span className="tiny muted">Across all matches</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Puzzles</span>
          <span className="stat-value">{profile.counters.puzzlesSolved}</span>
          <span className="tiny muted">{profile.counters.puzzlesAttempted} attempts</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Favourite mode</span>
          <span className="stat-value" style={{ fontSize: '1.15rem' }}>{favourite?.label ?? '—'}</span>
          <span className="tiny muted">{favourite ? `${favourite.count} ${plural(favourite.count, 'match', 'matches')}` : 'No matches yet'}</span>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-title">Achievements</div>
          <div className="grid-2">
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
        </div>

        <div className="card">
          <div className="row-between">
            <div className="card-title" style={{ marginBottom: 0 }}>Recent matches</div>
            <Link to="/leaderboard" className="small">Leaderboard</Link>
          </div>
          {profile.history.length === 0 ? (
            <div className="empty-note">No matches yet. Start a local duel or challenge a bot.</div>
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
                      <div className="list-title">
                        {modeName} · {entry.size}×{entry.size}
                      </div>
                      <div className="list-sub">
                        vs {entry.opponentName}{bot ? ` (${bot.title})` : ''} · {entry.plies} plies · {formatDate(entry.date)}
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
          <div className="divider" />
          <div className="tiny dim">
            Private analytics: playtime, billing and account details never appear on public profiles. Full
            player insights arrive with accounts in Phase B.
          </div>
        </div>
      </section>
    </div>
  );
}
