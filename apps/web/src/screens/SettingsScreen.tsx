import { useState } from 'react';
import { useApp } from '../state/AppContext.js';
import { Modal } from '../components/Modal.js';
import { loadMatch } from '../lib/match.js';
import { loadLastResult } from '../lib/settle.js';
import { removeKey } from '../lib/storage.js';

export function SettingsScreen() {
  const { profile, settings, updateSettings, resetProgress, sfx, toast } = useApp();
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
        <section className="card">
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
          <div className="tiny dim" style={{ marginTop: 8 }}>
            Reaction sounds, voice packs and separate music volume arrive with the messaging system in Phase B.
          </div>
        </section>

        <section className="card">
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
            <span className="tiny dim">System respects your reduced-motion preference automatically.</span>
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
            <span className="tiny dim">Palette changes only; piece shapes and letters always distinguish players.</span>
          </div>
        </section>

        <section className="card">
          <div className="card-title">Communication & privacy</div>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Mute opponent, block and report — available with accounts.</li>
            <li>Disable taunts while keeping respectful reactions.</li>
            <li>Custom quick messages with filtering and rate limits.</li>
            <li>Control who can send friend requests or see presence.</li>
          </ul>
          <div className="divider" />
          <div className="tiny dim">
            These controls are designed and scheduled for Phase B. They are not simulated here — no toggles
            pretend to be active. Local matches have no chat.
          </div>
        </section>

        <section className="card">
          <div className="card-title">Local data</div>
          <p className="small muted">
            Profile, settings and matches live in this browser's local storage. Export a copy or reset your
            progress. Settings are preserved on reset.
          </p>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-ghost" onClick={exportData}>Export data</button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}>Reset progress</button>
          </div>
          <div className="divider" />
          <div className="tiny dim">
            Account deletion, cloud sync and server-side analytics are part of the online platform. This
            prototype collects nothing and sends nothing.
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-title">About Barricade</div>
        <div className="row-between small">
          <span className="muted">Version</span>
          <span>0.1.0 · Phase C prototype</span>
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
        <div className="divider" />
        <p className="tiny dim">
          Barricade is an original game and platform. Its rules are a public-domain-style abstract duel;
          all branding, code, interface and audio are original to this project.
        </p>
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
