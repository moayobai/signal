/**
 * SIGNAL — signature nudge tone.
 *
 * Generates a soft 440Hz sine beep (80ms, ~-20dB) with an 8ms attack /
 * 72ms release envelope. Designed to be pleasant on repeat — a cue, not
 * an alarm.
 *
 * Safe to call in contexts where AudioContext is missing (e.g. a service
 * worker): the function no-ops instead of throwing.
 */
export function playNudgeTone(): void {
  if (typeof AudioContext === 'undefined') return;

  try {
    // User-settable escape hatch — no UI for this yet, but respected today.
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('signal-sound') === 'off'
    ) {
      return;
    }
  } catch {
    // localStorage can throw in cross-origin / sandboxed contexts — ignore.
  }

  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 440;

  const now = ctx.currentTime;
  const peak = 0.1; // ~ -20dB
  // Start silent, ramp up over 8ms, then exponential decay over 72ms.
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.080);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.085);
  // Free the context shortly after so we don't leak one per call.
  osc.onended = () => {
    ctx.close().catch(() => { /* ignore */ });
  };
}
