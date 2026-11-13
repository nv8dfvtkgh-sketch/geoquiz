// Catégories de quiz. Chaque catégorie déclare ses types de questions, les zones où elle
// s'applique, comment choisir les cibles et comment fabriquer une question.
// Ajouter une catégorie = ajouter un objet au registre (voir README, « fleuves »).
import type { CategoryInfo, Difficulty, KitSpec, Lang, MapSpec, Names, QKind } from '../shared/protocol';
import {
  activeEvent, capitalNameSet, countries, countryNameSet, extras, nameSet, regionMap, world, worldById, zones, ZoneCtx, type CountryItem, type EmojiItem, PACK_GAMES, type PackQ,
} from './data';
import { MATH_SUBJECT, revGames, revId, SCHOOL } from '../shared/school';
import { mathQuestion } from './schoolmath';
import { photoFor, soundFor } from './photos';
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
  kind: QKind;
  promptKey: string;
  promptName?: Names; // paramètre {name} traduit
  flagIso?: string;
  emoji?: string; // grand pictogramme (plats, animaux)
  credit?: string; // crédit de la photo, affiché avec la réponse
  sign?: string; // panneau du code de la route dessiné par le navigateur
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
  kit?: KitSpec; // maillot dessiné
  point?: [number, number]; // « Où est-ce ? » : emplacement exact
  order?: string[]; // frise : ordre correct des options
  clues?: Names[]; // « Qui suis-je ? » : indices dévoilés un à un, du plus dur au plus facile
  /** Vérifie une réponse : id d'entité (carte), id d'option (QCM) ou texte (saisie). */
  check(value: string): boolean;
  /** Réponse notée finement (« Où est-ce ? ») : part des points de 0 à 1 et distance. */
  grade?(value: string): { ok: boolean; credit: number; km?: number };
  /** Pour la carte : entité à faire clignoter ; pour le QCM : option correcte. */
  revealId?: string;
  revealOption?: string;
}

