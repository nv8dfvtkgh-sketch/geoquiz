// Données du jeu, indépendantes de la plateforme (Node ou Cloudflare Workers).
// Chaque plateforme charge les fichiers de data/build puis appelle initData().
import type { Catalog, CategoryId, MapData, MapFeature, Names, ZoneInfo } from '../shared/protocol';
import { normalize } from './text';

export interface CountryMeta {
  a3: string;
  continent: string;
  subregion: string;
  rank: number;
  /** notoriété (poids économique + population) : plus c'est haut, plus le pays est connu */
  fame?: number;
  /** population estimée (Natural Earth) et surface en km² : jeu « Plus ou moins » */
  pop?: number;
  area?: number;
  dependency: boolean;
  names: Names;
  neighbors: string[];
  capital?: { names: Names; alts: string[] };
  currency?: { code: string; names: Names };
  /** niveau → [nombre d'entités, largeur, hauteur] */
  regions?: Record<string, [number, number, number]>;
  regionLabel?: string;
}

export interface RegionLevel extends MapData {
  names: Record<string, Names>;
  /** Maroc : villes à placer [x, y, région] et échelle de la carte. */
  points?: Record<string, [number, number, string]>;
  kmPerUnit?: number;
}

export type RegionLoader = (iso: string) => Promise<{ levels: Record<string, RegionLevel> } | null> | { levels: Record<string, RegionLevel> } | null;

export interface Language {
  id: string;
  greeting: string;
  countries: string[];
  tier: number;
  names: Names;
}
/** Plat ou animal emblème : rattaché à un ou plusieurs pays (le premier est le principal). */
export interface CountryItem {
  id: string;
  countries: string[];
  tier: number;
  emoji?: string;
  names: Names;
}
/** Affirmation du jeu Vrai ou faux. */
export interface TrueFalse {
  id: string;
  tier: number;
  answer: boolean;
  text: Names;
  note?: Names;
}
/** Rébus en emojis : un pays (noms tirés des données) ou une ville / un film (noms fournis). */
export interface EmojiItem {
  id: string;
  theme: 'country' | 'city' | 'film' | 'tale' | 'series' | 'cartoon' | 'character';
  tier: number;
  emoji: string;
  country?: string;
  names?: Names;
  alts?: string[];
}
/** Monument : article Wikipédia (anglais) d'où vient sa photo libre. */
export interface Monument {
  id: string;
  wiki: string;
  country: string;
  tier: number;
  names: Names;
}
/** Cinéma : films (titres traduits) et personnes (réalisateurs, acteurs). */
export interface Film {
  id: string;
  tier: number;
  year: number;
  title: Names;
  director: string;
  actor?: string; // absent : film d'animation
  character?: Names;
  cast?: string[]; // autres acteurs du film, jamais proposés comme pièges
  noYear?: boolean; // année de sortie discutée : pas de question sur l'année
}
export interface Cinema { films: Film[]; people: Record<string, Names> }
/** Question d'un « pack » (sciences, sport, Maroc…) : la première réponse est la bonne. */
export interface PackQ { id: string; tier: number; q: Names; a: Names[]; emoji?: string; sign?: string }
/** Événement de la frise chronologique (année négative = avant J.-C.). */
export interface HistEvent { id: string; year: number; tier: number; names: Names }
/** Ville et son fuseau horaire IANA (le décalage est calculé le jour même). */
export interface TzCity { id: string; tz: string; tier: number; names: Names }
/** Stade ou lieu de sport : photo libre (comme les monuments), club ou événement résident. */
export interface Stadium { id: string; wiki: string; country: string; tier: number; sport: string; names: Names; home?: Names }
/** Maillot dessiné : motif, couleurs et short (aucun logo). */
export interface Kit { p: string; c: string[]; sh: string }
export interface KitTeam { id: string; tier: number; names: Names; kit: Kit }
/** Ville du Maroc à placer sur la carte des régions. */
export interface Landscape { id: string; wiki: string; lat: number; lon: number; country: string; tier: number; names: Names }
export interface MaCity { id: string; lat: number; lon: number; tier: number; names: Names }
/** Cri d'animal : enregistrement libre cherché sur Wikimedia Commons. */
export interface AnimalSound { id: string; tier: number; emoji?: string; q: string; names: Names }
/** Jeux construits sur les packs ; « sport » mélange toutes les disciplines. */
export const PACK_GAMES: Record<string, string[]> = {
  space: ['space'], body: ['body'], dinos: ['dinos'],
  sport: ['football', 'tennis', 'rugby', 'basketball', 'olympics', 'motorsport', 'afrisport'],
  football: ['football'], tennis: ['tennis'], rugby: ['rugby'], basketball: ['basketball'], olympics: ['olympics'], motorsport: ['motorsport'],
  maroc: ['maroc'], roadsigns: ['roadsigns'], vocab: ['vocab'], hello: ['hello'],
  prog_geo: ['prog_geo'], prog_hist: ['prog_hist'], prog_sci: ['prog_sci'], tifinagh: ['tifinagh'],
  peaks: ['peaks'], records: ['records'], inventions: ['inventions'], afrisport: ['afrisport'],
};
/** Événement du moment : un pack de questions et un badge, entre deux dates (incluses). */
export interface GameEvent { id: string; pack: string; emoji: string; start: string; end: string; names: Names }
export function activeEvent(now = Date.now()): GameEvent | undefined {
  const day = new Date(now).toISOString().slice(0, 10);
  return extras.events.find((e) => e.start <= day && day <= e.end);
}
/** Jeux sans choix de région (la zone est toujours « monde »). */
export const NO_ZONE_GAMES = ['whereami', 'survival', 'tables', 'timezones', 'timeline', 'chain', 'sounds', 'stadiums', 'kits', 'daily', 'review', 'event'];
/** Données des jeux annexes (data/games/*.json). */
export interface Extras {
  languages: Language[];
  food: CountryItem[];
  animals: CountryItem[];
  truefalse: TrueFalse[];
  emoji: EmojiItem[];
  monuments: Monument[];
  cinema: Cinema;
  packs: Record<string, PackQ[]>;
  timeline: HistEvent[];
  timezones: TzCity[];
  stadiums: Stadium[];
  kits: KitTeam[];
  sounds: AnimalSound[];
  macities: MaCity[];
  events: GameEvent[];
  landscapes: Landscape[];
}
export const EXTRA_FILES = ['languages', 'food', 'animals', 'truefalse', 'emoji', 'monuments', 'cinema', 'packs', 'timeline', 'timezones', 'stadiums', 'kits', 'sounds', 'macities', 'events', 'landscapes'] as const;

