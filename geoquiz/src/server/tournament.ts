// Tournoi du vendredi soir : une grande salle publique, ouverte à 20 h 15 et lancée
// automatiquement à 20 h 30 (heure de Casablanca), sur un thème qui change chaque semaine.
import type { Settings } from '../shared/protocol';
import { tzOffset } from './categories';
import { CODE_ALPHABET } from './rooms';

const TZ = 'Africa/Casablanca';
const OPEN_BEFORE = 15 * 60_000;
const CLOSE_AFTER = 45 * 60_000;
export const TOURNAMENT_THEMES: Partial<Settings>[] = [
  { category: 'capitals', zone: 'world', difficulty: 'medium' },
  { category: 'flags', zone: 'world', difficulty: 'medium' },
  { category: 'emoji', zone: 'world', difficulty: 'medium' },
  { category: 'sport', zone: 'world', difficulty: 'medium' },
  { category: 'maroc', zone: 'world', difficulty: 'medium' },
  { category: 'food', zone: 'world', difficulty: 'medium' },
  { category: 'cinema', zone: 'world', difficulty: 'medium' },
  { category: 'truefalse', zone: 'world', difficulty: 'medium' },
];

/** Prochain vendredi 20:30 à Casablanca (ou celui de ce soir s'il n'est pas fini). */
export function nextTournament(now = Date.now()) {
  const off = tzOffset(TZ, new Date(now)) * 60_000;
  const local = new Date(now + off);
  let days = (5 - local.getUTCDay() + 7) % 7;
  let start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, 20, 30) - off;
  if (now > start + CLOSE_AFTER) { days += 7; start += 7 * 86400_000; }
  const week = Math.floor(start / (7 * 86400_000));
  const theme = TOURNAMENT_THEMES[week % TOURNAMENT_THEMES.length];
  // Code fixe pour la semaine (le même pour tout le monde).
  let h = week * 2654435761;
  let code = '';
  for (let i = 0; i < 6; i++) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; code += CODE_ALPHABET[h % CODE_ALPHABET.length]; }
  const state = now < start - OPEN_BEFORE ? 'soon' : now < start ? 'open' : now < start + CLOSE_AFTER ? 'live' : 'over';
  const settings: Settings = { category: theme.category!, zone: theme.zone!, difficulty: theme.difficulty!, qtype: 'mcq', count: 15, timeLimit: 15, mode: 'classic' };
  return { startsAt: start, opensAt: start - OPEN_BEFORE, state, code, settings };
}
