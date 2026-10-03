/** Tiny Web Audio + haptics helpers (no asset files). */
import { getSettings } from './settings';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!getSettings().sound) return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

let iosHapticLabel: HTMLLabelElement | null = null;

/**
 * iPhone Safari has no navigator.vibrate. Toggling a native <input switch>
 * fires the system haptic tick (iOS 17.4+), so use it as a fallback.
 */
function iosTick() {
  try {
    if (!iosHapticLabel) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosHapticLabel = label;
    }
    iosHapticLabel.click();
  } catch {
    /* ignore */
  }
}

export function haptic(pattern: number | number[] = 12) {
  if (!getSettings().haptics) return;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
      return;
    }
  } catch {
    /* fall through */
  }
  if (Array.isArray(pattern)) {
    let at = 0;
    pattern.forEach((ms, i) => {
      if (i % 2 === 0) window.setTimeout(iosTick, at);
      at += ms;
    });
  } else {
    iosTick();
  }
}

function beep(
  freq: number,
  durationMs: number,
  gain = 0.08,
  type: OscillatorType = 'square',
  delayMs = 0,
  slideTo?: number,
) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  const t = ac.currentTime + delayMs / 1000;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + durationMs / 1000);
  g.gain.setValueAtTime(gain, t);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  g.gain.exponentialRampToValueAtTime(0.001, t + durationMs / 1000);
  osc.stop(t + durationMs / 1000 + 0.02);
}

export function sfxReady() {
  haptic(10);
  beep(660, 80, 0.07);
}

export function sfxCountdown(n: number) {
  haptic(8);
  beep(420 + n * 80, 90, 0.09);
}

export function sfxGo() {
  haptic([20, 30, 20]);
  beep(880, 140, 0.1, 'triangle');
}

export function sfxFinish() {
  haptic([15, 40, 15]);
  beep(523, 100, 0.08);
  beep(659, 120, 0.08, 'square', 90);
}

export function sfxTap() {
  haptic(6);
  beep(520, 40, 0.05);
}

/** Soft UI tick for navigation buttons. */
export function sfxUi() {
  haptic(5);
  beep(380, 35, 0.035, 'sine');
}

export function sfxGood() {
  haptic(10);
  beep(660, 70, 0.07, 'triangle');
  beep(880, 90, 0.07, 'triangle', 60);
}

export function sfxBad() {
  haptic([30, 30, 30]);
  beep(220, 160, 0.08, 'sawtooth', 0, 140);
}

export function sfxClaim() {
  haptic(14);
  beep(740, 60, 0.07, 'triangle');
  beep(988, 90, 0.07, 'triangle', 55);
}

export function sfxWin() {
  haptic([20, 40, 20, 40, 40]);
  [523, 659, 784, 1047].forEach((f, i) => beep(f, 160, 0.09, 'triangle', i * 110));
}

export function sfxLose() {
  haptic([40, 60]);
  [392, 349, 294].forEach((f, i) => beep(f, 200, 0.07, 'sine', i * 140));
}

export function sfxBest() {
  haptic([20, 30, 20, 30, 60]);
  [659, 784, 988, 1319].forEach((f, i) => beep(f, 130, 0.09, 'triangle', i * 90));
}

export function sfxPop() {
  haptic(8);
  beep(300, 90, 0.08, 'sine', 0, 700);
}

/**
 * Global click feedback: game cells get a tap, regular buttons a soft tick.
 * Elements can opt out with data-sfx="off" (they play their own sound).
 */
export function installGlobalFeedback() {
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.('button') as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      if (btn.closest('[data-sfx="off"]')) return;
      if (btn.classList.contains('btn') || btn.classList.contains('game-card')) sfxUi();
      else sfxTap();
    },
    { capture: true },
  );
}
