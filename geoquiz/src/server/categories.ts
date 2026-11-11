// Catégories de quiz. Chaque catégorie déclare ses types de questions, les zones où elle
// s'applique, comment choisir les cibles et comment fabriquer une question.
// Ajouter une catégorie = ajouter un objet au registre (voir README, « fleuves »).
import type { CategoryInfo, Difficulty, Lang, MapSpec, Names } from '../shared/protocol';
import {
  capitalNameSet, countries, countryNameSet, nameSet, regionMap, worldById, ZoneCtx,
} from './data';
import { matches, normalize } from './text';

export interface QOptionInternal {
  id: string;
  target: string;
  label?: Names;
  flagIso?: string;
}

/** Question telle que le serveur la connaît (avec la réponse). Jamais envoyée telle quelle. */
export interface InternalQuestion {
  category: string;
  kind: 'map' | 'mcq' | 'type';
  promptKey: string;
  promptName?: Names; // paramètre {name} traduit
  flagIso?: string;
  map?: MapSpec;
  highlight?: string;
  options?: QOptionInternal[];
  attempts: number;
  target: string;
  answer: Names; // libellé de la bonne réponse
  revealFlagIso?: string;
  /** Vérifie une réponse : id d'entité (carte), id d'option (QCM) ou texte (saisie). */
  check(value: string): boolean;
  /** Pour la carte : entité à faire clignoter ; pour le QCM : option correcte. */
  revealId?: string;
  revealOption?: string;
}

export interface Category extends CategoryInfo {
  pool(zone: ZoneCtx, difficulty: Difficulty, wanted: number): string[];
  make(target: string, kind: 'map' | 'mcq' | 'type', zone: ZoneCtx, rnd: () => number): InternalQuestion;
}

// ------------------------------------------------------------------ outils
export function shuffle<T>(a: T[], rnd: () => number): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const allNames = (n: Names, extra: string[] = []) => [...Object.values(n), ...extra];

/** Saisie : accepte toutes les langues, refuse un autre nom existant (« Iran » ≠ « Irak »). */
function typedCheck(accepted: string[], others: Set<string>) {
  const acceptedNorm = new Set(accepted.map(normalize));
  return (v: string) => {
    const n = normalize(v);
    if (others.has(n) && !acceptedNorm.has(n)) return false;
    return matches(v, accepted);
  };
}

/** Garde les plus « connus » selon la difficulté, avec un minimum pour varier. */
function byDifficulty<T>(sorted: T[], difficulty: Difficulty, wanted: number): T[] {
  const frac = difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.75 : 1;
  const n = Math.max(Math.ceil(sorted.length * frac), Math.min(sorted.length, Math.max(wanted, 8)));
  return sorted.slice(0, n);
}

function countryPool(zone: ZoneCtx, difficulty: Difficulty, wanted: number, filter: (id: string) => boolean = () => true) {
  const ids = (zone.countryIds ?? []).filter(filter);
  const sorted = ids.slice().sort((a, b) => {
    const ma = countries[a], mb = countries[b];
    return Number(ma.dependency) - Number(mb.dependency) || ma.rank - mb.rank || worldById[b].a - worldById[a].a;
  });
  if (difficulty === 'hard') return sorted;
  const maxRank = difficulty === 'easy' ? 3 : 5;
  const strict = sorted.filter((id) => !countries[id].dependency && countries[id].rank <= maxRank);
  if (strict.length >= Math.min(sorted.length, Math.max(wanted, 8))) return strict;
  return byDifficulty(sorted, difficulty, wanted);
}

/** Pièges plausibles : voisins, même sous-région, même continent, puis le reste. */
function countryDistractors(target: string, n: number, rnd: () => number, filter: (id: string) => boolean, preferred: string[] = []): string[] {
  const m = countries[target];
  const all = Object.keys(countries).filter((id) => id !== target && filter(id) && worldById[id]);
  const tiers = [
    preferred.filter((id) => all.includes(id)),
    m.neighbors.filter((id) => all.includes(id)),
    all.filter((id) => countries[id].subregion === m.subregion),
    all.filter((id) => countries[id].continent === m.continent),
    all,
  ];
  const out: string[] = [];
  for (const tier of tiers) {
    for (const id of shuffle(tier, rnd)) {
      if (out.length >= n) break;
      if (!out.includes(id)) out.push(id);
    }
    if (out.length >= n) break;
  }
  return out;
}

