/** Akustische und haptische Rückmeldung – ohne Audiodateien (Web Audio API). */

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffset: number, duration: number, type: OscillatorType = 'sine'): void {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export type FeedbackKind = 'granted-in' | 'granted-out' | 'denied' | 'duplicate';

export function playFeedback(kind: FeedbackKind, sound: boolean): void {
  if (sound) {
    switch (kind) {
      case 'granted-in':
        tone(880, 0, 0.12);
        tone(1320, 0.12, 0.16);
        break;
      case 'granted-out':
        tone(1320, 0, 0.12);
        tone(880, 0.12, 0.16);
        break;
      case 'denied':
        tone(220, 0, 0.5, 'square');
        break;
      case 'duplicate':
        tone(660, 0, 0.1);
        break;
    }
  }
  try {
    navigator.vibrate?.(kind === 'denied' ? [200, 100, 200] : 80);
  } catch {
    /* nicht unterstützt */
  }
}

/** Muss einmal nach einer Benutzeraktion aufgerufen werden, damit Töne erlaubt sind. */
export function unlockAudio(): void {
  ctx();
}
