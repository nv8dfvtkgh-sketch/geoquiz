// Catégories de quiz. Chaque catégorie déclare ses types de questions, les zones où elle
// s'applique, comment choisir les cibles et comment fabriquer une question.
// Ajouter une catégorie = ajouter un objet au registre (voir README, « fleuves »).
import type { CategoryInfo, Difficulty, Lang, MapSpec, Names } from '../shared/protocol';
import {
  capitalNameSet, countries, countryNameSet, extras, nameSet, regionMap, worldById, zones, ZoneCtx,
} from './data';
import { matches } from './text';

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
  shape?: { d: string; w: number; h: number };
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

/** Saisie : toutes les langues acceptées, une ou deux fautes tolérées, sans confondre deux lieux. */
function typedCheck(accepted: string[], others: Set<string>) {
  return (v: string) => matches(v, accepted, others);
}

/** Garde les plus « connus » selon la difficulté, avec un minimum pour varier. */
function byDifficulty<T>(sorted: T[], difficulty: Difficulty, wanted: number): T[] {
  const frac = difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.75 : 1;
  const n = Math.max(Math.ceil(sorted.length * frac), Math.min(sorted.length, Math.max(wanted, 8)));
  return sorted.slice(0, n);
}

function countryPool(zone: ZoneCtx, difficulty: Difficulty, wanted: number, filter: (id: string) => boolean = () => true) {
  const ids = (zone.countryIds ?? []).filter(filter);
  if (difficulty === 'hard') return ids;
  // Du plus connu au moins connu ; territoires dépendants seulement en difficile.
  const fame = (id: string) => countries[id].fame ?? 20 - countries[id].rank;
  const sorted = ids.filter((id) => !countries[id].dependency).sort((a, b) => fame(b) - fame(a));
  // Facile : le quart le plus connu de la zone (ex. ~50 pays pour le monde) ; moyen : 60 %.
  const frac = difficulty === 'easy' ? 0.25 : 0.6;
  const n = Math.max(Math.ceil(sorted.length * frac), Math.min(sorted.length, Math.max(wanted, 8)));
  return sorted.slice(0, n);
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

// ------------------------------------------------------------------ silhouettes de pays
/** Recentre le chemin SVG d'un pays sur l'origine : la silhouette ne reprend pas les coordonnées de la carte. */
function shapeOf(id: string) {
  const f = worldById[id];
  const [x0, y0, x1, y1] = f.b;
  const r = (v: number) => Math.round(v * 10) / 10;
  const d = f.d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${r(+x - x0)} ${r(+y - y0)}`);
  return { d, w: r(x1 - x0), h: r(y1 - y0) };
}
const bigEnough = (id: string) => (worldById[id]?.a ?? 0) >= 12;
const silhouettesCat: Category = {
  id: 'silhouettes',
  qtypes: ['mcq', 'map', 'type'],
  zoneKinds: ['world', 'continent', 'subregion'],
  pool: (zone, d, n) => countryPool(zone, d, n, bigEnough),
  make(target, kind, zone, rnd) {
    const c = countries[target];
    const base = { category: 'silhouettes', target, answer: c.names, revealId: target, shape: shapeOf(target) };
    if (kind === 'map')
      return { ...base, kind, promptKey: 'q.silhouettes.map', map: worldSpec(zone, 'shapes'), attempts: 3, check: (v) => v === target };
    if (kind === 'mcq') {
      const { options, correct } = optionsFrom(target, countryDistractors(target, 3, rnd, bigEnough), rnd, (id) => ({ label: countries[id].names }));
      return { ...base, kind, promptKey: 'q.silhouettes.name', options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    return { ...base, kind, promptKey: 'q.silhouettes.name', attempts: 1, check: typedCheck(allNames(c.names), countryNameSet) };
  },
};

// ------------------------------------------------------------------ monnaies du monde
const hasCurrency = (id: string) => !!countries[id]?.currency;
let currencyNames: Set<string> | null = null;
const currencyNameSet = () => (currencyNames ??= nameSet(Object.values(countries).flatMap((c) => (c.currency ? [c.currency.names] : []))));
const currenciesCat: Category = {
  id: 'currencies',
  qtypes: ['mcq', 'type'],
  zoneKinds: ['world', 'continent', 'subregion'],
  pool: (zone, d, n) => countryPool(zone, d, n, hasCurrency),
  make(target, kind, zone, rnd) {
    const c = countries[target];
    const cur = c.currency!;
    const base = { category: 'currencies', target, answer: cur.names, promptName: c.names, promptKey: 'q.currencies.ofCountry', revealId: undefined };
    if (kind === 'mcq') {
      // Pièges : monnaies de pays proches, toutes différentes (l'euro ne doit pas apparaître deux fois).
      // Clé = nom affiché : le franc CFA d'Afrique de l'Ouest et celui d'Afrique centrale portent le même nom.
      const key = (n: Names) => (n.en || n.fr).toLowerCase();
      const seen = new Set([key(cur.names)]);
      const others: string[] = [];
      for (const id of countryDistractors(target, 40, rnd, hasCurrency)) {
        const code = key(countries[id].currency!.names);
        if (seen.has(code)) continue;
        seen.add(code);
        others.push(id);
        if (others.length === 3) break;
      }
      const { options, correct } = optionsFrom(target, others, rnd, (id) => ({ label: countries[id].currency!.names }));
      return { ...base, kind, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    // Saisie : le nom complet ou son premier mot (« dirham », « yen », « euro »).
    const accepted = allNames(cur.names).flatMap((n) => [n, n.split(/\s+/)[0]]);
    return { ...base, kind, attempts: 1, check: typedCheck(accepted, currencyNameSet()) };
  },
};

// ------------------------------------------------------------------ langues du monde
const langById = () => Object.fromEntries(extras.languages.map((l) => [l.id, l]));
let langNames: Set<string> | null = null;
const languagesCat: Category = {
  id: 'languages',
  noZone: true,
  qtypes: ['mcq', 'map', 'type'],
  zoneKinds: ['world'],
  pool(_zone, d, n) {
    const maxTier = d === 'easy' ? 1 : d === 'medium' ? 2 : 3;
    const list = extras.languages.slice().sort((a, b) => a.tier - b.tier);
    const strict = list.filter((l) => l.tier <= maxTier);
    return (strict.length >= Math.min(list.length, n) ? strict : list.slice(0, Math.max(n, strict.length))).map((l) => l.id);
  },
  make(target, kind, zone, rnd) {
    const l = langById()[target];
    const greeting = { fr: `« ${l.greeting} »`, en: `“${l.greeting}”`, ar: `« ${l.greeting} »`, es: `«${l.greeting}»` };
    const base = { category: 'languages', target, answer: l.names, promptName: greeting };
    if (kind === 'map') {
      const ok = new Set(l.countries);
      return {
        ...base, kind, promptKey: 'q.languages.map', map: worldSpec(zones.get('world')!, 'shapes'), attempts: 3,
        revealId: l.countries[0], check: (v) => ok.has(v),
      };
    }
    if (kind === 'mcq') {
      const others = shuffle(extras.languages.filter((x) => x.id !== target), rnd).slice(0, 3).map((x) => x.id);
      const { options, correct } = optionsFrom(target, others, rnd, (id) => ({ label: langById()[id].names }));
      return { ...base, kind, promptKey: 'q.languages.name', options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    langNames ??= nameSet(extras.languages.map((x) => x.names));
    return { ...base, kind, promptKey: 'q.languages.name', attempts: 1, check: typedCheck(allNames(l.names), langNames) };
  },
};

// ------------------------------------------------------------------ calcul mental
type Op = 'a' | 's' | 'm' | 'd';
const SYMBOL: Record<Op, string> = { a: '+', s: '−', m: '×', d: '÷' };
function calcValue(id: string): number {
  const [op, x, y] = id.split(':');
  const a = +x, b = +y;
  return op === 'a' ? a + b : op === 's' ? a - b : op === 'm' ? a * b : a / b;
}
const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
function calcItem(d: Difficulty): string {
  const roll = Math.random();
  if (d === 'easy') {
    if (roll < 0.5) return `m:${randInt(2, 5)}:${randInt(1, 10)}`;
    const a = randInt(2, 15), b = randInt(1, 20 - a);
    return roll < 0.8 ? `a:${a}:${b}` : `s:${a + b}:${b}`;
  }
  if (d === 'medium') {
    if (roll < 0.45) return `m:${randInt(2, 10)}:${randInt(2, 10)}`;
    const a = randInt(10, 60), b = randInt(5, 39);
    if (roll < 0.7) return `a:${a}:${b}`;
    if (roll < 0.9) return `s:${a + b}:${b}`;
    const q = randInt(2, 10), dv = randInt(2, 10);
    return `d:${q * dv}:${dv}`;
  }
  if (roll < 0.35) return `m:${randInt(3, 12)}:${randInt(3, 12)}`;
  if (roll < 0.55) return `m:${randInt(11, 49)}:${randInt(3, 9)}`;
  if (roll < 0.75) { const q = randInt(3, 15), dv = randInt(3, 12); return `d:${q * dv}:${dv}`; }
  const a = randInt(100, 900), b = randInt(30, 99);
  return roll < 0.88 ? `a:${a}:${b}` : `s:${a}:${b}`;
}
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const calcCat: Category = {
  id: 'calc',
  noZone: true,
  qtypes: ['mcq', 'type'],
  zoneKinds: ['world'],
  pool(_zone, d, n) {
    const set = new Set<string>();
    for (let i = 0; set.size < n && i < n * 20; i++) set.add(calcItem(d));
    return [...set];
  },
  make(target, kind, _zone, rnd) {
    const [op, x, y] = target.split(':') as [Op, string, string];
    const value = calcValue(target);
    const expr = `${x} ${SYMBOL[op]} ${y}`;
    const label = String(value);
    const same = { fr: expr, en: expr, ar: expr, es: expr };
    const base = { category: 'calc', target, answer: { fr: label, en: label, ar: label, es: label }, promptName: same, promptKey: 'q.calc' };
    if (kind === 'mcq') {
      // Pièges : erreurs typiques (±1, ±10, ± un opérande, chiffres inversés).
      const cands = [value + 1, value - 1, value + 10, value - 10, value + +y, value - +y, +String(value).split('').reverse().join(''), value + 2];
      const others = shuffle([...new Set(cands)].filter((v) => v >= 0 && v !== value && Number.isFinite(v)), rnd).slice(0, 3);
      const opts = shuffle([value, ...others], rnd).map((v, i) => ({ id: `o${i}`, target: String(v), label: { fr: String(v), en: String(v), ar: String(v), es: String(v) } }));
      const correct = opts.find((o) => o.target === label)!.id;
      return { ...base, kind, options: opts, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    return {
      ...base, kind, attempts: 1,
      check: (v) => {
        const t = v.replace(/[٠-٩]/g, (c) => String(ARABIC_DIGITS.indexOf(c))).replace(/[\s ]/g, '').replace(',', '.');
        return t !== '' && Number(t) === value;
      },
    };
  },
};

export const CATEGORIES: Record<string, Category> = Object.fromEntries(
  [countriesCat, flagsCat, capitalsCat, regionsCat, silhouettesCat, currenciesCat, languagesCat, calcCat].map((c) => [c.id, c]),
);

export function categoryInfos(): CategoryInfo[] {
  return Object.values(CATEGORIES).map(({ id, qtypes, zoneKinds, noZone }) => ({ id, qtypes, zoneKinds, noZone }));
}

export function localize(n: Names | undefined, lang: Lang): string {
  if (!n) return '';
  return n[lang] || n.en || n.fr || Object.values(n)[0] || '';
}
