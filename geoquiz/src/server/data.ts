// Données du jeu, indépendantes de la plateforme (Node ou Cloudflare Workers).
// Chaque plateforme charge les fichiers de data/build puis appelle initData().
import type { Catalog, CategoryId, MapData, MapFeature, Names, ZoneInfo } from '../shared/protocol';
import { normalize } from './text';

export interface CountryMeta {
  a3: string;
  continent: string;
  subregion: string;
  rank: number;
  dependency: boolean;
  names: Names;
  neighbors: string[];
  capital?: { names: Names; alts: string[] };
  /** niveau → [nombre d'entités, largeur, hauteur] */
  regions?: Record<string, [number, number, number]>;
  regionLabel?: string;
}

export interface RegionLevel extends MapData {
  names: Record<string, Names>;
}

export type RegionLoader = (iso: string) => Promise<{ levels: Record<string, RegionLevel> } | null> | { levels: Record<string, RegionLevel> } | null;

export let world: MapData = { w: 0, h: 0, features: [] };
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

export function initData(w: MapData, c: Record<string, CountryMeta>, regionLoader: RegionLoader) {
  world = w;
  countries = c;
  loader = regionLoader;
  worldById = Object.fromEntries(world.features.map((f) => [f.id, f]));
  worldJson = JSON.stringify(world);
  countryNameSet = nameSet(Object.values(countries).map((x) => x.names));
  capitalNameSet = nameSet(Object.values(countries).flatMap((x) => (x.capital ? [x.capital.names] : [])));
  zones.clear();
  regionCache.clear();

  const all = Object.keys(countries).filter((id) => worldById[id]);
  const worldCats: CategoryId[] = ['countries', 'flags', 'capitals'];
  zones.set('world', { info: { id: 'world', kind: 'world', count: all.length, categories: worldCats }, countryIds: all, view: [0, 0, world.w, world.h] });
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
        info: { id: z, kind: 'regions', parent: `c:${m.continent}`, names: m.names, level: level as 'groups' | 'subs', count, categories: ['regions'] },
        region: { iso, level },
        view: [0, 0, w2, h2],
      });
    }
  }
  ready = true;
}

export function catalog(categories: Catalog['categories'], maxPlayers: number): Catalog {
  return { zones: [...zones.values()].map((z) => z.info), categories, maxPlayers };
}
