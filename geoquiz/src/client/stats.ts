// Parties jouées : envoyées au serveur (popularité des jeux, et « mieux que X % des joueurs »).
import { api } from './account';

/** En dessous, la comparaison ne veut rien dire : on ne l'affiche pas. */
const MIN_PLAYS = 10;
let last = '';

/** Fin de partie. `score` de 0 à 1 (absent : la partie compte seulement pour la popularité). */
export async function reportPlay(game: string | undefined, score?: number, key?: string) {
  if (!game) return;
  const k = key ?? `${game}:${score}:${Math.floor(Date.now() / 3000)}`;
  if (k === last) return; // une seule fois par fin de partie
  last = k;
  const r = await api('/api/play', { body: { game, score: typeof score === 'number' && isFinite(score) ? Math.max(0, Math.min(1, score)) : undefined } });
  if (!r.ok || typeof r.data?.better !== 'number' || r.data.n < MIN_PLAYS) return;
  window.dispatchEvent(new CustomEvent('gq:better', { detail: { game, better: r.data.better as number } }));
}

let popular: Promise<string[]> | null = null;
/** Jeux les plus joués cette semaine, du plus joué au moins joué. */
export const loadPopular = () => (popular ??= api('/api/popular').then((r) => (r.ok && Array.isArray(r.data) ? (r.data as { game: string; n: number }[]).filter((x) => x.n > 0).map((x) => x.game) : [])).catch(() => []));
