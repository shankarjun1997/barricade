import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { playSfx, unlockAudio, type Sfx } from '../lib/audio.js';
import {
  DEFAULT_SETTINGS,
  defaultProfile,
  type Profile,
  type Settings,
} from '../lib/profile.js';
import { loadJSON, saveJSON } from '../lib/storage.js';

type ToastKind = 'info' | 'error' | 'success';

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly kind: ToastKind;
}

interface AppContextValue {
  readonly profile: Profile;
  readonly settings: Settings;
  readonly updateProfile: (updater: (profile: Profile) => Profile) => void;
  readonly updateSettings: (patch: Partial<Settings>) => void;
  readonly resetProgress: () => void;
  readonly toast: (message: string, kind?: ToastKind) => void;
  readonly sfx: (kind: Sfx) => void;
  readonly toasts: readonly Toast[];
  readonly dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadProfile(): Profile {
  const stored = loadJSON<Partial<Profile> | null>('profile.v1', null);
  const base = defaultProfile();
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    version: 1,
    counters: { ...base.counters, ...(stored.counters ?? {}) },
    achievements: { ...(stored.achievements ?? {}) },
    history: Array.isArray(stored.history) ? stored.history : [],
    settled: Array.isArray(stored.settled) ? stored.settled : [],
  };
}

function loadSettings(): Settings {
  const stored = loadJSON<Partial<Settings> | null>('settings.v1', null);
  if (!stored) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    sfxVolume: Math.min(1, Math.max(0, stored.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume)),
    musicVolume: Math.min(1, Math.max(0, stored.musicVolume ?? DEFAULT_SETTINGS.musicVolume)),
    motion: stored.motion === 'on' || stored.motion === 'off' ? stored.motion : 'system',
    theme:
      stored.theme === 'contrast' || stored.theme === 'cool' || stored.theme === 'charcoal'
        ? stored.theme
        : 'charcoal',
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const toastId = useRef(1);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    saveJSON('profile.v1', profile);
  }, [profile]);

  useEffect(() => {
    saveJSON('settings.v1', settings);
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    if (settings.motion === 'system') {
      delete root.dataset.motion;
    } else {
      root.dataset.motion = settings.motion;
    }
  }, [settings]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = toastId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, kind }]);
      window.setTimeout(() => dismissToast(id), 3400);
    },
    [dismissToast],
  );

  const sfx = useCallback((kind: Sfx) => {
    const current = settingsRef.current;
    playSfx(kind, current.sfxVolume, !current.sound);
  }, []);

  const updateProfile = useCallback((updater: (profile: Profile) => Profile) => {
    setProfile((current) => updater(current));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const resetProgress = useCallback(() => {
    setProfile((current) => {
      const reset = defaultProfile();
      return { ...reset, id: current.id, name: current.name, createdAt: current.createdAt };
    });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({ profile, settings, updateProfile, updateSettings, resetProgress, toast, sfx, toasts, dismissToast }),
    [profile, settings, updateProfile, updateSettings, resetProgress, toast, sfx, toasts, dismissToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
