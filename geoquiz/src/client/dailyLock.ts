// Défi du jour : une seule partie par jour. Le jour change à minuit UTC, comme le tirage
// des questions sur le serveur. Mémorisé sur l'appareil ; pour un compte, le classement
// du jour le sait aussi (autre appareil).
const KEY = 'gq.dailyDone';
export const dailyDay = () => new Date().toISOString().slice(0, 10);

export function dailyDoneHere(): boolean {
  try { return localStorage.getItem(KEY) === dailyDay(); } catch { return false; }
}
export function markDailyDone() {
  try { localStorage.setItem(KEY, dailyDay()); } catch { /* ignoré */ }
  window.dispatchEvent(new CustomEvent('gq:daily'));
}
/** Heure locale du prochain défi (minuit UTC). */
export function nextDailyTime(lang: string): string {
  const d = new Date();
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return new Date(next).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
}
