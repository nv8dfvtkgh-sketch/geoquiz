// Défi du jour : une seule partie par jour. Le jour change à minuit UTC, comme le tirage
// des questions sur le serveur. Mémorisé sur l'appareil ; pour un compte, le classement
// du jour le sait aussi (autre appareil).
const KEY = 'gq.dailyDone';
export const dailyDay = () => new Date().toISOString().slice(0, 10);

export function dailyDoneHere(): boolean {
  try { return localStorage.getItem(KEY) === dailyDay(); } catch { return false; }
}
const STREAK = 'gq.dailyStreak';
/** Série de défis du jour joués d'affilée sur cet appareil (0 si un jour a été manqué). */
export function dailyStreak(): number {
  try {
    const v = JSON.parse(localStorage.getItem(STREAK) ?? 'null') as { last: string; n: number } | null;
    if (!v) return 0;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return v.last === dailyDay() || v.last === yesterday ? v.n : 0;
  } catch { return 0; }
}
export function markDailyDone() {
  try {
    if (localStorage.getItem(KEY) !== dailyDay()) {
      const n = dailyStreak();
      localStorage.setItem(STREAK, JSON.stringify({ last: dailyDay(), n: n + 1 }));
    }
    localStorage.setItem(KEY, dailyDay());
  } catch { /* ignoré */ }
  window.dispatchEvent(new CustomEvent('gq:daily'));
}
/** Heure locale du prochain défi (minuit UTC). */
export function nextDailyTime(lang: string): string {
  const d = new Date();
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return new Date(next).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
}
