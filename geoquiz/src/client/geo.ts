// Données et outils des jeux joués dans le navigateur : énigmes du jour, tout nommer, bataille de cartes…
import type { Lang, MapData, Names } from '../shared/protocol';
import { distance, normalize } from '../server/text';
import { loadMap } from './MapView';

export interface GeoCountry {
  id: string; n: Names; cap: Names | null; ca: string[]; co: string; pop: number; area: number; nb: string[]; fame: number;
  ll: [number, number]; // latitude, longitude (degrés)
}

let geoP: Promise<GeoCountry[]> | null = null;
export function loadGeo(): Promise<GeoCountry[]> {
  if (!geoP) geoP = fetch('/api/geo').then((r) => { if (!r.ok) throw new Error('geo'); return r.json(); }).catch((e) => { geoP = null; throw e; });
  return geoP;
}
export const loadWorld = (): Promise<MapData> => loadMap('world');

export const nameOf = (n: Names | null | undefined, lang: Lang) => (n ? n[lang] || n.en || n.fr || '' : '');

/** Pays reconnu dans une saisie (toutes langues), avec tolérance d'une petite faute. */
export function matchCountry(input: string, list: GeoCountry[], capitals = false): GeoCountry | null {
  const q = normalize(input);
  if (!q) return null;
  const keys = (c: GeoCountry) => (capitals ? [...Object.values(c.cap ?? {}), ...c.ca] : Object.values(c.n)).map(normalize);
  const exact = list.find((c) => keys(c).includes(q));
  if (exact) return exact;
  if (q.length < 4) return null;
  let best: GeoCountry | null = null, bestD = 99;
  for (const c of list) for (const k of keys(c)) {
    const d = distance(q, k);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= (q.length > 7 ? 2 : 1) ? best : null;
}

/** Suggestions pendant la frappe (début du nom, dans la langue du joueur). */
export function suggest(input: string, list: GeoCountry[], lang: Lang, exclude: Set<string>, capitals = false, max = 5): GeoCountry[] {
  const q = normalize(input);
  if (!q) return [];
  const label = (c: GeoCountry) => normalize(capitals ? nameOf(c.cap, lang) : nameOf(c.n, lang));
  return list.filter((c) => !exclude.has(c.id) && (label(c).startsWith(q) || label(c).split(' ').some((w) => w.startsWith(q))))
    .sort((a, b) => label(a).length - label(b).length).slice(0, max);
}

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
export function km(a: [number, number], b: [number, number]): number {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Direction de a vers b, en degrés (0 = nord, 90 = est). */
export function bearing(a: [number, number], b: [number, number]): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
export const ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
export const arrowOf = (deg: number) => ARROWS[Math.round(deg / 45) % 8];

// ---------------------------------------------------------------- distance entre frontières (pays caché)
// Les tracés de la carte sont pré-projetés (Natural Earth) : on les ramène en latitude / longitude.
function unproject(x: number, y: number, proj: [number, number, number]): [number, number] {
  const [x0, y1, scale] = proj;
  const px = x / scale + x0, py = y1 - y / scale;
  let p = py;
  for (let i = 0; i < 10; i++) {
    const p2 = p * p, p4 = p2 * p2;
    const f = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))) - py;
    const df = 1.007226 + p2 * (3 * 0.015085 + p4 * (7 * -0.044475 + 9 * 0.028874 * p2 - 11 * 0.005916 * p4));
    p -= f / df;
  }
  const p2 = p * p, p4 = p2 * p2;
  const l = px / (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  return [(p * 180) / Math.PI, (l * 180) / Math.PI];
}
const outline = new Map<string, [number, number][]>();
function pointsOf(world: MapData, id: string, fallback: [number, number]): [number, number][] {
  if (outline.has(id)) return outline.get(id)!;
  const f = world.features.find((x) => x.id === id);
  let pts: [number, number][] = [fallback];
  if (f && world.proj) {
    const nums = (f.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const all: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) all.push([nums[i], nums[i + 1]]);
    const step = Math.max(1, Math.floor(all.length / 160));
    pts = all.filter((_, i) => i % step === 0).map(([x, y]) => unproject(x, y, world.proj!));
    if (!pts.length) pts = [fallback];
  }
  outline.set(id, pts);
  return pts;
}
/** Distance entre les frontières de deux pays (0 s'ils sont voisins). */
export function borderKm(a: GeoCountry, b: GeoCountry, world: MapData): number {
  if (a.id === b.id) return 0;
  if (a.nb.includes(b.id) || b.nb.includes(a.id)) return 0;
  const pa = pointsOf(world, a.id, a.ll), pb = pointsOf(world, b.id, b.ll);
  let best = Infinity;
  for (const p of pa) for (const q of pb) { const d = km(p, q); if (d < best) best = d; }
  return Math.round(best);
}

