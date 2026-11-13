// Jeux de duel sur plateau côté serveur : questions (QCM sans carte) et partie à distance.
import type { BoardQ, Lang } from '../shared/protocol';
import { BOARD_THEMES, type BoardGame, type InitCtx } from '../shared/boards';
import { CATEGORIES, localize, type InternalQuestion } from './categories';
import { countries, worldById, zones } from './data';

/** Une question QCM d'un des jeux du thème (pas de carte, pas de photo ni de son). */
export function boardQuestion(theme: string, difficulty: 'easy' | 'medium' | 'hard', rnd: () => number, avoid: Set<string>): InternalQuestion | null {
  const zone = zones.get('world')!;
  const cats = (BOARD_THEMES[theme] ?? BOARD_THEMES.geo).filter((c) => CATEGORIES[c]?.qtypes.includes('mcq') && !CATEGORIES[c].media);
  for (let tries = 0; tries < 12; tries++) {
    const cat = CATEGORIES[cats[Math.floor(rnd() * cats.length)]];
    if (!cat) continue;
    const pool = cat.pool(zone, difficulty, 40).filter((t) => !avoid.has(`${cat.id}:${t}`));
    if (!pool.length) continue;
    const t = pool[Math.floor(rnd() * pool.length)];
    try {
      const q = cat.make(t, 'mcq', zone, rnd);
      if (q.kind !== 'mcq' || !q.options?.length) continue;
      avoid.add(`${cat.id}:${t}`);
      return q;
    } catch { continue; }
  }
  return null;
}

/** Question traduite pour le plateau (sans la réponse). */
export function boardQ(q: InternalQuestion, lang: Lang): BoardQ {
  return {
    category: q.category,
    promptKey: q.promptKey,
    params: { ...(q.extraParams ?? {}), ...(q.promptName ? { name: localize(q.promptName, lang) } : {}) },
    flag: q.flagIso,
    emoji: q.emoji,
    sign: q.sign,
    options: (q.options ?? []).map((o) => ({ id: o.id, label: o.label ? localize(o.label, lang) : undefined, flag: o.flagIso })),
  };
}

/** Questions pour jouer sur un seul appareil (contre l'ordi ou à deux) : avec la bonne réponse. */
export function boardQuestionsJson(theme: string, difficulty: string, lang: Lang, n: number): string {
  const d = (['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy') as 'easy' | 'medium' | 'hard';
  const avoid = new Set<string>();
  const out: { q: BoardQ; ok: string }[] = [];
  for (let i = 0; i < Math.min(60, Math.max(1, n)); i++) {
    const q = boardQuestion(theme, d, Math.random, avoid);
    if (q) out.push({ q: boardQ(q, lang), ok: q.revealOption! });
  }
  return JSON.stringify(out);
}

/** Mots du pendu (pays et capitales connus, dans la langue de la partie) et drapeaux du mémory. */
export function boardCtx(game: BoardGame, lang: Lang, difficulty: string, rnd: () => number): InitCtx {
  const famous = Object.entries(countries)
    .filter(([id, c]) => !c.dependency && worldById[id])
    .sort((a, b) => (b[1].fame ?? 0) - (a[1].fame ?? 0))
    .slice(0, difficulty === 'hard' ? 160 : difficulty === 'medium' ? 100 : 60);
  const shuffled = [...famous].sort(() => rnd() - 0.5);
  if (game === 'hangman') {
    const words: string[] = [], hints: string[] = [];
    for (const [, c] of shuffled) {
      const cap = rnd() < 0.5 && c.capital;
      const w = (cap ? c.capital!.names[lang] : c.names[lang]) ?? '';
      if (!w || [...w].length > 14 || [...w].length < 4) continue;
      words.push(w);
      hints.push(cap ? 'capital' : 'country');
      if (words.length === 3) break;
    }
    return { words, hints };
  }
  if (game === 'memory') return { flags: shuffled.slice(0, 8).map(([id]) => id) };
  return {};
}