export let world: MapData = { w: 0, h: 0, features: [] };
export let extras: Extras = { languages: [], food: [], animals: [], truefalse: [], emoji: [], monuments: [], cinema: { films: [], people: {} }, packs: {}, timeline: [], timezones: [], stadiums: [], kits: [], sounds: [], macities: [], events: [], landscapes: [] };
export let countries: Record<string, CountryMeta> = {};
export let worldById: Record<string, MapFeature> = {};
export let worldJson = '';
export let countryNameSet = new Set<string>();
export let capitalNameSet = new Set<string>();
export const zones = new Map<string, ZoneCtx>();
let loader: RegionLoader = () => null;

export interface ZoneCtx {
  info: ZoneInfo;
  countryIds?: string[]; // zones monde / continent / sous-région
  region?: { iso: string; level: string };
  view: [number, number, number, number];
}

// ------------------------------------------------------------------ cartes de régions
const regionCache = new Map<string, { levels: Record<string, RegionLevel>; json: Record<string, string> }>();

/** Charge (une fois) la carte des régions d'un pays. */
export async function ensureRegion(iso: string): Promise<boolean> {
  if (regionCache.has(iso)) return true;
  if (!/^[A-Z]{2}$/.test(iso) || !countries[iso]?.regions) return false;
  const file = await loader(iso);
  if (!file) return false;
  // Les noms restent côté serveur : la carte envoyée au navigateur ne contient que la géométrie.
  const json = Object.fromEntries(Object.entries(file.levels).map(([k, v]) => [k, JSON.stringify({ w: v.w, h: v.h, features: v.features })]));
  regionCache.set(iso, { levels: file.levels, json });
  return true;
}
export const regionLoaded = (iso: string) => regionCache.has(iso);

/** Lecture synchrone : la carte doit avoir été chargée avec ensureRegion(). */
export function regionMap(iso: string, level: string): { data: RegionLevel; json: string } | null {
  const entry = regionCache.get(iso);
  const data = entry?.levels[level];
  return data ? { data, json: entry!.json[level] } : null;
}

// ------------------------------------------------------------------ initialisation
const IGNORED_GROUPS = new Set(['antarctica', 'seven-seas-open-ocean', 'other']);
const round = (v: number) => Math.round(v * 10) / 10;

function viewFor(ids: string[]): [number, number, number, number] {
  // Emprise robuste : autour des points d'étiquette (évite qu'un territoire lointain,
  // comme la Guyane pour la France, n'élargisse toute la vue Europe).
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    const f = worldById[id];
    if (!f) continue;
    const r = Math.min(Math.sqrt(f.a) * 0.75, Math.max(f.b[2] - f.b[0], f.b[3] - f.b[1]) / 2);
    x0 = Math.min(x0, Math.max(f.b[0], f.c[0] - r));
    y0 = Math.min(y0, Math.max(f.b[1], f.c[1] - r));
    x1 = Math.max(x1, Math.min(f.b[2], f.c[0] + r));
    y1 = Math.max(y1, Math.min(f.b[3], f.c[1] + r));
  }
  const pad = Math.max(x1 - x0, y1 - y0) * 0.06 + 4;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(world.w, x1 + pad);
  y1 = Math.min(world.h, y1 + pad);
  return [round(x0), round(y0), round(x1 - x0), round(y1 - y0)];
}

export function nameSet(list: Names[]): Set<string> {
  const s = new Set<string>();
  for (const n of list) for (const v of Object.values(n)) s.add(normalize(v));
  return s;
}

