import { useEffect, useState } from 'react';
import { AVATARS, getMyAvatar, setMyAvatar } from '../lib/avatars';
import { getOrCreatePlayerId } from '../lib/player';
import {
  getSettings,
  subscribeSettings,
  updateSettings,
  type ThemeMode,
} from '../lib/settings';
import { sfxGood } from '../lib/sfx';
import { Button } from './Button';
import { Sheet } from './Sheet';
import './SettingsSheet.css';

function useSettings() {
  const [s, setS] = useState(getSettings());
  useEffect(() => subscribeSettings(() => setS({ ...getSettings() })), []);
  return s;
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`set-row ${on ? 'on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span className="set-row-text">
        <span className="set-row-label">{label}</span>
        {hint ? <span className="set-row-hint">{hint}</span> : null}
      </span>
      <span className="set-switch" aria-hidden>
        <span className="set-knob" />
      </span>
    </button>
  );
}

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: 'Day' },
  { id: 'night', label: 'Night' },
];

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const playerId = getOrCreatePlayerId();
  const [avatar, setAvatar] = useState(() => getMyAvatar(playerId));

  return (
    <Sheet open={open} onClose={onClose} label="Settings">
      <p className="h3" style={{ marginBottom: 10 }}>
        Settings
      </p>

      <p className="set-section">Your avatar</p>
      <div className="avatar-grid">
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            className={`avatar-pick ${a === avatar ? 'on' : ''}`}
            aria-label={`Avatar ${a}`}
            aria-pressed={a === avatar}
            onClick={() => {
              setAvatar(a);
              setMyAvatar(a);
              sfxGood();
            }}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="set-list">
        <Toggle
          label="Sound effects"
          hint="Silent switch on your iPhone mutes sound"
          on={s.sound}
          onChange={(v) => updateSettings({ sound: v })}
        />
        <Toggle
          label="Haptics"
          hint="Tiny taps when you play"
          on={s.haptics}
          onChange={(v) => updateSettings({ haptics: v })}
        />
        <Toggle
          label="Color-blind friendly"
          hint="Distinct colors and shapes for players"
          on={s.colorblind}
          onChange={(v) => updateSettings({ colorblind: v })}
        />
      </div>

      <p className="set-section">Look</p>
      <div className="seg" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`seg-btn ${s.theme === t.id ? 'on' : ''}`}
            aria-pressed={s.theme === t.id}
            onClick={() => updateSettings({ theme: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Button variant="gold" block onClick={onClose} style={{ marginTop: 14 }}>
        Done
      </Button>
    </Sheet>
  );
}