function optionsFrom(target: string, others: string[], rnd: () => number, f: (id: string) => Omit<QOptionInternal, 'id' | 'target'>) {
  const opts = shuffle([target, ...others], rnd).map((t, i) => ({ id: `o${i}`, target: t, ...f(t) }));
  return { options: opts, correct: opts.find((o) => o.target === target)!.id };
}

function worldSpec(zone: ZoneCtx, layer: MapSpec['layer']): MapSpec {
  const active = (zone.countryIds ?? []).filter((id) => layer === 'shapes' || worldById[id]?.k);
  return { map: 'world', view: zone.view, active, layer };
}

// Drapeaux qui se ressemblent (pièges des QCM de drapeaux).
const LOOKALIKES: string[][] = [
  ['TD', 'RO', 'AD', 'MD'], ['ID', 'MC', 'PL', 'SG'], ['IE', 'CI', 'IT', 'MX', 'NE', 'IN'], ['NL', 'LU', 'HR', 'PY', 'RU', 'SI', 'SK', 'RS'],
  ['AU', 'NZ', 'FJ', 'TV'], ['NO', 'IS', 'DK', 'FI', 'SE', 'FO'], ['SN', 'ML', 'GN', 'CM', 'GH', 'BF'], ['VE', 'CO', 'EC'],
  ['EG', 'SY', 'IQ', 'YE', 'SD'], ['AE', 'KW', 'JO', 'PS', 'SD'], ['QA', 'BH'], ['AR', 'UY', 'SV', 'HN', 'NI', 'GT'],
  ['MA', 'VN', 'TR', 'TN', 'DZ'], ['JP', 'BD', 'PW', 'LA'], ['BE', 'DE', 'UG'], ['AT', 'LV', 'LB', 'PE', 'CA'], ['US', 'LR', 'MY', 'TG'],
  ['FR', 'NL', 'LU', 'RU', 'CZ', 'PH', 'CU', 'PR'], ['BO', 'GH', 'LT', 'ET'], ['DZ', 'PK', 'MR', 'SA'], ['KE', 'MW', 'SS', 'ZW'],
];
const lookalikesOf = (iso: string) => [...new Set(LOOKALIKES.filter((g) => g.includes(iso)).flat())].filter((x) => x !== iso);

