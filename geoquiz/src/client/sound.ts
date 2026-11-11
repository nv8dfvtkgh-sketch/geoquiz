// Petits sons synthétisés (aucun fichier audio à charger).
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('gq.muted') === '1'; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(v: boolean) {
  muted = v;
  try { localStorage.setItem('gq.muted', v ? '1' : '0'); } catch {}
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  if (muted) return;
  ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  good: () => { tone(660, 0, 0.12, 'triangle'); tone(990, 0.09, 0.22, 'triangle'); },
  bad: () => { tone(220, 0, 0.18, 'sawtooth', 0.06); tone(180, 0.1, 0.22, 'sawtooth', 0.05); },
  tick: () => tone(1200, 0, 0.04, 'square', 0.03),
  end: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.25, 'triangle')); },
};