let ready = false;
export const dataReady = () => ready;

export function initData(w: MapData, c: Record<string, CountryMeta>, regionLoader: RegionLoader, extra: Partial<Extras> = {}) {
  world = w;
  // Plats et animaux : seulement ceux dont le pays principal existe dans les données.
  const known = (x: CountryItem) => x.countries.filter((id) => c[id]).length > 0;
  extras = {
    languages: extra.languages ?? [],
    food: (extra.food ?? []).map((x) => ({ ...x, countries: x.countries.filter((id) => c[id]) })).filter(known),
    animals: (extra.animals ?? []).map((x) => ({ ...x, countries: x.countries.filter((id) => c[id]) })).filter(known),
    truefalse: extra.truefalse ?? [],
    emoji: (extra.emoji ?? []).filter((x) => x.theme !== 'country' || c[x.country!]),
    monuments: (extra.monuments ?? []).filter((x) => c[x.country]),
    cinema: (extra.cinema as unknown as Cinema)?.films ? (extra.cinema as unknown as Cinema) : { films: [], people: {} },
    packs: extra.packs && !Array.isArray(extra.packs) ? (extra.packs as Record<string, PackQ[]>) : {},
    timeline: extra.timeline ?? [],
    timezones: extra.timezones ?? [],
    stadiums: (extra.stadiums ?? []).filter((x) => c[x.country]),
    kits: extra.kits ?? [],
    sounds: extra.sounds ?? [],
    macities: extra.macities ?? [],
    events: extra.events ?? [],
    landscapes: ((extra.landscapes ?? []) as Landscape[]).filter((x) => c[x.country]),
  };
  countries = c;
  loader = regionLoader;
  worldById = Object.fromEntries(world.features.map((f) => [f.id, f]));
  worldJson = JSON.stringify(world);
  countryNameSet = nameSet(Object.values(countries).map((x) => x.names));
  capitalNameSet = nameSet(Object.values(countries).flatMap((x) => (x.capital ? [x.capital.names] : [])));
  zones.clear();
  regionCache.clear();

  const all = Object.keys(countries).filter((id) => worldById[id]);
  const worldCats: CategoryId[] = ['countries', 'flags', 'capitals', 'silhouettes', 'currencies', 'flagreveal', 'pin', 'higher', 'whoami'];
  zones.set('world', { info: { id: 'world', kind: 'world', count: all.length, categories: [...worldCats, 'languages', 'food', 'animals', 'monuments', 'emoji', 'cinema', 'truefalse', 'calc', ...Object.keys(PACK_GAMES), ...NO_ZONE_GAMES] }, countryIds: all, view: [0, 0, world.w, world.h] });
  const conts = new Map<string, string[]>();
  const subs = new Map<string, { cont: string; ids: string[] }>();
  for (const id of all) {
    const m = countries[id];
    if (!IGNORED_GROUPS.has(m.continent)) {
      if (!conts.has(m.continent)) conts.set(m.continent, []);
      conts.get(m.continent)!.push(id);
    }
    if (!IGNORED_GROUPS.has(m.subregion)) {
      if (!subs.has(m.subregion)) subs.set(m.subregion, { cont: m.continent, ids: [] });
      subs.get(m.subregion)!.ids.push(id);
    }
  }
  for (const [k, ids] of [...conts].sort()) {
    const z = `c:${k}`;
    zones.set(z, { info: { id: z, kind: 'continent', parent: 'world', count: ids.length, categories: worldCats }, countryIds: ids, view: viewFor(ids) });
  }
  for (const [s, { cont, ids }] of [...subs].sort()) {
    if (ids.length < 2) continue;
    const z = `s:${s}`;
    zones.set(z, { info: { id: z, kind: 'subregion', parent: `c:${cont}`, count: ids.length, categories: worldCats }, countryIds: ids, view: viewFor(ids) });
  }
  for (const [iso, m] of Object.entries(countries)) {
    for (const [level, [count, w2, h2]] of Object.entries(m.regions ?? {})) {
      if (count < 2) continue;
      const z = `r:${iso}:${level}`;
      zones.set(z, {
        info: { id: z, kind: 'regions', parent: `c:${m.continent}`, names: m.names, level: level as 'groups' | 'subs', count, categories: iso === 'MA' && level === 'groups' ? ['regions', 'macities'] : ['regions'] },
        region: { iso, level },
        view: [0, 0, w2, h2],
      });
    }
  }
  ready = true;
}

export function catalog(categories: Catalog['categories'], maxPlayers: number, pools: Record<string, Record<string, number>> = {}): Catalog {
  return {
    zones: [...zones.values()].map((z) => ({
      ...z.info,
      view: z.view.map((n) => Math.round(n)) as [number, number, number, number],
      ids: z.info.kind === 'continent' || z.info.kind === 'subregion' ? z.countryIds : undefined,
      pool: pools[z.info.id] ?? (z.info.kind === 'regions' ? { regions: z.info.count } : undefined),
    })),
    categories, maxPlayers,
  };
}
