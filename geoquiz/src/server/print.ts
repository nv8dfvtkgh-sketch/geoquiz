// Fiches à imprimer : carte muette numérotée, drapeaux à nommer, quiz à cocher.
// Le serveur tire le contenu (comme une partie) et renvoie aussi le corrigé.
import { LANGS, type Difficulty, type Lang, type Names } from '../shared/protocol';
import { CATEGORIES, countryPool, localize } from './categories';
import { activeEvent, countries, ensureRegion, extras, regionMap, worldById, zones } from './data';
import { drawQuestions } from './rooms';

/** Jeux qu'on peut imprimer en quiz à cocher (pas de carte cliquable, de photo ni de son). */
export const PRINT_EXCLUDED = new Set(['custom', 'daily', 'pin', 'chain', 'countries', 'regions', 'sounds', 'monuments', 'stadiums']);

export interface PrintReq { kind: 'map' | 'flags' | 'quiz'; zone?: string; category?: string; difficulty?: Difficulty; count?: number; lang?: Lang }

export async function printSheet(req: PrintReq): Promise<{ status: number; json: unknown }> {
  const lang: Lang = LANGS.includes(req.lang as Lang) ? (req.lang as Lang) : 'fr';
  const diff: Difficulty = (['easy', 'medium', 'hard'] as const).includes(req.difficulty as Difficulty) ? req.difficulty! : 'easy';
  const count = Math.min(60, Math.max(4, Math.round(Number(req.count) || 20)));
  const loc = (n: Names) => localize(n, lang);

  if (req.kind === 'map' || req.kind === 'flags') {
    const zone = zones.get(req.zone ?? 'world');
    if (!zone) return { status: 400, json: { error: 'settings.invalid' } };
    if (zone.region) {
      if (req.kind === 'flags' || !(await ensureRegion(zone.region.iso))) return { status: 400, json: { error: 'settings.invalid' } };
      const rm = regionMap(zone.region.iso, zone.region.level)!.data;
      const feats = rm.features.slice().sort((a, b) => a.c[1] - b.c[1] || a.c[0] - b.c[0]);
      return { status: 200, json: {
        kind: 'map', map: `region:${zone.region.iso}:${zone.region.level}`, view: zone.view,
        active: rm.features.map((f) => f.id),
        items: feats.map((f, i) => ({ id: f.id, n: i + 1, name: loc(rm.names[f.id]) })),
      } };
    }
    if (req.kind === 'flags') {
      const ids = countryPool(zone, diff, count).slice(0, count).sort((a, b) => loc(countries[a].names).localeCompare(loc(countries[b].names), lang));
      // Ordre mélangé sur la fiche, alphabétique dans le corrigé.
      const shuffled = ids.slice().sort(() => Math.random() - 0.5);
      return { status: 200, json: { kind: 'flags', items: shuffled.map((id, i) => ({ id, n: i + 1, name: loc(countries[id].names) })) } };
    }
    // Carte : les pays assez grands pour porter un numéro lisible, du plus connu au moins connu.
    const ids = countryPool(zone, diff, count, (id) => !!worldById[id]).slice(0, count);
    const items = ids.map((id) => ({ id, name: loc(countries[id].names), c: worldById[id].c }))
      // Numérotés de haut en bas puis de gauche à droite, par bandes.
      .sort((a, b) => Math.round(a.c[1] / 25) - Math.round(b.c[1] / 25) || a.c[0] - b.c[0])
      .map(({ id, name }, i) => ({ id, n: i + 1, name }));
    return { status: 200, json: { kind: 'map', map: 'world', view: zone.view, active: zone.countryIds ?? [], items } };
  }

  const cat = CATEGORIES[req.category ?? ''];
  if (!cat || PRINT_EXCLUDED.has(cat.id) || cat.media) return { status: 400, json: { error: 'settings.invalid' } };
  const qs = drawQuestions({ category: cat.id, zone: 'world', difficulty: diff, qtype: 'mcq', count: Math.min(count, 30), timeLimit: 20 });
  const questions = qs.filter((q) => q.kind === 'mcq' || q.kind === 'order').map((q, i) => ({
    n: i + 1,
    kind: q.kind,
    promptKey: q.promptKey,
    name: q.promptName ? loc(q.promptName) : undefined,
    params: q.extraParams,
    emoji: q.emoji, sign: q.sign, kit: q.kit, shape: q.shape, flag: q.flagIso,
    options: (q.options ?? []).map((o) => ({ label: o.label ? loc(o.label) : undefined, flag: o.flagIso })),
    // QCM : lettre de la bonne réponse ; frise : ordre des lettres.
    answer: q.kind === 'order'
      ? q.order!.map((id) => 'ABCD'[q.options!.findIndex((o) => o.id === id)]).join(' → ')
      : 'ABCD'[q.options!.findIndex((o) => o.id === q.revealOption)],
    answerLabel: loc(q.answer),
  }));
  return { status: 200, json: { kind: 'quiz', category: cat.id, questions } };
}

/** Événements : celui en cours, et tous (noms des badges). */
export function eventList() {
  const cur = activeEvent();
  return { active: cur ? { id: cur.id, emoji: cur.emoji, names: cur.names, end: cur.end } : null, all: extras.events.map(({ id, emoji, names }) => ({ id, emoji, names })) };
}

/** Liste des pays (passeport) : nom dans la langue, continent. */
export function countryList(lang: string) {
  const l: Lang = LANGS.includes(lang as Lang) ? (lang as Lang) : 'fr';
  return Object.entries(countries)
    .filter(([id, c]) => !c.dependency && worldById[id])
    .map(([id, c]) => ({ iso: id, name: localize(c.names, l), continent: c.continent, capital: !!c.capital }))
    .sort((a, b) => a.name.localeCompare(b.name, l));
}

/** Drapeau public pour les fiches (sur la fiche, le nom n'est pas un secret). */
export const flagPath = (p: string) => p.match(/^\/api\/flag\/([A-Z]{2})\.svg$/)?.[1] ?? null;