export interface Category extends CategoryInfo {
  pool(zone: ZoneCtx, difficulty: Difficulty, wanted: number): string[];
  make(target: string, kind: 'map' | 'mcq' | 'type', zone: ZoneCtx, rnd: () => number): InternalQuestion;
  /** Médias à charger avant la partie (photos, sons). */
  media?: 'monuments' | 'stadiums' | 'sounds' | 'landscapes';
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

export function countryPool(zone: ZoneCtx, difficulty: Difficulty, wanted: number, filter: (id: string) => boolean = () => true) {
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
  media: 'monuments',
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

// ------------------------------------------------------------------ packs de questions
// Sciences, sport par discipline, Spécial Maroc, code de la route, vocabulaire, « bonjour »…
// Chaque question porte ses réponses (la première est la bonne), traduites dans les 4 langues.
function packCat(id: string, packs: string[]): Category {
  const all = () => packs.flatMap((p) => extras.packs[p] ?? []);
  return {
    id,
    noZone: true,
    qtypes: ['mcq'],
    zoneKinds: ['world'],
    pool: (_zone, d, n) => tierPool(all(), d, n),
    make(target, _kind, _zone, rnd) {
      const q = all().find((x) => x.id === target) as PackQ;
      const ids = q.a.map((_, i) => `a${i}`);
      const { options, correct } = optionsFrom('a0', ids.slice(1), rnd, (x) => ({ label: q.a[Number(x.slice(1))] }));
      return {
        category: id, kind: 'mcq', target, promptKey: `cat.${id}`, promptName: q.q, answer: q.a[0],
        emoji: q.emoji, sign: q.sign, options, revealOption: correct, attempts: 1, check: (v) => v === correct,
      };
    },
  };
}
const packCats = Object.entries(PACK_GAMES).map(([id, packs]) => packCat(id, packs));
// ------------------------------------------------------------------ révisions scolaires
// Programme français (CP → Terminale) et américain (K → Grade 12) : une classe ou un cycle,
// une matière ou toutes. Questions écrites (data/games/school.json) + maths fabriquées au hasard.
function revCat(g: ReturnType<typeof revGames>[number]): Category {
  const lang = g.sys === 'fr' ? 'fr' : 'en';
  const levels = SCHOOL[g.sys].levels;
  return {
    id: g.id,
    noZone: true,
    qtypes: ['mcq'],
    zoneKinds: ['world'],
    pool(_zone, _d, n) {
      const ids: string[] = [];
      for (const lv of g.levels) {
        const info = levels.find((x) => x.id === lv);
        for (const sub of g.subjects) {
          if (!info?.subjects.includes(sub)) continue;
          const list = extras.school[g.sys]?.[lv]?.[sub] ?? [];
          list.forEach((_, i) => ids.push(`s:${lv}:${sub}:${i}`));
          if (MATH_SUBJECT.has(sub)) {
            const k = g.subjects.length > 1 ? Math.max(10, Math.round(list.length * 0.8)) : Math.max(2 * n, 60);
            for (let i = 0; i < k; i++) ids.push(`m:${lv}:${sub}:${1 + Math.floor(Math.random() * 1e9)}`);
          }
        }
      }
      return ids;
    },
    make(target, _kind, _zone, rnd) {
      const [t, lv, sub, x] = target.split(':');
      const row = t === 'm' ? mathQuestion(lv, Number(x), lang) : extras.school[g.sys]?.[lv]?.[sub]?.[Number(x)];
      if (!row || row.length < 5) throw new Error(`révision introuvable : ${target}`);
      const N = (v: string) => ({ [lang]: v }) as unknown as Names;
      const { options, correct } = optionsFrom('a0', ['a1', 'a2', 'a3'], rnd, (k) => ({ label: N(row[1 + Number(k.slice(1))]) }));
      return {
        category: g.id, kind: 'mcq', target, promptKey: `cat.${revId(g.sys, lv, sub)}`, promptName: N(row[0]), answer: N(row[1]),
        options, revealOption: correct, attempts: 1, check: (v) => v === correct,
      };
    },
  };
}
const revCats = revGames().map(revCat);
/** Événement du moment : le pack de l'événement en cours (vide hors période). */
const eventCat: Category = {
  id: 'event',
  noZone: true,
  qtypes: ['mcq'],
  zoneKinds: ['world'],
  pool(zone, d, n) { const ev = activeEvent(); return ev ? packCat('event', [ev.pack]).pool(zone, d, n) : []; },
  make(target, kind, zone, rnd) {
    const ev = activeEvent();
    const pack = ev?.pack ?? extras.events.find((e) => (extras.packs[e.pack] ?? []).some((q) => q.id === target))?.pack ?? '';
    return packCat('event', [pack]).make(target, kind, zone, rnd);
  },
};

// ------------------------------------------------------------------ plus ou moins
// Deux pays : lequel a le plus d'habitants / la plus grande surface ? Écart d'au moins 30 %.
const hasStats = (id: string) => !!countries[id]?.pop && !!countries[id]?.area && !countries[id].dependency && !!worldById[id];
const UNIT: Record<'pop' | 'area', Names> = {
  pop: { fr: 'hab.', en: 'people', es: 'hab.', ar: 'نسمة' },
  area: { fr: 'km²', en: 'km²', es: 'km²', ar: 'كم²' },
};
const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', ar: 'ar' };
export function compact(v: number, l: Lang): string {
  try { return new Intl.NumberFormat(LOCALE[l], { notation: 'compact', maximumFractionDigits: 1 }).format(v); }
  catch { return String(Math.round(v)); }
}
const higherCat: Category = {
  id: 'higher',
  qtypes: ['mcq'],
  zoneKinds: ['world', 'continent', 'subregion'],
  pool: (zone, d, n) => countryPool(zone, d, n, hasStats),
  make(target, _kind, zone, rnd) {
    const metric: 'pop' | 'area' = rnd() < 0.55 ? 'pop' : 'area';
    const val = (id: string) => countries[id][metric]!;
    const v = val(target);
    const all = (zone.countryIds ?? []).filter((id) => id !== target && hasStats(id));
    const ok = all.filter((id) => { const r = Math.max(v, val(id)) / Math.min(v, val(id)); return r >= 1.3; });
    // Les duels serrés (moins de 3 fois plus) d'abord : plus intéressants.
    const close = ok.filter((id) => Math.max(v, val(id)) / Math.min(v, val(id)) < 3);
    const other = (close.length ? shuffle(close, rnd) : shuffle(ok.length ? ok : all, rnd))[0];
    const win = val(other) > v ? other : target;
    const lose = win === target ? other : target;
    const opts = shuffle([target, other], rnd).map((id, i) => ({ id: `o${i}`, target: id, flagIso: id, label: countries[id].names }));
    const correct = opts.find((o) => o.target === win)!.id;
    const fmt = (id: string, l: Lang) => `${countries[id].names[l]} : ${compact(val(id), l)} ${UNIT[metric][l]}`;
    return {
      category: 'higher', kind: 'mcq', target, promptKey: `q.higher.${metric}`, options: opts, revealOption: correct,
      answer: mapNames((l) => `${fmt(win, l)} · ${fmt(lose, l)}`), attempts: 1, check: (x) => x === correct,
    };
  },
};

// ------------------------------------------------------------------ drapeau mystère
// Le drapeau se dévoile petit à petit dans le navigateur : plus on répond tôt, plus on gagne.
const flagrevealCat: Category = {
  id: 'flagreveal',
  qtypes: ['mcq', 'type'],
  zoneKinds: ['world', 'continent', 'subregion'],
  pool: (zone, d, n) => countryPool(zone, d, n, hasFlag),
  make(target, kind, _zone, rnd) {
    const c = countries[target];
    const base = { category: 'flagreveal', target, answer: c.names, flagIso: target, revealFlagIso: target, promptKey: 'q.flagreveal' };
    if (kind !== 'type') {
      const { options, correct } = optionsFrom(target, countryDistractors(target, 3, rnd, hasFlag, lookalikesOf(target)), rnd, (id) => ({ label: countries[id].names }));
      return { ...base, kind: 'mcq', options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    return { ...base, kind: 'type', attempts: 1, check: typedCheck(allNames(c.names), countryNameSet) };
  },
};

// ------------------------------------------------------------------ course aux tables
// Tables de multiplication ; en difficile, aussi le facteur manquant (« 7 × ? = 56 »).
const TABLES: Record<Difficulty, number[]> = { easy: [2, 3, 4, 5, 10], medium: [2, 3, 4, 5, 6, 7, 8, 9, 10], hard: [3, 4, 6, 7, 8, 9, 11, 12] };
const tablesCat: Category = {
  id: 'tables',
  noZone: true,
  qtypes: ['type', 'mcq'],
  zoneKinds: ['world'],
  pool(_zone, d, n) {
    const set = new Set<string>();
    const tabs = TABLES[d];
    const hi = d === 'hard' ? 12 : 10;
    for (let i = 0; set.size < n && i < n * 30; i++) {
      const a = tabs[Math.floor(Math.random() * tabs.length)];
      const b = 1 + Math.floor(Math.random() * hi);
      const [x, y] = Math.random() < 0.5 ? [a, b] : [b, a];
      set.add(d === 'hard' && Math.random() < 0.35 ? `f:${x}:${y}` : `m:${x}:${y}`);
    }
    return [...set];
  },
  make(target, kind, zone, rnd) {
    if (!target.startsWith('f:')) return { ...calcCat.make(target, kind, zone, rnd), category: 'tables' };
    // Facteur manquant : la réponse est y.
    const [, x, y] = target.split(':');
    const prod = Number(x) * Number(y);
    const expr = `${x} × ? = ${prod}`;
    const same = (v: string) => mapNames(() => v);
    const base = { category: 'tables', target, answer: same(y), promptName: same(expr), promptKey: 'q.tables.missing' };
    if (kind === 'mcq') {
      const others = shuffle([...new Set([+y + 1, +y - 1, +y + 2, +y - 2, +x])].filter((v) => v > 0 && v !== +y), rnd).slice(0, 3);
      const opts = shuffle([+y, ...others], rnd).map((v, i) => ({ id: `o${i}`, target: String(v), label: same(String(v)) }));
      const correct = opts.find((o) => o.target === y)!.id;
      return { ...base, kind: 'mcq', options: opts, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    return {
      ...base, kind: 'type', attempts: 1,
      check: (v) => Number(v.replace(/[٠-٩]/g, (c) => String(ARABIC_DIGITS.indexOf(c))).replace(/\s/g, '')) === Number(y),
    };
  },
};

// ------------------------------------------------------------------ fuseaux horaires
// Le décalage est calculé le jour de la partie (heure d'été comprise) avec Intl.
export function tzOffset(tz: string, at = new Date()): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}
const NEXT_DAY: Names = { fr: 'le lendemain', en: 'next day', es: 'día siguiente', ar: 'اليوم التالي' };
const PREV_DAY: Names = { fr: 'la veille', en: 'previous day', es: 'día anterior', ar: 'اليوم السابق' };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
function clockLabel(totalMin: number): Names {
  const day = Math.floor(totalMin / 1440);
  const t = hhmm(((totalMin % 1440) + 1440) % 1440);
  return mapNames((l) => (day > 0 ? `${t} (${NEXT_DAY[l]})` : day < 0 ? `${t} (${PREV_DAY[l]})` : t));
}
const TZ_Q: Record<Lang, (base: string, time: string, city: string) => string> = {
  fr: (b, t, c) => `Il est ${t} à ${b}. Quelle heure est-il à ${c} ?`,
  en: (b, t, c) => `It is ${t} in ${b}. What time is it in ${c}?`,
  es: (b, t, c) => `Son las ${t} en ${b}. ¿Qué hora es en ${c}?`,
  ar: (b, t, c) => `الساعة ${t} في ${b}. كم الساعة في ${c}؟`,
};
/** Heure tapée : « 21 », « 21h », « 21:30 », « 9h30 », « 9 pm ». */
export function parseClock(v: string): number | null {
  const t = v.replace(/[٠-٩]/g, (c) => String(ARABIC_DIGITS.indexOf(c))).toLowerCase();
  const m = t.match(/(\d{1,2})\s*(?:[:h.]\s*(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return h > 24 || mm > 59 ? null : (h % 24) * 60 + mm;
}
const timezonesCat: Category = {
  id: 'timezones',
  noZone: true,
  qtypes: ['mcq', 'type'],
  zoneKinds: ['world'],
  pool: (_zone, d, n) => tierPool(extras.timezones, d, n),
  make(target, kind, _zone, rnd) {
    const city = extras.timezones.find((x) => x.id === target)!;
    const now = new Date();
    const off = tzOffset(city.tz, now);
    // Ville de départ : une grande ville d'un autre fuseau.
    const bases = extras.timezones.filter((x) => x.tier === 1 && x.id !== target && tzOffset(x.tz, now) !== off);
    const base = bases.length ? bases[Math.floor(rnd() * bases.length)] : extras.timezones[0];
    const start = (6 + Math.floor(rnd() * 16)) * 60; // entre 6:00 et 21:00
    const diff = off - tzOffset(base.tz, now);
    const right = start + diff;
    const prompt = mapNames((l) => TZ_Q[l](base.names[l], hhmm(start), city.names[l]));
    const qbase = { category: 'timezones', target, promptKey: 'cat.timezones', promptName: prompt, answer: clockLabel(right) };
    if (kind === 'mcq') {
      const cands = [right + 60, right - 60, right + 120, right - 120, start - diff, right + 180, right - 180].filter((v) => v !== right);
      const others = shuffle([...new Set(cands)], rnd).slice(0, 3);
      const opts = [right, ...others].sort((a, b) => a - b).map((v, i) => ({ id: `o${i}`, target: String(v), label: clockLabel(v) }));
      const correct = opts.find((o) => o.target === String(right))!.id;
      return { ...qbase, kind: 'mcq', options: opts, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    const want = ((right % 1440) + 1440) % 1440;
    return { ...qbase, kind: 'type', attempts: 1, check: (v) => parseClock(v) === want };
  },
};

// ------------------------------------------------------------------ où est-ce sur la carte ?
// On pose une épingle ; les points dépendent de la distance (en km) à la capitale.
export function toLonLat(x: number, y: number): [number, number] {
  const [x0, y1, scale] = world.proj ?? [0, 0, 0];
  const px = x / scale + x0, py = y1 - y / scale;
  // Projection Natural Earth inversée (Newton sur la latitude).
  let p = py;
  for (let i = 0; i < 12; i++) {
    const p2 = p * p, p4 = p2 * p2;
    const f = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))) - py;
    const df = 1.007226 + p2 * (3 * 0.015085 + p4 * (7 * -0.044475 + 9 * 0.028874 * p2 - 11 * 0.005916 * p4));
    p -= f / df;
  }
  const p2 = p * p, p4 = p2 * p2;
  const l = px / (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  return [l, p];
}
export function distanceKm(a: [number, number], b: [number, number]): number {
  if (!world.proj) return Math.hypot(a[0] - b[0], a[1] - b[1]) * 40; // carte sans projection (démo)
  const [l1, p1] = toLonLat(a[0], a[1]);
  const [l2, p2] = toLonLat(b[0], b[1]);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const hasPoint = (id: string) => hasCapital(id) && !!worldById[id]?.k;
const pinCat: Category = {
  id: 'pin',
  qtypes: ['map'],
  zoneKinds: ['world', 'continent', 'subregion'],
  // En facile, le pays est donné avec la ville.
  pool: (zone, d, n) => countryPool(zone, d, n, hasPoint).map((id) => `${id}|${d === 'easy' ? 1 : 0}`),
  make(target, _kind, zone) {
    const [id, hint] = target.split('|');
    const c = countries[id];
    const cap = c.capital!;
    const k = worldById[id].k!;
    // Barème selon la taille de la zone : tous les points tout près, plus rien très loin.
    const span = distanceKm([zone.view[0], zone.view[1] + zone.view[3] / 2], [zone.view[0] + zone.view[2], zone.view[1] + zone.view[3] / 2]) || 20000;
    const full = Math.max(80, span * 0.012), zero = Math.max(700, span * 0.12);
    const grade = (v: string) => {
      const [x, y] = v.split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, credit: 0 };
      const km = distanceKm([x, y], k);
      const credit = km <= full ? 1 : Math.max(0, 1 - (km - full) / (zero - full));
      return { ok: credit >= 0.6, credit: Math.round(credit * 100) / 100, km: Math.round(km) };
    };
    return {
      category: 'pin', kind: 'pin', target, promptKey: 'q.pin',
      promptName: hint === '1' ? mapNames((l) => `${cap.names[l]} (${c.names[l]})`) : cap.names,
      answer: mapNames((l) => `${cap.names[l]} — ${c.names[l]}`),
      map: worldSpec(zone, 'shapes'), point: k, revealId: id, attempts: 1,
      check: (v) => grade(v).ok, grade,
    };
  },
};

// ------------------------------------------------------------------ villes du Maroc
// Placer une ville sur la carte des 12 régions (points selon la distance), ou trouver sa région.
const macitiesCat: Category = {
  id: 'macities',
  noZone: true,
  qtypes: ['map', 'mcq'],
  zoneKinds: ['regions'],
  pool(zone, d, n) {
    const rm = zone.region && regionMap(zone.region.iso, zone.region.level);
    if (!rm?.data.points) return [];
    return tierPool(extras.macities.filter((c) => rm.data.points![c.id]), d, n);
  },
  make(target, kind, zone, rnd) {
    const { iso, level } = zone.region!;
    const rm = regionMap(iso, level)!.data;
    const city = extras.macities.find((c) => c.id === target)!;
    const [px, py, region] = rm.points![target];
    const spec: MapSpec = { map: `region:${iso}:${level}`, view: zone.view, active: rm.features.map((f) => f.id), layer: 'shapes' };
    const regionName = rm.names[region];
    const answer = regionName ? mapNames((l) => `${city.names[l]} — ${regionName[l]}`) : city.names;
    if (kind === 'mcq' && regionName) {
      // « Dans quelle région se trouve… ? » : pièges parmi les régions voisines.
      const me = rm.features.find((f) => f.id === region)!;
      const near = rm.features.filter((f) => f.id !== region)
        .sort((a, b) => Math.hypot(a.c[0] - me.c[0], a.c[1] - me.c[1]) - Math.hypot(b.c[0] - me.c[0], b.c[1] - me.c[1]))
        .slice(0, 5).map((f) => f.id);
      const { options, correct } = optionsFrom(region, shuffle(near, rnd).slice(0, 3), rnd, (id) => ({ label: rm.names[id] }));
      return { category: 'macities', kind: 'mcq', target, promptKey: 'q.macities.region', promptName: city.names, answer, map: spec, options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    const k = rm.kmPerUnit ?? 1;
    const grade = (v: string) => {
      const [x, y] = v.split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, credit: 0 };
      const km = Math.hypot(x - px, y - py) * k;
      const credit = km <= 15 ? 1 : Math.max(0, 1 - (km - 15) / 235);
      return { ok: credit >= 0.6, credit: Math.round(credit * 100) / 100, km: Math.round(km) };
    };
    return {
      category: 'macities', kind: 'pin', target, promptKey: 'q.pin', promptName: city.names, answer, map: spec,
      point: [px, py], attempts: 1, check: (v) => grade(v).ok, grade,
    };
  },
};

// ------------------------------------------------------------------ frise chronologique
const YEAR_BC: Record<Lang, (y: number) => string> = { fr: (y) => `${y} av. J.-C.`, en: (y) => `${y} BC`, es: (y) => `${y} a. C.`, ar: (y) => `${y} ق.م` };
const yearOf = (y: number, l: Lang) => (y < 0 ? YEAR_BC[l](-y) : String(y));
const timelineCat: Category = {
  id: 'timeline',
  noZone: true,
  qtypes: ['mcq'],
  zoneKinds: ['world'],
  pool(_zone, d, n) {
    const maxTier = d === 'easy' ? 1 : d === 'medium' ? 2 : 3;
    const gap = d === 'easy' ? 40 : d === 'medium' ? 15 : 4;
    let list = extras.timeline.filter((e) => e.tier <= maxTier);
    if (list.length < 8) list = extras.timeline;
    const out = new Set<string>();
    for (let i = 0; out.size < n && i < n * 40; i++) {
      const pick: typeof list = [];
      for (const e of shuffle(list, Math.random)) {
        if (pick.every((p) => Math.abs(p.year - e.year) >= gap)) pick.push(e);
        if (pick.length === 4) break;
      }
      if (pick.length === 4) out.add(pick.map((e) => e.id).sort().join(','));
    }
    return [...out];
  },
  make(target, _kind, _zone, rnd) {
    const evs = target.split(',').map((id) => extras.timeline.find((e) => e.id === id)!);
    const opts = shuffle(evs, rnd).map((e, i) => ({ id: `o${i}`, target: e.id, label: e.names }));
    const order = evs.slice().sort((a, b) => a.year - b.year).map((e) => opts.find((o) => o.target === e.id)!.id);
    const byOpt = Object.fromEntries(opts.map((o) => [o.id, evs.find((e) => e.id === o.target)!]));
    return {
      category: 'timeline', kind: 'order', target, promptKey: 'q.timeline', options: opts, order, attempts: 1,
      answer: mapNames((l) => order.map((o) => `${yearOf(byOpt[o].year, l)} : ${byOpt[o].names[l]}`).join(' → ')),
      check: (v) => v === order.join(','),
    };
  },
};

// ------------------------------------------------------------------ chaîne de pays
// Un pays est donné : il faut en citer un autre qui commence par sa dernière lettre
// (dans la langue du joueur : « Maroc » → C, « Morocco » → O, « المغرب » → ب).
const letters = (s: string) => normalize(s).replace(/[^\p{L}]/gu, '');
const lastLetter = (s: string) => letters(s).slice(-1);
const firstLetter = (s: string) => letters(s).slice(0, 1);
const chainable = (id: string) => !!worldById[id] && !countries[id].dependency;
function chainAnswers(target: string): Record<Lang, string[]> {
  const t = countries[target];
  const all = Object.keys(countries).filter((id) => id !== target && chainable(id));
  return Object.fromEntries(LANG_KEYS.map((l) => {
    const want = lastLetter(t.names[l]);
    const ok = all.filter((id) => firstLetter(countries[id].names[l]) === want);
    // Les plus connus d'abord (exemples de réponse).
    ok.sort((a, b) => (countries[b].fame ?? 0) - (countries[a].fame ?? 0));
    return [l, ok];
  })) as Record<Lang, string[]>;
}
const chainCat: Category = {
  id: 'chain',
  noZone: true,
  qtypes: ['type'],
  zoneKinds: ['world'],
  pool(zone, d, n) {
    // Seulement les pays qui laissent au moins 2 réponses possibles dans chaque langue.
    return countryPool(zones.get('world')!, d, n, (id) => chainable(id) && Object.values(chainAnswers(id)).every((a) => a.length >= 2));
  },
  make(target) {
    const t = countries[target];
    const ok = chainAnswers(target);
    const accepted = LANG_KEYS.flatMap((l) => ok[l].map((id) => countries[id].names[l]));
    return {
      category: 'chain', kind: 'type', target, promptKey: 'q.chain',
      promptName: mapNames((l) => `${t.names[l]} → ${lastLetter(t.names[l]).toUpperCase()}…`),
      answer: mapNames((l) => ok[l].slice(0, 3).map((id) => countries[id].names[l]).join(', ')),
      attempts: 1, check: typedCheck(accepted, countryNameSet),
    };
  },
};

// ------------------------------------------------------------------ cris d'animaux
const soundById = () => Object.fromEntries(extras.sounds.map((x) => [x.id, x]));
let soundNames: Set<string> | null = null;
const soundsCat: Category = {
  id: 'sounds',
  noZone: true,
  media: 'sounds',
  qtypes: ['mcq', 'type'],
  zoneKinds: ['world'],
  pool: (_zone, d, n) => tierPool(extras.sounds.filter((s) => soundFor(s.id)), d, n),
  make(target, kind, _zone, rnd) {
    const a = soundById()[target];
    const label = (x: { emoji?: string; names: Names }) => (x.emoji ? mapNames((l) => `${x.emoji} ${x.names[l]}`) : x.names);
    const base = { category: 'sounds', target, answer: label(a), promptKey: 'q.sounds', imageRef: `wiki:snd:${target}`, credit: soundFor(target)?.credit };
    if (kind === 'mcq') {
      const others = shuffle(extras.sounds.filter((x) => x.id !== target && soundFor(x.id)), rnd).slice(0, 3).map((x) => x.id);
      const byId = soundById();
      const { options, correct } = optionsFrom(target, others, rnd, (id) => ({ label: label(byId[id]) }));
      return { ...base, kind: 'mcq', options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    soundNames ??= nameSet(extras.sounds.map((x) => x.names));
    return { ...base, kind: 'type', attempts: 1, check: typedCheck(allNames(a.names), soundNames) };
  },
};

// ------------------------------------------------------------------ stades et lieux mythiques (photos libres)
const stadiumById = () => Object.fromEntries(extras.stadiums.map((m) => [m.id, m]));
let stadiumNames: Set<string> | null = null;
const stadiumsCat: Category = {
  id: 'stadiums',
  noZone: true,
  media: 'stadiums',
  qtypes: ['mcq', 'type'],
  zoneKinds: ['world'],
  pool: (_zone, d, n) => tierPool(extras.stadiums.filter((m) => photoFor(m.id)), d, n),
  make(target, kind, _zone, rnd) {
    const m = stadiumById()[target];
    const photo = photoFor(target)!;
    const c = countries[m.country];
    const base = { category: 'stadiums', target, imageRef: `wiki:${target}`, credit: photo.credit };
    const full = mapNames((l) => `${m.names[l]} — ${m.home ? m.home[l] : c.names[l]}`);
    const all = extras.stadiums.filter((x) => x.id !== target && photoFor(x.id));
    const near = [...shuffle(all.filter((x) => x.sport === m.sport), rnd), ...shuffle(all.filter((x) => x.sport !== m.sport), rnd)];
    if (kind === 'type') {
      stadiumNames ??= nameSet(extras.stadiums.flatMap((x) => (x.home ? [x.names, x.home] : [x.names])));
      const accepted = [...allNames(m.names), ...(m.home ? allNames(m.home) : [])];
      return { ...base, kind: 'type', answer: full, promptKey: 'q.stadiums.type', attempts: 1, check: typedCheck(accepted, stadiumNames) };
    }
    const roll = rnd();
    if (m.home && roll < 0.4) {
      // « Qui joue ici ? » : pièges parmi les clubs et événements des autres lieux.
      const homes = near.filter((x) => x.home);
      const { options, correct } = optionsFrom(target, homes.slice(0, 3).map((x) => x.id), rnd, (id) => ({ label: stadiumById()[id].home! }));
      return { ...base, kind: 'mcq', answer: full, promptKey: 'q.stadiums.home', options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    if (roll < 0.8) {
      const { options, correct } = optionsFrom(target, near.slice(0, 3).map((x) => x.id), rnd, (id) => ({ label: stadiumById()[id].names }));
      return { ...base, kind: 'mcq', answer: full, promptKey: 'q.stadiums.name', options, revealOption: correct, attempts: 1, check: (v) => v === correct };
    }
    const { options, correct } = optionsFrom(m.country, countryDistractors(m.country, 3, rnd, (x) => !countries[x].dependency), rnd, (id) => ({ label: countries[id].names }));
    return { ...base, kind: 'mcq', answer: full, promptKey: 'q.stadiums.country', options, revealOption: correct, attempts: 1, check: (v) => v === correct };
  },
};

// ------------------------------------------------------------------ couleurs des équipes (maillots dessinés)
// Deux maillots « qui se ressemblent » (même motif, mêmes teintes) ne sont jamais proposés ensemble.
function hueName(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (l > 0.85) return 'white';
  if (l < 0.15) return 'black';
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.2) return 'grey';
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 18 || h >= 330) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 250) return l > 0.5 ? 'sky' : 'blue';
  return 'red';
}
export const kitLook = (k: KitSpec) => (k.p === 'plain' ? `plain:${hueName(k.c[0])}` : `${k.p}:${k.c.slice(0, 2).map(hueName).sort().join('+')}`);
const NATIONS = new Set(['bra', 'arg', 'ned', 'cro', 'fra', 'ita', 'ger', 'mar', 'mex', 'esp', 'por', 'cmr', 'jpn']);
const kitsCat: Category = {
  id: 'kits',
  noZone: true,
  qtypes: ['mcq'],
  zoneKinds: ['world'],
  pool: (_zone, d, n) => tierPool(extras.kits, d, n),
  make(target, _kind, _zone, rnd) {
    const k = extras.kits.find((x) => x.id === target)!;
    const look = kitLook(k.kit);
    const others = extras.kits.filter((x) => x.id !== target && kitLook(x.kit) !== look);
    // Pièges : d'abord le même genre (club ou sélection), sans doublons de look.
    const same = (x: { id: string }) => NATIONS.has(x.id) === NATIONS.has(target);
    const picked: typeof others = [];
    for (const x of [...shuffle(others.filter(same), rnd), ...shuffle(others.filter((y) => !same(y)), rnd)]) {
      if (picked.length === 3) break;
      if (!picked.some((p) => kitLook(p.kit) === kitLook(x.kit))) picked.push(x);
    }
    const byId = Object.fromEntries(extras.kits.map((x) => [x.id, x]));
    const { options, correct } = optionsFrom(target, picked.map((x) => x.id), rnd, (id) => ({ label: byId[id].names }));
    return {
      category: 'kits', kind: 'mcq', target, promptKey: NATIONS.has(target) ? 'q.kits.nation' : 'q.kits.club', kit: k.kit,
      answer: k.names, options, revealOption: correct, attempts: 1, check: (v) => v === correct,
    };
  },
};

// ------------------------------------------------------------------ défi du jour
// Dix questions, une par jeu, identiques pour tout le monde le même jour (tirage à graine).
export const DAILY_GAMES = ['flags', 'capitals', 'countries', 'emoji', 'food', 'sport', 'space', 'animals', 'maroc', 'silhouettes'];
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function dailyQuestions(day = dayKey()): InternalQuestion[] {
  const rnd = seeded(`quizellige:${day}`);
  const world = zones.get('world')!;
  const out: InternalQuestion[] = [];
  for (const id of DAILY_GAMES) {
    const cat = CATEGORIES[id];
    if (!cat) continue;
    const pool = cat.pool(world, 'medium', 30).slice().sort();
    if (!pool.length) continue;
    const t = pool[Math.floor(rnd() * pool.length)];
    const q = cat.make(t, 'mcq', world, rnd);
    if (q.map?.map === 'world') q.map = { ...q.map, active: q.map.active.filter((x) => x === t || !countries[x]?.dependency) };
    out.push(q);
  }
  return out;
}
const dailyCat: Category = {
  id: 'daily',
  noZone: true,
  qtypes: ['mcq'],
  zoneKinds: ['world'],
  pool: () => [],
  make() { throw new Error('défi du jour : voir dailyQuestions'); },
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


// ------------------------------------------------------------------ où suis-je ? (photo de paysage)
/** Projection Natural Earth (degrés → coordonnées de la carte du monde). */
export function fromLonLat(lonDeg: number, latDeg: number): [number, number] {
  const l = (lonDeg * Math.PI) / 180, p = (latDeg * Math.PI) / 180;
  if (!world.proj) return [Math.round(500 + lonDeg * 2.8), Math.round(306 - latDeg * 3.4)]; // carte de démo
  const [x0, y1, scale] = world.proj;
  const p2 = p * p, p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [Math.round((x - x0) * scale * 10) / 10, Math.round((y1 - y) * scale * 10) / 10];
}
const whereamiCat: Category = {
  id: 'whereami',
  noZone: true,
  media: 'landscapes',
  qtypes: ['map'],
  zoneKinds: ['world'],
  pool: (_zone, d, n) => tierPool(extras.landscapes.filter((m) => photoFor(m.id)), d, n),
  make(target, _kind, zone) {
    const m = extras.landscapes.find((x) => x.id === target)!;
    const photo = photoFor(target)!;
    const k = fromLonLat(m.lon, m.lat);
    // Tous les points à moins de 150 km, plus rien au-delà de 3 000 km.
    const grade = (v: string) => {
      const [x, y] = v.split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, credit: 0 };
      const km = distanceKm([x, y], k);
      const credit = km <= 150 ? 1 : Math.max(0, 1 - (km - 150) / 2850);
      return { ok: credit >= 0.6, credit: Math.round(credit * 100) / 100, km: Math.round(km) };
    };
    const c = countries[m.country];
    return {
      category: 'whereami', kind: 'pin', target, promptKey: 'q.whereami', imageRef: `wiki:${target}`, credit: photo.credit,
      answer: mapNames((l) => `${m.names[l]} — ${c.names[l]}`),
      map: worldSpec(zone, 'shapes'), point: k, attempts: 1, check: (v) => grade(v).ok, grade,
    };
  },
};

// ------------------------------------------------------------------ qui suis-je ? (indices)
const CONTINENT_NAMES: Record<string, Names> = {
  africa: { fr: 'Afrique', en: 'Africa', es: 'África', ar: 'أفريقيا' },
  europe: { fr: 'Europe', en: 'Europe', es: 'Europa', ar: 'أوروبا' },
  asia: { fr: 'Asie', en: 'Asia', es: 'Asia', ar: 'آسيا' },
  'north-america': { fr: 'Amérique du Nord', en: 'North America', es: 'América del Norte', ar: 'أمريكا الشمالية' },
  'south-america': { fr: 'Amérique du Sud', en: 'South America', es: 'América del Sur', ar: 'أمريكا الجنوبية' },
  oceania: { fr: 'Océanie', en: 'Oceania', es: 'Oceanía', ar: 'أوقيانوسيا' },
};
const CLUE: Record<string, Names> = {
  pop: { fr: "J'ai environ {x} millions d'habitants.", en: 'I have about {x} million inhabitants.', es: 'Tengo unos {x} millones de habitantes.', ar: 'عدد سكاني حوالي {x} مليون نسمة.' },
  popSmall: { fr: "J'ai moins d'un million d'habitants.", en: 'I have fewer than one million inhabitants.', es: 'Tengo menos de un millón de habitantes.', ar: 'عدد سكاني أقل من مليون نسمة.' },
  currency: { fr: 'Ma monnaie : {x}.', en: 'My currency: {x}.', es: 'Mi moneda: {x}.', ar: 'عملتي: {x}.' },
  nbCount: { fr: "J'ai {x} pays voisins.", en: 'I have {x} neighbouring countries.', es: 'Tengo {x} países vecinos.', ar: 'لدي {x} دول مجاورة.' },
  island: { fr: "Je n'ai aucune frontière terrestre.", en: 'I have no land borders.', es: 'No tengo fronteras terrestres.', ar: 'ليست لدي حدود برية.' },
  continent: { fr: 'Je suis en {x}.', en: 'I am in {x}.', es: 'Estoy en {x}.', ar: 'أقع في {x}.' },
  neighbor: { fr: 'Un de mes voisins : {x}.', en: 'One of my neighbours: {x}.', es: 'Uno de mis vecinos: {x}.', ar: 'أحد جيراني: {x}.' },
  capital: { fr: 'Ma capitale commence par « {x} ».', en: 'My capital starts with “{x}”.', es: 'Mi capital empieza por «{x}».', ar: 'تبدأ عاصمتي بحرف «{x}».' },
};
const clue = (k: string, x?: (l: Lang) => string): Names => mapNames((l) => CLUE[k][l].replace('{x}', x ? x(l) : ''));
const whoamiCat: Category = {
  id: 'whoami',
  qtypes: ['mcq', 'type'],
  zoneKinds: ['world', 'continent'],
  pool: (zone, d, n) => countryPool(zone, d, n, (id) => !!countries[id].pop && !!worldById[id]),
  make(target, kind, zone, rnd) {
    const c = countries[target];
    const clues: Names[] = [];
    const m = (c.pop ?? 0) / 1e6;
    clues.push(m < 1 ? clue('popSmall') : clue('pop', (l) => (m < 10 ? Math.round(m * 10) / 10 : Math.round(m)).toLocaleString(l === 'ar' ? 'ar-MA' : l)));
    // La monnaie trahit souvent le pays (« dirham marocain ») : seulement si son nom ne le contient pas.
    const stem = (n: string) => normalize(n).slice(0, 4);
    const cur = c.currency;
    if (cur && LANG_KEYS.every((l) => !normalize(cur.names[l] ?? '').includes(stem(c.names[l] ?? '')))) clues.push(clue('currency', (l) => cur.names[l] ?? cur.code));
    else clues.push(c.neighbors.length ? clue('nbCount', (l) => c.neighbors.length.toLocaleString(l === 'ar' ? 'ar-MA' : l)) : clue('island'));
    if (CONTINENT_NAMES[c.continent]) clues.push(clue('continent', (l) => CONTINENT_NAMES[c.continent][l]));
    const nb = c.neighbors.filter((id) => countries[id] && !countries[id].dependency);
    if (nb.length) { const n = nb[Math.floor(rnd() * nb.length)]; clues.push(clue('neighbor', (l) => countries[n].names[l])); }
    if (c.capital) clues.push(clue('capital', (l) => [...(c.capital!.names[l] ?? '')][0]?.toUpperCase() ?? ''));
    const base = { category: 'whoami', target, promptKey: 'q.whoami', clues, answer: c.names, revealFlagIso: target, attempts: 1 };
    if (kind === 'type') return { ...base, kind: 'type', check: typedCheck(allNames(c.names), countryNameSet) };
    const { options, correct } = optionsFrom(target, countryDistractors(target, 3, rnd, (x) => !countries[x].dependency && (zone.countryIds ?? []).includes(x)), rnd, (id) => ({ label: countries[id].names, flagIso: undefined }));
    return { ...base, kind: 'mcq', options, revealOption: correct, check: (v) => v === correct };
  },
};

// ------------------------------------------------------------------ survie (3 vies)
/** Questions de plus en plus dures, tous jeux de géographie mélangés (QCM). */
export const SURVIVAL_GAMES = ['flags', 'capitals', 'countries', 'currencies', 'silhouettes', 'languages', 'whoami'];
export function survivalQuestions(rnd: () => number = Math.random): InternalQuestion[] {
  const zone = zones.get('world')!;
  const out: InternalQuestion[] = [];
  const steps: [Difficulty, number][] = [['easy', 10], ['medium', 20], ['hard', 40]];
  const seen = new Set<string>();
  for (const [d, n] of steps) {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 6; tries++) {
        const cat = CATEGORIES[SURVIVAL_GAMES[Math.floor(rnd() * SURVIVAL_GAMES.length)]];
        if (!cat?.qtypes.includes('mcq')) continue;
        const pool = cat.pool(zone, d, 30);
        if (!pool.length) continue;
        const t = pool[Math.floor(rnd() * pool.length)];
        if (seen.has(`${cat.id}:${t}`)) continue;
        seen.add(`${cat.id}:${t}`);
        try {
          const q = cat.make(t, 'mcq', zone, rnd);
          if (q.map?.map === 'world') q.map = { ...q.map, active: q.map.active.filter((x) => x === t || !countries[x]?.dependency) };
          out.push(q);
        } catch { continue; }
        break;
      }
    }
  }
  return out;
}
const boardCat: Category = { id: 'board', noZone: true, qtypes: ['mcq'], zoneKinds: ['world'], pool: () => [], make() { throw new Error('plateau'); } };
const survivalCat: Category = {
  id: 'survival',
  noZone: true,
  qtypes: ['mcq'],
  zoneKinds: ['world'],
  pool: () => [],
  make() { throw new Error('survie : voir survivalQuestions'); },
};

export const CATEGORIES: Record<string, Category> = Object.fromEntries(
  [countriesCat, flagsCat, capitalsCat, regionsCat, silhouettesCat, currenciesCat, languagesCat, foodCat, animalsCat, monumentsCat, emojiCat, cinemaCat, truefalseCat, calcCat, customCat, ...packCats,
    higherCat, flagrevealCat, tablesCat, timezonesCat, pinCat, timelineCat, chainCat, soundsCat, stadiumsCat, kitsCat, dailyCat, { ...dailyCat, id: 'review' }, macitiesCat, eventCat, whereamiCat, whoamiCat, survivalCat, boardCat, ...revCats].map((c) => [c.id, c]),
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