// ------------------------------------------------------------------ catégories
const countriesCat: Category = {
  id: 'countries',
  qtypes: ['map', 'mcq', 'type'],
  zoneKinds: ['world', 'continent', 'subregion'],
  pool: (zone, d, n) => countryPool(zone, d, n),
  make(target, kind, zone, rnd) {
    const c = countries[target];
    const base = { category: 'countries', target, answer: c.names, revealId: target };
    if (kind === 'map')
      return { ...base, kind, promptKey: 'q.countries.map', promptName: c.names, map: worldSpec(zone, 'shapes'), attempts: 3, check: (v) => v === target };
    if (kind === 'mcq') {
      const { options, correct } = optionsFrom(target, countryDistractors(target, 3, rnd, () => true), rnd, (id) => ({ label: countries[id].names }));
      return { ...base, kind, promptKey: 'q.countries.name', map: worldSpec(zone, 'shapes'), highlight: target, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    return { ...base, kind, promptKey: 'q.countries.name', map: worldSpec(zone, 'shapes'), highlight: target, attempts: 1, check: typedCheck(allNames(c.names), countryNameSet) };
  },
};

const hasFlag = (id: string) => !!countries[id];
const flagsCat: Category = {
  id: 'flags',
  qtypes: ['map', 'mcq', 'type'],
  zoneKinds: ['world', 'continent', 'subregion'],
  pool: (zone, d, n) => countryPool(zone, d, n, hasFlag),
  make(target, kind, zone, rnd) {
    const c = countries[target];
    const base = { category: 'flags', target, answer: c.names, revealFlagIso: target, revealId: target };
    if (kind === 'map')
      return { ...base, kind, promptKey: 'q.flags.map', flagIso: target, map: worldSpec(zone, 'shapes'), attempts: 3, check: (v) => v === target };
    if (kind === 'mcq') {
      const others = countryDistractors(target, 3, rnd, hasFlag, lookalikesOf(target));
      if (rnd() < 0.5) {
        const { options, correct } = optionsFrom(target, others, rnd, (id) => ({ label: countries[id].names }));
        return { ...base, kind, promptKey: 'q.flags.name', flagIso: target, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
      }
      const { options, correct } = optionsFrom(target, others, rnd, (id) => ({ flagIso: id }));
      return { ...base, kind, promptKey: 'q.flags.pick', promptName: c.names, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    return { ...base, kind, promptKey: 'q.flags.name', flagIso: target, attempts: 1, check: typedCheck(allNames(c.names), countryNameSet) };
  },
};

const hasCapital = (id: string) => !!countries[id]?.capital && !!worldById[id]?.k;
const capitalsCat: Category = {
  id: 'capitals',
  qtypes: ['map', 'mcq', 'type'],
  zoneKinds: ['world', 'continent', 'subregion'],
  pool: (zone, d, n) => countryPool(zone, d, n, hasCapital),
  make(target, kind, zone, rnd) {
    const c = countries[target];
    const cap = c.capital!;
    const base = { category: 'capitals', target, revealId: target };
    if (kind === 'map')
      return { ...base, kind, answer: cap.names, promptKey: 'q.capitals.map', promptName: cap.names, map: worldSpec(zone, 'capitals'), attempts: 3, check: (v) => v === target };
    if (kind === 'mcq') {
      const others = countryDistractors(target, 3, rnd, hasCapital);
      if (rnd() < 0.5) {
        const { options, correct } = optionsFrom(target, others, rnd, (id) => ({ label: countries[id].capital!.names }));
        return { ...base, kind, answer: cap.names, promptKey: 'q.capitals.ofCountry', promptName: c.names, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
      }
      const { options, correct } = optionsFrom(target, others, rnd, (id) => ({ label: countries[id].names }));
      return { ...base, kind, answer: c.names, promptKey: 'q.capitals.countryOf', promptName: cap.names, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    return { ...base, kind, answer: cap.names, promptKey: 'q.capitals.ofCountry', promptName: c.names, attempts: 1, check: typedCheck(allNames(cap.names, cap.alts), capitalNameSet) };
  },
};

const regionsCat: Category = {
  id: 'regions',
  qtypes: ['map', 'mcq', 'type'],
  zoneKinds: ['regions'],
  pool(zone, d, n) {
    const rm = regionMap(zone.region!.iso, zone.region!.level);
    if (!rm) return [];
    const sorted = rm.data.features.slice().sort((a, b) => b.a - a.a).map((f) => f.id);
    return byDifficulty(sorted, d, n);
  },
  make(target, kind, zone, rnd) {
    const { iso, level } = zone.region!;
    const rm = regionMap(iso, level)!.data;
    const names = rm.names[target];
    const spec: MapSpec = { map: `region:${iso}:${level}`, view: zone.view, active: rm.features.map((f) => f.id), layer: 'shapes' };
    const base = { category: 'regions', target, answer: names, revealId: target, map: spec };
    if (kind === 'map') return { ...base, kind, promptKey: 'q.regions.map', promptName: names, attempts: 3, check: (v) => v === target };
    if (kind === 'mcq') {
      // Pièges : les régions les plus proches.
      const me = rm.features.find((f) => f.id === target)!;
      const near = rm.features
        .filter((f) => f.id !== target)
        .sort((a, b) => Math.hypot(a.c[0] - me.c[0], a.c[1] - me.c[1]) - Math.hypot(b.c[0] - me.c[0], b.c[1] - me.c[1]))
        .slice(0, 6)
        .map((f) => f.id);
      const { options, correct } = optionsFrom(target, shuffle(near, rnd).slice(0, 3), rnd, (id) => ({ label: rm.names[id] }));
      return { ...base, kind, promptKey: 'q.regions.name', highlight: target, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    return { ...base, kind, promptKey: 'q.regions.name', highlight: target, attempts: 1, check: typedCheck(allNames(names), nameSet(Object.values(rm.names))) };
  },
};

export const CATEGORIES: Record<string, Category> = Object.fromEntries(
  [countriesCat, flagsCat, capitalsCat, regionsCat].map((c) => [c.id, c]),
);

export function categoryInfos(): CategoryInfo[] {
  return Object.values(CATEGORIES).map(({ id, qtypes, zoneKinds }) => ({ id, qtypes, zoneKinds }));
}

export function localize(n: Names | undefined, lang: Lang): string {
  if (!n) return '';
  return n[lang] || n.en || n.fr || Object.values(n)[0] || '';
}
