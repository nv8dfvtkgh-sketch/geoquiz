// Révisions scolaires : programmes français (CP → Terminale) et américain (Kindergarten → Grade 12).
// Un jeu = un niveau (classe ou cycle) × une matière (ou toutes). Identifiant : rev_<système>_<niveau>_<matière>.

export type SchoolSystem = 'fr' | 'us';
export interface SchoolLevel { id: string; name: string; subjects: string[]; cycle: string }
export interface SchoolCycle { id: string; name: string; levels: string[] }

export const SCHOOL: Record<SchoolSystem, { levels: SchoolLevel[]; cycles: SchoolCycle[]; subjects: Record<string, { name: string; emoji: string }> }> = {
  fr: {
    levels: [
      { id: 'cp', name: 'CP', cycle: 'c2', subjects: ['francais', 'maths', 'qlm', 'anglais'] },
      { id: 'ce1', name: 'CE1', cycle: 'c2', subjects: ['francais', 'maths', 'qlm', 'anglais'] },
      { id: 'ce2', name: 'CE2', cycle: 'c2', subjects: ['francais', 'maths', 'qlm', 'anglais'] },
      { id: 'cm1', name: 'CM1', cycle: 'c3', subjects: ['francais', 'maths', 'sciences', 'histgeo', 'anglais'] },
      { id: 'cm2', name: 'CM2', cycle: 'c3', subjects: ['francais', 'maths', 'sciences', 'histgeo', 'anglais'] },
      { id: '6e', name: '6e', cycle: 'c3', subjects: ['francais', 'maths', 'sciences', 'histgeo', 'anglais'] },
      { id: '5e', name: '5e', cycle: 'c4', subjects: ['francais', 'maths', 'svt', 'physique', 'histgeo', 'anglais'] },
      { id: '4e', name: '4e', cycle: 'c4', subjects: ['francais', 'maths', 'svt', 'physique', 'histgeo', 'anglais'] },
      { id: '3e', name: '3e', cycle: 'c4', subjects: ['francais', 'maths', 'svt', 'physique', 'histgeo', 'anglais'] },
      { id: '2nde', name: 'Seconde', cycle: 'lycee', subjects: ['francais', 'maths', 'svt', 'physique', 'histgeo', 'ses', 'anglais'] },
      { id: '1re', name: 'Première', cycle: 'lycee', subjects: ['francais', 'maths', 'svt', 'physique', 'histgeo', 'anglais'] },
      { id: 'tle', name: 'Terminale', cycle: 'lycee', subjects: ['philo', 'maths', 'svt', 'physique', 'histgeo', 'anglais'] },
    ],
    cycles: [
      { id: 'c2', name: 'Cycle 2 (CP – CE2)', levels: ['cp', 'ce1', 'ce2'] },
      { id: 'c3', name: 'Cycle 3 (CM1 – 6e)', levels: ['cm1', 'cm2', '6e'] },
      { id: 'c4', name: 'Cycle 4 (5e – 3e)', levels: ['5e', '4e', '3e'] },
      { id: 'lycee', name: 'Lycée (Seconde – Terminale)', levels: ['2nde', '1re', 'tle'] },
    ],
    subjects: {
      francais: { name: 'Français', emoji: '📖' }, maths: { name: 'Mathématiques', emoji: '➗' }, qlm: { name: 'Questionner le monde', emoji: '🔎' },
      sciences: { name: 'Sciences et technologie', emoji: '🔬' }, histgeo: { name: 'Histoire-géographie', emoji: '🗺️' }, anglais: { name: 'Anglais', emoji: '🇬🇧' },
      svt: { name: 'SVT', emoji: '🧬' }, physique: { name: 'Physique-chimie', emoji: '⚗️' }, ses: { name: 'SES', emoji: '📈' }, philo: { name: 'Philosophie', emoji: '🤔' },
    },
  },
  us: {
    levels: [
      { id: 'k', name: 'Kindergarten', cycle: 'elem', subjects: ['ela', 'math', 'science', 'social'] },
      ...Array.from({ length: 12 }, (_, i) => ({ id: `g${i + 1}`, name: `Grade ${i + 1}`, cycle: i < 5 ? 'elem' : i < 8 ? 'middle' : 'high', subjects: ['ela', 'math', 'science', 'social'] })),
    ],
    cycles: [
      { id: 'elem', name: 'Elementary school (K – 5)', levels: ['k', 'g1', 'g2', 'g3', 'g4', 'g5'] },
      { id: 'middle', name: 'Middle school (6 – 8)', levels: ['g6', 'g7', 'g8'] },
      { id: 'high', name: 'High school (9 – 12)', levels: ['g9', 'g10', 'g11', 'g12'] },
    ],
    subjects: {
      ela: { name: 'English Language Arts', emoji: '📖' }, math: { name: 'Math', emoji: '➗' },
      science: { name: 'Science', emoji: '🔬' }, social: { name: 'Social Studies', emoji: '🗽' },
    },
  },
};
export const MATH_SUBJECT = new Set(['maths', 'math']);

export const revId = (sys: SchoolSystem, level: string, subject: string) => `rev_${sys}_${level}_${subject}`;
/** Les jeux de révision : chaque classe et chaque cycle, chaque matière et « toutes les matières ». */
export function revGames(): { id: string; sys: SchoolSystem; levels: string[]; subjects: string[]; name: string }[] {
  const out: { id: string; sys: SchoolSystem; levels: string[]; subjects: string[]; name: string }[] = [];
  for (const sys of ['fr', 'us'] as SchoolSystem[]) {
    const S = SCHOOL[sys];
    const all = sys === 'fr' ? 'Toutes les matières' : 'All subjects';
    for (const l of S.levels) {
      for (const sub of l.subjects) out.push({ id: revId(sys, l.id, sub), sys, levels: [l.id], subjects: [sub], name: `${l.name} · ${S.subjects[sub].name}` });
      out.push({ id: revId(sys, l.id, 'all'), sys, levels: [l.id], subjects: l.subjects, name: `${l.name} · ${all}` });
    }
    for (const c of S.cycles) {
      const subs = [...new Set(S.levels.filter((l) => c.levels.includes(l.id)).flatMap((l) => l.subjects))];
      for (const sub of subs) out.push({ id: revId(sys, c.id, sub), sys, levels: c.levels, subjects: [sub], name: `${c.name} · ${S.subjects[sub].name}` });
      out.push({ id: revId(sys, c.id, 'all'), sys, levels: c.levels, subjects: subs, name: `${c.name} · ${all}` });
    }
  }
  return out;
}

/** « CM1 · Mathématiques », « Cycle 3 · Toutes les matières », « Grade 5 · Math »… */
export function revName(id: string): string | undefined {
  const m = /^rev_(fr|us)_([a-z0-9]+)_([a-z]+)$/.exec(id);
  if (!m) return undefined;
  const S = SCHOOL[m[1] as SchoolSystem];
  const lv = S.levels.find((l) => l.id === m[2])?.name ?? S.cycles.find((c) => c.id === m[2])?.name.replace(/ \(.*\)$/, '');
  const sub = m[3] === 'all' ? (m[1] === 'fr' ? 'Toutes les matières' : 'All subjects') : S.subjects[m[3]]?.name;
  return lv && sub ? `${lv} · ${sub}` : undefined;
}
