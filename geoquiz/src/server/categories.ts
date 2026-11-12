// Catégories de quiz. Chaque catégorie déclare ses types de questions, les zones où elle
// s'applique, comment choisir les cibles et comment fabriquer une question.
// Ajouter une catégorie = ajouter un objet au registre (voir README, « fleuves »).
import type { CategoryInfo, Difficulty, Lang, MapSpec, Names } from '../shared/protocol';
import {
  capitalNameSet, countries, countryNameSet, extras, nameSet, regionMap, worldById, zones, ZoneCtx, type CountryItem, type EmojiItem,
} from './data';
import { photoFor } from './photos';
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
  emoji?: string; // grand pictogramme (plats, animaux)
  credit?: string; // crédit de la photo, affiché avec la réponse
  imageRef?: string; // photo d'un quiz créé : « quiz:<code>:<image> »
  extraParams?: Record<string, string>; // paramètres identiques dans toutes les langues
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
/**
 * Silhouette d'un pays : le territoire principal et les îles proches (de proche en proche),
 * sans les territoires lointains qui écraseraient la forme (Guyane pour la France, Hawaï pour
 * les États-Unis, Svalbard pour la Norvège…). Coordonnées recentrées : elles ne reprennent
 * pas celles de la carte.
 */
const shapeCache = new Map<string, { d: string; w: number; h: number }>();
function shapeOf(id: string) {
  const hit = shapeCache.get(id);
  if (hit) return hit;
  const f = worldById[id];
  type Ring = { d: string; area: number; b: [number, number, number, number] };
  const rings: Ring[] = f.d.split('M').filter(Boolean).map((r) => {
    const pts = r.replace(/Z$/, '').split('L').map((p) => p.trim().split(/\s+/).map(Number));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, a = 0;
    pts.forEach(([x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length];
      a += x * ny - nx * y;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    });
    return { d: 'M' + r, area: Math.abs(a / 2), b: [x0, y0, x1, y1] };
  });
  const main = rings.reduce((m, r) => (r.area > m.area ? r : m), rings[0]);
  const kept = new Set([main]);
  const box = [...main.b] as [number, number, number, number];
  for (let grew = true; grew; ) {
    grew = false;
    const span = Math.max(box[2] - box[0], box[3] - box[1]);
    for (const r of rings) {
      if (kept.has(r)) continue;
      const gap = Math.max(box[0] - r.b[2], r.b[0] - box[2], box[1] - r.b[3], r.b[1] - box[3], 0);
      if (gap <= Math.max(span * 0.3, 3)) {
        kept.add(r);
        box[0] = Math.min(box[0], r.b[0]); box[1] = Math.min(box[1], r.b[1]);
        box[2] = Math.max(box[2], r.b[2]); box[3] = Math.max(box[3], r.b[3]);
        grew = true;
      }
    }
  }
  const rd = (v: number) => Math.round(v * 10) / 10;
  const d = [...kept].map((r) => r.d).join('')
    .replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${rd(+x - box[0])} ${rd(+y - box[1])}`);
  const out = { d, w: rd(box[2] - box[0]), h: rd(box[3] - box[1]) };
  shapeCache.set(id, out);
  return out;
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

// ------------------------------------------------------------------ plats et animaux du monde
// Un objet (plat, animal emblème) → son pays. Plusieurs pays peuvent être acceptés
// (le couscous : Maroc, Algérie, Tunisie) ; ils ne servent jamais de pièges.
function tierPool<T extends { id: string; tier: number }>(list: T[], d: Difficulty, n: number): string[] {
  const maxTier = d === 'easy' ? 1 : d === 'medium' ? 2 : 3;
  const sorted = list.slice().sort((a, b) => a.tier - b.tier);
  const strict = sorted.filter((x) => x.tier <= maxTier);
  return (strict.length >= Math.min(sorted.length, n) ? strict : sorted.slice(0, Math.max(n, strict.length))).map((x) => x.id);
}

function countryItemCat(id: 'food' | 'animals'): Category {
  const byId = () => Object.fromEntries(extras[id].map((x) => [x.id, x])) as Record<string, CountryItem>;
  return {
    id,
    noZone: true,
    qtypes: ['mcq', 'map', 'type'],
    zoneKinds: ['world'],
    pool: (_zone, d, n) => tierPool(extras[id], d, n),
    make(target, kind, zone, rnd) {
      const item = byId()[target];
      const main = item.countries[0];
      const ok = new Set(item.countries);
      const answer = item.countries.length > 1
        ? (Object.fromEntries((['fr', 'en', 'ar', 'es'] as const).map((l) => [l, item.countries.map((c) => countries[c].names[l]).join(' · ')])) as Names)
        : countries[main].names;
      const base = { category: id, target, answer, promptName: item.names, emoji: item.emoji, revealId: main };
      // Pays trop petit pour être touché sur la carte du monde (Maurice…) : QCM à la place.
      if (kind === 'map' && (worldById[main]?.a ?? 0) < 12) kind = 'mcq';
      if (kind === 'map') {
        return { ...base, kind, promptKey: `q.${id}.map`, map: worldSpec(zones.get('world')!, 'shapes'), attempts: 3, check: (v) => ok.has(v) };
      }
      if (kind === 'mcq') {
        const others = countryDistractors(main, 3, rnd, (c) => !ok.has(c) && !countries[c].dependency);
        const { options, correct } = optionsFrom(main, others, rnd, (c) => ({ label: countries[c].names }));
        return { ...base, kind, promptKey: `q.${id}.name`, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
      }
      const accepted = item.countries.flatMap((c) => allNames(countries[c].names));
      return { ...base, kind, promptKey: `q.${id}.name`, attempts: 1, check: typedCheck(accepted, countryNameSet) };
    },
  };
}
const foodCat = countryItemCat('food');
const animalsCat = countryItemCat('animals');

// ------------------------------------------------------------------ vrai ou faux
// Affirmations écrites à la main, plus des affirmations fabriquées à partir des données
// (capitales et monnaies, vraies ou fausses au hasard).
const TRUE_NAMES: Names = { fr: 'Vrai', en: 'True', ar: 'صحيح', es: 'Verdadero' };
const FALSE_NAMES: Names = { fr: 'Faux', en: 'False', ar: 'خطأ', es: 'Falso' };
const LANG_KEYS = ['fr', 'en', 'ar', 'es'] as const;
const mapNames = (f: (l: (typeof LANG_KEYS)[number]) => string): Names => Object.fromEntries(LANG_KEYS.map((l) => [l, f(l)])) as Names;

function tfQuestion(target: string, truth: boolean, promptKey: string, statement: Names, note: Names | undefined): InternalQuestion {
  const options: QOptionInternal[] = [
    { id: 'o0', target: 'true', label: TRUE_NAMES },
    { id: 'o1', target: 'false', label: FALSE_NAMES },
  ];
  const correct = truth ? 'o0' : 'o1';
  const verdict = truth ? TRUE_NAMES : FALSE_NAMES;
  const answer = note ? mapNames((l) => `${verdict[l]} — ${note[l]}`) : verdict;
  return {
    category: 'truefalse', kind: 'mcq', promptKey, promptName: statement, target, answer,
    options, revealOption: correct, attempts: 1, check: (v) => v === correct,
  };
}

const truefalseCat: Category = {
  id: 'truefalse',
  noZone: true,
  qtypes: ['mcq'],
  zoneKinds: ['world'],
  pool(_zone, d, n) {
    const facts = tierPool(extras.truefalse, d, n).map((id) => `f:${id}`);
    const world = zones.get('world')!;
    const caps = countryPool(world, d, n, hasCapital).map((id) => `cap:${id}`);
    const curs = countryPool(world, d, n, hasCurrency).map((id) => `cur:${id}`);
    // Environ deux tiers d'affirmations écrites, un tiers fabriquées.
    const extra = Math.max(4, Math.ceil(facts.length / 4));
    const pick = <T,>(a: T[], k: number) => shuffle(a, Math.random).slice(0, k);
    return [...facts, ...pick(caps, extra), ...pick(curs, extra)];
  },
  make(target, _kind, _zone, rnd) {
    const [type, id] = target.split(':');
    if (type === 'f') {
      const f = extras.truefalse.find((x) => x.id === id)!;
      return tfQuestion(target, f.answer, 'q.truefalse', f.text, f.note);
    }
    const c = countries[id];
    const truth = rnd() < 0.5;
    if (type === 'cap') {
      const other = truth ? id : countryDistractors(id, 1, rnd, hasCapital)[0];
      const shown = countries[other].capital!.names;
      const statement = mapNames((l) => `${c.names[l]} — ${shown[l]}`);
      return tfQuestion(target, truth, 'q.truefalse.capital', statement, truth ? undefined : c.capital!.names);
    }
    // Monnaie : le piège doit porter un autre nom (pas « euro » contre « euro »).
    const key = (n: Names) => (n.en || n.fr).toLowerCase();
    const own = key(c.currency!.names);
    const other = truth ? id : countryDistractors(id, 40, rnd, hasCurrency).find((x) => key(countries[x].currency!.names) !== own) ?? id;
    const real = truth || other === id;
    const shown = countries[other].currency!.names;
    const statement = mapNames((l) => `${c.names[l]} — ${shown[l]}`);
    return tfQuestion(target, real, 'q.truefalse.currency', statement, real ? undefined : c.currency!.names);
  },
};

// ------------------------------------------------------------------ rébus emojis
// Un pays, une ville ou un film à deviner à partir d'emojis. Les pièges sont du même thème.
const emojiNames = (x: EmojiItem): Names => (x.theme === 'country' ? countries[x.country!].names : x.names!);
let emojiNameSets: Record<string, Set<string>> | null = null;
const emojiCat: Category = {
  id: 'emoji',
  noZone: true,
  qtypes: ['mcq', 'type'],
  zoneKinds: ['world'],
  pool: (_zone, d, n) => tierPool(extras.emoji, d, n),
  make(target, kind, _zone, rnd) {
    const item = extras.emoji.find((x) => x.id === target)!;
    const same = extras.emoji.filter((x) => x.theme === item.theme && x.id !== target);
    const names = emojiNames(item);
    const base = {
      category: 'emoji', target, answer: names, promptKey: `q.emoji.${item.theme}`,
      promptName: { fr: item.emoji, en: item.emoji, ar: item.emoji, es: item.emoji },
    };
    if (kind === 'mcq') {
      // Pièges proches en difficulté d'abord.
      const near = shuffle(same, rnd).sort((a, b) => Math.abs(a.tier - item.tier) - Math.abs(b.tier - item.tier));
      const byId = Object.fromEntries(extras.emoji.map((x) => [x.id, x]));
      const { options, correct } = optionsFrom(target, near.slice(0, 3).map((x) => x.id), rnd, (id) => ({ label: emojiNames(byId[id]) }));
      return { ...base, kind, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    emojiNameSets ??= Object.fromEntries(['country', 'city', 'film', 'tale', 'series', 'cartoon', 'character'].map((t) => [t, nameSet(extras.emoji.filter((x) => x.theme === t).map(emojiNames))]));
    const others = item.theme === 'country' ? countryNameSet : emojiNameSets[item.theme];
    return { ...base, kind, attempts: 1, check: typedCheck(allNames(names, item.alts), others) };
  },
};

// ------------------------------------------------------------------ monuments (photos libres)
// La photo vient de Wikimedia Commons (voir photos.ts) ; les monuments sans photo libre sont écartés.
const monumentById = () => Object.fromEntries(extras.monuments.map((m) => [m.id, m]));
let monumentNames: Set<string> | null = null;
const monumentsCat: Category = {
  id: 'monuments',
  noZone: true,
  qtypes: ['mcq', 'map', 'type'],
  zoneKinds: ['world'],
  pool: (_zone, d, n) => tierPool(extras.monuments.filter((m) => photoFor(m.id)), d, n),
  make(target, kind, _zone, rnd) {
    const m = monumentById()[target];
    const photo = photoFor(target)!;
    const c = countries[m.country];
    const base = { category: 'monuments', target, imageRef: `wiki:${target}`, credit: photo.credit, revealId: m.country };
    if (kind === 'map' && (worldById[m.country]?.a ?? 0) < 12) kind = 'mcq';
    if (kind === 'map') {
      return { ...base, kind, answer: mapNames((l) => `${m.names[l]} — ${c.names[l]}`), promptKey: 'q.monuments.map', map: worldSpec(zones.get('world')!, 'shapes'), attempts: 3, check: (v) => v === m.country };
    }
    if (kind === 'mcq' && rnd() < 0.5) {
      // « Quel est ce monument ? » : pièges pris parmi les monuments du même continent si possible.
      const all = extras.monuments.filter((x) => x.id !== target && photoFor(x.id));
      const cont = (x: { country: string }) => countries[x.country]?.continent;
      const near = [...shuffle(all.filter((x) => cont(x) === cont(m)), rnd), ...shuffle(all.filter((x) => cont(x) !== cont(m)), rnd)];
      const byId = monumentById();
      const { options, correct } = optionsFrom(target, near.slice(0, 3).map((x) => x.id), rnd, (id) => ({ label: byId[id].names }));
      return { ...base, kind, answer: m.names, promptKey: 'q.monuments.name', options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    const answer = mapNames((l) => `${m.names[l]} — ${c.names[l]}`);
    if (kind === 'mcq') {
      const { options, correct } = optionsFrom(m.country, countryDistractors(m.country, 3, rnd, (x) => !countries[x].dependency), rnd, (id) => ({ label: countries[id].names }));
      return { ...base, kind, answer, promptKey: 'q.monuments.country', options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    // Saisie : le pays, ou le nom du monument dans l'une des langues.
    monumentNames ??= nameSet(extras.monuments.map((x) => x.names));
    const accepted = [...allNames(c.names), ...allNames(m.names)];
    const others = new Set([...countryNameSet, ...monumentNames]);
    return { ...base, kind, answer, promptKey: 'q.monuments.type', attempts: 1, check: typedCheck(accepted, others) };
  },
};

// ------------------------------------------------------------------ cinéma (version texte)
// Pas d'affiches ni de photos : des questions sur les films eux-mêmes (acteur principal,
// réalisateur, année de sortie, personnage). Une seule question par film dans une partie.
type CineKind = 'actor' | 'director' | 'year' | 'character';
const cinemaCat: Category = {
  id: 'cinema',
  noZone: true,
  qtypes: ['mcq'],
  zoneKinds: ['world'],
  pool(_zone, d, n) {
    const ids = tierPool(extras.cinema.films, d, n);
    return ids.map((id) => {
      const f = extras.cinema.films.find((x) => x.id === id)!;
      const kinds: CineKind[] = ['director'];
      if (f.actor) kinds.push('actor', 'actor');
      if (f.character) kinds.push('character', 'character');
      if (!f.noYear) kinds.push('year');
      return `${id}|${kinds[Math.floor(Math.random() * kinds.length)]}`;
    });
  },
  make(target, _kind, _zone, rnd) {
    const [id, kind] = target.split('|') as [string, CineKind];
    const { films, people } = extras.cinema;
    const f = films.find((x) => x.id === id)!;
    const titled = mapNames((l) => `${f.title[l]} (${f.year})`);
    const base = { category: 'cinema', kind: 'mcq' as const, target, attempts: 1 };
    const pick = <T,>(pool: T[], k: number) => shuffle(pool, rnd).slice(0, k);
    if (kind === 'actor' || kind === 'director') {
      const right = kind === 'actor' ? f.actor! : f.director;
      const exclude = new Set([right, ...(f.cast ?? [])]);
      const pool = [...new Set(films.map((x) => (kind === 'actor' ? x.actor : x.director)).filter((p): p is string => !!p && !exclude.has(p)))];
      // Pièges de la même époque d'abord.
      const near = pool.sort((a, b) => {
        const ya = films.find((x) => (kind === 'actor' ? x.actor : x.director) === a)!.year;
        const yb = films.find((x) => (kind === 'actor' ? x.actor : x.director) === b)!.year;
        return Math.abs(ya - f.year) - Math.abs(yb - f.year) + (rnd() - 0.5) * 30;
      });
      const { options, correct } = optionsFrom(right, near.slice(0, 3), rnd, (p) => ({ label: people[p] }));
      return { ...base, promptKey: `q.cinema.${kind}`, promptName: titled, answer: people[right], options, revealOption: correct, check: (v) => v === correct };
    }
    if (kind === 'year') {
      const offsets = pick([-9, -6, -4, -3, -2, 2, 3, 4, 6, 9], 3);
      const years = offsets.map((o) => f.year + o).filter((y) => y <= 2026);
      while (years.length < 3) years.push(f.year - 10 - years.length);
      const label = (y: number) => mapNames(() => String(y));
      const { options, correct } = optionsFrom(String(f.year), years.map(String), rnd, (y) => ({ label: label(Number(y)) }));
      // Les années se lisent mieux dans l'ordre.
      options.sort((a, b) => Number(a.target) - Number(b.target));
      return { ...base, promptKey: 'q.cinema.year', promptName: f.title, answer: label(f.year), options, revealOption: correct, check: (v) => v === correct };
    }
    const others = pick(films.filter((x) => x.id !== f.id), 3).map((x) => x.id);
    const byId = Object.fromEntries(films.map((x) => [x.id, x]));
    const { options, correct } = optionsFrom(f.id, others, rnd, (x) => ({ label: byId[x].title }));
    return { ...base, promptKey: 'q.cinema.character', promptName: f.character!, answer: titled, options, revealOption: correct, check: (v) => v === correct };
  },
};

// ------------------------------------------------------------------ quiz créés (« Crée ton quiz »)
// Les questions viennent du quiz chargé par la salle (voir rooms.ts, customQuestions) ;
// cette entrée sert au catalogue et à la validation des réglages.
const customCat: Category = {
  id: 'custom',
  noZone: true,
  qtypes: ['mcq'],
  zoneKinds: ['world'],
  pool: () => [],
  make() { throw new Error('quiz créé : voir customQuestions'); },
};

/** Questions d'un quiz créé : QCM à 2-4 réponses, mélangées, avec photo facultative. */
export function customQuestions(id: string, quiz: { title: string; questions: { text: string; image?: string; answers: string[]; correct: number }[] }, rnd: () => number): InternalQuestion[] {
  const same = (s: string): Names => ({ fr: s, en: s, ar: s, es: s });
  return shuffle(quiz.questions, rnd).map((q) => {
    const opts = shuffle(q.answers.map((a, i) => ({ a, i })), rnd).map((o, k) => ({ id: `o${k}`, target: String(o.i), label: same(o.a) }));
    const correct = opts.find((o) => o.target === String(q.correct))!.id;
    return {
      category: 'custom', kind: 'mcq', promptKey: 'q.custom', promptName: same(q.text), extraParams: { title: quiz.title },
      imageRef: q.image ? `quiz:${id}:${q.image}` : undefined,
      options: opts, revealOption: correct, attempts: 1, target: String(q.correct), answer: same(q.answers[q.correct]),
      check: (v: string) => v === correct,
    };
  });
}

export const CATEGORIES: Record<string, Category> = Object.fromEntries(
  [countriesCat, flagsCat, capitalsCat, regionsCat, silhouettesCat, currenciesCat, languagesCat, foodCat, animalsCat, monumentsCat, emojiCat, cinemaCat, truefalseCat, calcCat, customCat].map((c) => [c.id, c]),
);

/**
 * Nombre d'éléments à trouver pour « maîtriser » une zone, par jeu (page Géographie) :
 * tous les pays de la zone qui ont un drapeau / une capitale, hors territoires dépendants.
 */
export function poolCounts(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [id, z] of zones) {
    if (z.info.kind !== 'world' && z.info.kind !== 'continent') continue;
    const ids = (z.countryIds ?? []).filter((c) => !countries[c].dependency);
    out[id] = { countries: ids.length, flags: ids.filter(hasFlag).length, capitals: ids.filter(hasCapital).length };
  }
  return out;
}

export function categoryInfos(): CategoryInfo[] {
  return Object.values(CATEGORIES).map(({ id, qtypes, zoneKinds, noZone }) => ({ id, qtypes, zoneKinds, noZone }));
}

export function localize(n: Names | undefined, lang: Lang): string {
  if (!n) return '';
  return n[lang] || n.en || n.fr || Object.values(n)[0] || '';
}