// ---------------------------------------------------------------- énigme du jour
/** Jour au Maroc (le même pour tout le monde), ex. « 2026-11-12 ». */
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Tirage stable : le même jour, la même énigme pour tous. */
export function pickDaily<T>(list: T[], game: string, day = today()): T {
  return list[hash(`${game}:${day}`) % list.length];
}
/** Pays assez connus pour une énigme (les plus célèbres d'abord). */
export function famous(list: GeoCountry[], n: number): GeoCountry[] {
  return [...list].sort((a, b) => b.fame - a.fame || a.id.localeCompare(b.id)).slice(0, n);
}

export interface PuzzleSave { guesses: string[]; done: boolean; won: boolean; hint?: boolean }
const key = (game: string, day: string) => `gq.pz.${game}.${day}`;
export function loadPuzzle(game: string, day: string): PuzzleSave {
  try { const v = JSON.parse(localStorage.getItem(key(game, day)) ?? ''); if (v && Array.isArray(v.guesses)) return v; } catch { /* rien */ }
  return { guesses: [], done: false, won: false };
}
export function savePuzzle(game: string, day: string, s: PuzzleSave) {
  try { localStorage.setItem(key(game, day), JSON.stringify(s)); } catch { /* ignoré */ }
  if (s.done && s.won && day === today()) {
    try {
      const st = JSON.parse(localStorage.getItem(`gq.pz.${game}.streak`) ?? '{"last":"","n":0}');
      if (st.last !== day) {
        const y = new Date(Date.parse(`${day}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
        localStorage.setItem(`gq.pz.${game}.streak`, JSON.stringify({ last: day, n: st.last === y ? st.n + 1 : 1 }));
      }
    } catch { /* ignoré */ }
  }
}
export function streakOf(game: string): number {
  try {
    const st = JSON.parse(localStorage.getItem(`gq.pz.${game}.streak`) ?? '{"last":"","n":0}');
    const y = new Date(Date.parse(`${today()}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
    return st.last === today() || st.last === y ? st.n : 0;
  } catch { return 0; }
}

/** Partage : WhatsApp & co. si l'appareil sait le faire, sinon copie. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try { if (navigator.share) { await navigator.share({ text }); return 'shared'; } } catch { /* annulé */ }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

/** Lettres seules, sans accents ni espaces, en majuscules (capitale du jour). */
export const letters = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}]/gu, '').toUpperCase()
  .replace(/[آأإٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');

/** Résultat façon Wordle : g (bonne place), y (ailleurs), x (absente). */
export function scoreWord(guess: string, target: string): ('g' | 'y' | 'x')[] {
  const g = [...guess], t = [...target];
  const res: ('g' | 'y' | 'x')[] = g.map(() => 'x');
  const left: Record<string, number> = {};
  g.forEach((c, i) => { if (c === t[i]) res[i] = 'g'; else left[t[i]] = (left[t[i]] ?? 0) + 1; });
  g.forEach((c, i) => { if (res[i] !== 'g' && left[c]) { res[i] = 'y'; left[c]--; } });
  return res;
}
