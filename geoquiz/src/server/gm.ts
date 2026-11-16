// Geo Masters côté serveur : calendrier de la saison, codes des salles en direct, questions.
import { GM_DIVISIONS, GM_FINAL_AFTER, GM_HOURS, GM_LIVE, GM_OPEN_BEFORE, GM_QUALIF, type GmCalendar, type GmDivision, type GmStage } from '../shared/gm';
import type { Difficulty, Settings } from '../shared/protocol';
import { CATEGORIES, shuffle, tzOffset, type InternalQuestion } from './categories';
import { countries, zones } from './data';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // comme les salles (sans O/0, I/1/L)

const TZ = 'Africa/Casablanca';
const pad = (n: number) => String(n).padStart(2, '0');

/** Saison du mois en cours (ou de la date donnée), heure du Maroc. */
export function gmCalendar(now = Date.now()): GmCalendar {
  const off = tzOffset(TZ, new Date(now)) * 60_000;
  const local = new Date(now + off);
  const y = local.getUTCFullYear(), m = local.getUTCMonth();
  // Dernier samedi du mois.
  const last = new Date(Date.UTC(y, m + 1, 0));
  const lastSat = last.getUTCDate() - ((last.getUTCDay() - 6 + 7) % 7);
  const at = (h: number, min = 0) => Date.UTC(y, m, lastSat, h, min) - off;
  const semi = Object.fromEntries(GM_DIVISIONS.map((d) => [d, at(GM_HOURS[d])])) as Record<GmDivision, number>;
  const final = Object.fromEntries(GM_DIVISIONS.map((d) => [d, semi[d] + GM_FINAL_AFTER])) as Record<GmDivision, number>;
  const nm = new Date(Date.UTC(y, m + 1, 1));
  return { season: `${y}-${pad(m + 1)}`, qualifyEnd: at(0), semi, final, next: `${nm.getUTCFullYear()}-${pad(nm.getUTCMonth() + 1)}` };
}
export const prevSeason = (season: string) => {
  const [y, m] = season.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
};

/** État d'une étape en direct : pas encore ouverte, salle ouverte, en cours, finie. */
export function gmStageState(startsAt: number, now = Date.now()): 'soon' | 'open' | 'live' | 'over' {
  if (now < startsAt - GM_OPEN_BEFORE) return 'soon';
  if (now < startsAt) return 'open';
  if (now < startsAt + 25 * 60_000) return 'live';
  return 'over';
}

/** Code d'une salle en direct : fixe pour la saison, impossible à deviner sans le secret. */
export async function gmCode(season: string, div: GmDivision, stage: GmStage, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`gm|${season}|${div}|${stage}|${secret}`);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...h.slice(0, 6)].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

/** Réglages d'une salle Geo Masters (qualification ou direct). */
export function gmSettings(div: GmDivision, stage: 'qualif' | GmStage): Settings {
  const count = stage === 'qualif' ? GM_QUALIF.questions : GM_LIVE[stage];
  return { category: 'gm', zone: 'world', difficulty: GM_LEVEL[div][0], qtype: 'mcq', count, timeLimit: stage === 'qualif' ? 20 : 15, mode: stage === 'qualif' ? 'classic' : 'buzzer', gm: { div, stage } } as Settings;
}

// Questions : géographie seulement, plus dure selon la division.
const GM_LEVEL: Record<GmDivision, Difficulty[]> = {
  primaire: ['easy', 'easy', 'medium'],
  college: ['easy', 'medium', 'medium', 'hard'],
  lycee: ['medium', 'hard', 'hard'],
  adultes: ['medium', 'hard', 'hard', 'hard'],
};
const GM_CATS: Record<GmDivision, string[]> = {
  primaire: ['capitals', 'flags', 'flags', 'currencies', 'peaks', 'prog_geo'],
  college: ['capitals', 'flags', 'currencies', 'languages', 'peaks', 'records', 'prog_geo'],
  lycee: ['capitals', 'flags', 'currencies', 'languages', 'peaks', 'records', 'prog_geo'],
  adultes: ['capitals', 'flags', 'currencies', 'languages', 'peaks', 'records'],
};

export function gmQuestions(div: GmDivision, n: number, rnd: () => number = Math.random, avoid: string[] = []): InternalQuestion[] {
  const zone = zones.get('world')!;
  const seen = new Set(avoid);
  const out: InternalQuestion[] = [];
  const levels = GM_LEVEL[div] ?? GM_LEVEL.college;
  const cats = GM_CATS[div] ?? GM_CATS.college;
  for (let i = 0, tries = 0; out.length < n && tries < n * 20; tries++) {
    // Difficulté qui monte au fil des questions.
    const d = levels[Math.min(levels.length - 1, Math.floor((out.length / n) * levels.length))];
    const cat = CATEGORIES[cats[Math.floor(rnd() * cats.length)]];
    if (!cat || !cat.qtypes.includes('mcq')) continue;
    const pool = cat.pool(zone, d, 60).filter((t) => !seen.has(`${cat.id}|${t}`));
    if (!pool.length) continue;
    const t = pool[Math.floor(rnd() * pool.length)];
    try {
      const q = cat.make(t, 'mcq', zone, rnd);
      if (!q.options || q.options.length < 3) continue;
      if (q.map?.map === 'world') q.map = { ...q.map, active: q.map.active.filter((x) => x === t || !countries[x]?.dependency) };
      seen.add(`${cat.id}|${t}`);
      out.push({ ...q, target: `${cat.id}|${t}`, level: d });
      i++;
    } catch { /* question suivante */ }
  }
  return shuffle(out, rnd).sort((a, b) => order(a.level) - order(b.level));
}
const order = (d?: Difficulty) => (d === 'hard' ? 2 : d === 'medium' ? 1 : 0);

/** Ce que l'écran Geo Masters doit savoir du direct : heures, état et, si le joueur y a droit, le code
 *  de la salle (créée au besoin par `ensure`). */
export async function gmLiveInfo(
  view: { div: GmDivision; me: { semi: boolean } | null; finalist: boolean; cal: GmCalendar },
  secret: string,
  ensure: (code: string, settings: Settings, startsAt: number, live: { season: string; div: GmDivision; stage: GmStage }) => Promise<void>,
  now = Date.now(),
) {
  const out: Record<GmStage, { at: number; state: string; code: string | null }> = {} as any;
  for (const stage of ['semi', 'final'] as GmStage[]) {
    const at = view.cal[stage][view.div];
    const state = gmStageState(at, now);
    const allowed = stage === 'semi' ? !!view.me?.semi : view.finalist;
    let code: string | null = null;
    if (allowed && (state === 'open' || state === 'live')) {
      code = await gmCode(view.cal.season, view.div, stage, secret);
      await ensure(code, gmSettings(view.div, stage), at, { season: view.cal.season, div: view.div, stage });
    }
    out[stage] = { at, state, code };
  }
  return out;
}
