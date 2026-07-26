/** Tiny Web Audio + vibration helpers (no asset files). */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

function beep(freq: number, durationMs: number, gain = 0.08, type: OscillatorType = 'square') {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(ac.destination);
  const t = ac.currentTime;
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
  setTimeout(() => beep(659, 120, 0.08), 90);
}

export function sfxTap() {
  haptic(6);
  beep(520, 40, 0.05);
}
