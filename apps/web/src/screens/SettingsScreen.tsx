import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext.js';
import { Modal } from '../components/Modal.js';
import { loadMatch } from '../lib/match.js';
import { loadLastResult } from '../lib/settle.js';
import { removeKey } from '../lib/storage.js';
import { useOnline } from '../online/OnlineProvider.js';

export function SettingsScreen() {
  const { profile, settings, updateSettings, resetProgress, sfx, toast } = useApp();
  const online = useOnline();
  const [confirmReset, setConfirmReset] = useState(false);

  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'Barricade',
      version: '0.1.0-phase-c',
      profile,
      settings,
      activeMatch: loadMatch(),
      lastResult: loadLastResult(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `barricade-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    sfx('click');
    toast('Local data exported.', 'success');
  };

  const doReset = () => {
    resetProgress();
    removeKey('lastResult.v1');
    removeKey('activeMatch.v1');
    removeKey('lastSetup.v1');
    setConfirmReset(false);
    toast('Progress reset. Settings were kept.', 'success');
  };

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">Preferences</span>
          <h1>Settings</h1>
          <p className="page-sub">Audio, motion, theme and local data controls. Nothing here affects competitive fairness.</p>
        </div>
      </header>

      <div className="grid-2">
        <section className="panel">
          <div className="card-title">Audio</div>
          <div className="toggle-row">
            <div>
              <div className="list-title">Sound effects</div>
              <div className="list-sub">Original WebAudio synthesis — no external files or autoplay.</div>
            </div>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={settings.sound}
              aria-label="Sound effects"
              onClick={() => {
                updateSettings({ sound: !settings.sound });
                if (!settings.sound) sfx('click');
              }}
            />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="sfx-volume">Effects volume</label>
            <div className="range-row">
              <input
                id="sfx-volume"
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.sfxVolume * 100)}
                disabled={!settings.sound}
                onChange={(event) => {
                  const value = Number(event.target.value) / 100;
                  updateSettings({ sfxVolume: value });
                }}
                onPointerUp={() => sfx('click')}
              />
              <output>{Math.round(settings.sfxVolume * 100)}%</output>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="card-title">Presentation</div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label id="motion-label">Motion</label>
            <div className="segmented" role="group" aria-labelledby="motion-label">
              {(['system', 'on', 'off'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={settings.motion === option}
                  onClick={() => updateSettings({ motion: option })}
                >
                  {option === 'system' ? 'Follow system' : option === 'on' ? 'Always' : 'Reduced'}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label id="theme-label">Theme</label>
            <div className="segmented" role="group" aria-labelledby="theme-label">
              {(['charcoal', 'cool', 'contrast'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={settings.theme === option}
                  onClick={() => updateSettings({ theme: option })}
                >
                  {option === 'charcoal' ? 'Charcoal' : option === 'cool' ? 'Cool' : 'High contrast'}
                </button>
              ))}
            </div>
          </div>
        </section>


        <section className="panel">
          <div className="card-title">Local data</div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-ghost" onClick={exportData}>Export data</button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}>Reset progress</button>
          </div>
          <p className="tiny dim" style={{ marginTop: 10 }}>
            Local profile, settings and local matches are stored in this browser.
          </p>
        </section>
      </div>

      <section className="panel">
        <div className="card-title">Online play</div>
        <div className="row-between small">
          <span className="muted">Game server</span>
          <span className="mono tiny">{online.serverUrl ?? 'not configured (local prototype)'}</span>
        </div>
        <div className="row-between small" style={{ marginTop: 6 }}>
          <span className="muted">Status</span>
          <span>{online.configured ? online.status : 'offline only'}</span>
        </div>
        <div className="row-between small" style={{ marginTop: 6 }}>
          <span className="muted">Guest identity</span>
          <span className="mono tiny">{online.identity.playerId}</span>
        </div>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <Link className="btn btn-sm btn-primary" to="/online">Open online lobby</Link>
        </div>
        <div className="divider" />
        <div className="tiny dim">
          Online clocks, moves, forfeits and ratings are server-authoritative. Guest tokens are stored in this
          browser; no passwords or payment data are used in this build.
        </div>
      </section>

      <section className="panel">
        <div className="card-title">About Barricade</div>
        <div className="row-between small">
          <span className="muted">Version</span>
          <span>0.3.0 · local + online</span>
        </div>
        <div className="row-between small" style={{ marginTop: 6 }}>
          <span className="muted">Engine</span>
          <span>@barricade/engine · deterministic rules</span>
        </div>
        <div className="row-between small" style={{ marginTop: 6 }}>
          <span className="muted">Player ID</span>
          <span className="mono tiny">{profile.id}</span>
        </div>
        <div className="row-between small" style={{ marginTop: 6 }}>
          <span className="muted">Storage</span>
          <span>Browser local storage</span>
        </div>
      </section>

      {confirmReset ? (
        <Modal
          title="Reset all progress?"
          confirmLabel="Reset progress"
          danger
          onConfirm={doReset}
          onCancel={() => setConfirmReset(false)}
        >
          <p>Your rating, XP, achievements, match history and puzzle progress will be deleted. Settings and your name are kept.</p>
        </Modal>
      ) : null}
    </div>
  );
}
