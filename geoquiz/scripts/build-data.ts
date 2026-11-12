/**
 * Pipeline de données : Natural Earth (+ CLDR pour les noms de pays) → fichiers du jeu.
 *
 *   npm run data          télécharge Natural Earth puis construit data/build/
 *   npm run data:demo     construit un petit monde fictif (hors ligne, pour tester)
 *
 * Sorties (data/build/) :
 *   world.json          carte du monde pré-projetée (géométrie seule, servie au navigateur)
 *   countries.json      métadonnées serveur : noms FR/EN/AR/ES, continent, voisins, capitale…
 *   regions/XX.json     carte des subdivisions de chaque pays (+ noms, côté serveur)
 *   flags/xx.svg        drapeaux (flag-icons, licence MIT)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  bbox, dissolve, edgeKeys, interiorPoint, localProjection, naturalEarth, pathD,
  Pt, Ring, ringArea, ringsOf, topoSimplify,
} from './lib/geo';
import { DROP_A3, MERGE_INTO, REGION_MAX_DISTANCE_FACTOR } from './config/borders';
import { REGION_GROUPS } from './config/regions';

const ROOT = path.resolve(__dirname, '..');
const DEMO = process.argv.includes('--demo');
const RAW = path.join(ROOT, DEMO ? 'data/raw-demo' : 'data/raw');
const OUT = path.join(ROOT, 'data/build');
const LANGS = ['fr', 'en', 'ar', 'es'] as const;
type Names = Record<(typeof LANGS)[number], string>;

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const FILES = {
  admin0: 'ne_50m_admin_0_countries.geojson',
  admin1: 'ne_10m_admin_1_states_provinces.geojson',
  places: 'ne_50m_populated_places.geojson',
};

// ---------------------------------------------------------------- utilitaires
const prop = (f: any, k: string): any => {
  const p = f.properties ?? {};
  if (k in p) return p[k];
  const lk = k.toLowerCase();
  for (const key of Object.keys(p)) if (key.toLowerCase() === lk) return p[key];
  return undefined;
};
const validIso = (v: any) => (typeof v === 'string' && /^[A-Z]{2}$/.test(v) ? v : undefined);
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s: string) => ' ' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const log = (...a: any[]) => console.log('•', ...a);

async function ensureRaw() {
  fs.mkdirSync(RAW, { recursive: true });
  for (const name of Object.values(FILES)) {
    const file = path.join(RAW, name);
    if (fs.existsSync(file)) continue;
    if (DEMO) throw new Error(`Fichier de démo manquant : ${file} (lancez npm run data:demo)`);
    log(`Téléchargement ${name}…`);
    const res = await fetch(NE_BASE + name);
    if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}) : ${NE_BASE + name}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
}

const readJson = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));

function cldrNames(): Record<string, Names> {
  const out: Record<string, Names> = {};
  for (const l of LANGS) {
    const t = readJson(path.join(ROOT, `data/names/countries.${l}.json`));
    for (const [iso, n] of Object.entries<string>(t)) (out[iso] ??= {} as Names)[l] = n;
  }
  return out;
}

function namesFrom(f: any, fallback: string): Names {
  const o = {} as Names;
  for (const l of LANGS) o[l] = (prop(f, `name_${l}`) || prop(f, `name`) || fallback || '').toString().trim();
  return o;
}

/** Projette, simplifie (topologie préservée), retire les îlots minuscules, calcule les attributs. */
function buildFeatures(
  items: { id: string; rings: Ring[]; label?: Pt }[],
  project: (lon: number, lat: number) => Pt,
  width: number,
  tolPx: number,
  minAreaPx: number,
) {
  const projected = items.map((it) => ({ ...it, rings: it.rings.map((r) => r.map(([x, y]) => project(x, y))) }));
  const b = bbox(projected.flatMap((p) => p.rings));
  const scale = width / (b[2] - b[0]);
  const height = Math.ceil((b[3] - b[1]) * scale);
  const tx = (p: Pt): Pt => [(p[0] - b[0]) * scale, (b[3] - p[1]) * scale];
  for (const p of projected) {
    p.rings = p.rings.map((r) => r.map(tx));
    if (p.label) p.label = tx(project(p.label[0], p.label[1]));
  }
  const all = projected.flatMap((p) => p.rings);
  const simplified = topoSimplify(all, tolPx);
  let i = 0;
  const features = projected.map((p) => {
    let rings = p.rings.map(() => simplified[i++]).filter((r) => r.length >= 3);
    const areas = rings.map((r) => Math.abs(ringArea(r)));
    const maxA = Math.max(0, ...areas);
    rings = rings.filter((_, k) => areas[k] >= minAreaPx || areas[k] === maxA);
    if (!rings.length) rings = p.rings.slice(0, 1); // entité minuscule : on garde la forme brute
    const signed = rings.map(ringArea);
    const main = rings[signed.map(Math.abs).indexOf(Math.max(...signed.map(Math.abs)))];
    // Surface nette (les trous ont une orientation opposée à celle des extérieurs).
    const sMain = Math.sign(ringArea(main)) || 1;
    const area = Math.max(Math.abs(ringArea(main)), signed.reduce((s, a) => s + a * sMain, 0));
    const c = p.label && p.label[0] >= 0 ? p.label : interiorPoint(main);
    return {
      id: p.id,
      d: pathD(rings),
      c: [round(c[0]), round(c[1])] as Pt,
      b: bbox(rings).map((v) => round(v)) as [number, number, number, number],
      a: round(area, 0),
    };
  });
  // Passage inverse (carte → projection) : sert à mesurer les distances en km (« Où est-ce ? »).
  return { w: width, h: height, features, proj: [round(b[0], 5), round(b[3], 5), round(scale, 5)] as [number, number, number], tx: (lon: number, lat: number) => tx(project(lon, lat)) };
}

/** Point dans un anneau (lon, lat) : règle pair-impair. */
function inRing([x, y]: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Surface en km² d'un ensemble d'anneaux lon/lat (les trous, orientés à l'inverse, se retranchent). */
function sphereArea(rings: Ring[]): number {
  const R = 6371;
  const rad = Math.PI / 180;
  let total = 0;
  for (const r of rings) {
    let s = 0;
    for (let i = 0; i < r.length; i++) {
      const [l1, p1] = r[i];
      const [l2, p2] = r[(i + 1) % r.length];
      s += (l2 - l1) * rad * (2 + Math.sin(p1 * rad) + Math.sin(p2 * rad));
    }
    total += (s * R * R) / 2;
  }
  return Math.abs(total);
}

/**
 * Notoriété d'un pays (pour la difficulté) : poids économique + population.
 * Les pays les plus connus (États-Unis, France, Japon, Brésil…) sortent en premier en « facile ».
 */
function fameOf(feats: any[]): number {
  const pop = feats.reduce((s, f) => s + Math.max(0, Number(prop(f, 'POP_EST')) || 0), 0);
  const gdp = feats.reduce((s, f) => s + Math.max(0, Number(prop(f, 'GDP_MD')) || 0), 0);
  if (!pop && !gdp) return 20 - Number(prop(feats[0], 'LABELRANK') ?? 10);
  return Math.round((Math.log10(gdp * 1e6 + 1) + 0.5 * Math.log10(pop + 1)) * 100) / 100;
}

// ---------------------------------------------------------------- pays
async function main() {
  await ensureRaw();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'regions'), { recursive: true });

  const admin0 = readJson(path.join(RAW, FILES.admin0)).features as any[];
  const cldr = cldrNames();
  const a3ToIso: Record<string, string> = {};
  const groups = new Map<string, any[]>();
  const dropped: string[] = [];

  for (const f of admin0) {
    const a3 = prop(f, 'ADM0_A3');
    if (DROP_A3.has(a3)) continue;
    const iso = MERGE_INTO[a3] ?? validIso(prop(f, 'ISO_A2_EH')) ?? validIso(prop(f, 'ISO_A2'));
    if (!iso || iso === 'AQ') { dropped.push(prop(f, 'NAME')); continue; }
    a3ToIso[a3] = iso;
    if (!groups.has(iso)) groups.set(iso, []);
    groups.get(iso)!.push(f);
  }
  for (const [from, to] of Object.entries(MERGE_INTO)) a3ToIso[from] = to;
  if (dropped.length) log(`Entités sans code ISO ignorées : ${dropped.join(', ')}`);

  const meta: Record<string, any> = {};
  const items: { id: string; rings: Ring[]; label?: Pt }[] = [];
  const edgeOwners = new Map<string, Set<string>>();
  const mainRingLL: Record<string, Ring> = {};

  for (const [iso, feats] of groups) {
    // L'entité « principale » porte les métadonnées (ex. MAR plutôt que SAH).
    const primary = feats.find((f) => !MERGE_INTO[prop(f, 'ADM0_A3')]) ?? feats[0];
    let rings = feats.flatMap((f) => ringsOf(f.geometry));
    if (feats.length > 1) rings = dissolve(rings);
    for (const e of edgeKeys(rings)) {
      if (!edgeOwners.has(e)) edgeOwners.set(e, new Set());
      edgeOwners.get(e)!.add(iso);
    }
    mainRingLL[iso] = rings.reduce((m, r) => (Math.abs(ringArea(r)) > Math.abs(ringArea(m)) ? r : m), rings[0]);
    const lx = prop(primary, 'LABEL_X');
    const ly = prop(primary, 'LABEL_Y');
    items.push({ id: iso, rings, label: typeof lx === 'number' ? [lx, ly] : undefined });
    const type = String(prop(primary, 'TYPE') ?? '');
    meta[iso] = {
      a3: prop(primary, 'ADM0_A3'),
      continent: slug(String(prop(primary, 'CONTINENT') ?? 'other')),
      subregion: slug(String(prop(primary, 'SUBREGION') ?? 'other')),
      rank: Number(prop(primary, 'LABELRANK') ?? 5),
      fame: fameOf(feats),
      pop: Math.round(feats.reduce((t, f) => t + Math.max(0, Number(prop(f, 'POP_EST')) || 0), 0)) || undefined,
      area: Math.round(sphereArea(rings)) || undefined,
      dependency: /dependency|lease/i.test(type),
      names: Object.fromEntries(LANGS.map((l) => [l, cldr[iso]?.[l] || namesFrom(primary, prop(primary, 'NAME'))[l]])),
      neighbors: [] as string[],
    };
  }
  for (const owners of edgeOwners.values()) {
    if (owners.size < 2) continue;
    for (const a of owners) for (const b of owners) if (a !== b && !meta[a].neighbors.includes(b)) meta[a].neighbors.push(b);
  }

  const world = buildFeatures(items, naturalEarth, 1000, 0.25, 0.04);
  log(`Carte du monde : ${world.features.length} pays, ${world.w}×${world.h}`);

  // ---------------------------------------------------------------- capitales
  const places = readJson(path.join(RAW, FILES.places)).features as any[];
  const capFeatures = new Map<string, any[]>();
  for (const f of places) {
    const cls = String(prop(f, 'FEATURECLA') ?? '');
    if (!/^Admin-0 capital/i.test(cls)) continue;
    const iso = a3ToIso[prop(f, 'ADM0_A3')] ?? a3ToIso[prop(f, 'SOV_A3')];
    if (!iso || !meta[iso]) continue;
    // Une capitale d'un territoire fusionné (ex. Laâyoune) n'est pas la capitale du pays.
    if (MERGE_INTO[prop(f, 'ADM0_A3')]) continue;
    if (!capFeatures.has(iso)) capFeatures.set(iso, []);
    capFeatures.get(iso)!.push(f);
  }
  const worldFeatureMap = Object.fromEntries(world.features.map((f) => [f.id, f]));
  for (const [iso, list] of capFeatures) {
    list.sort((a, b) => Number(/alt/i.test(prop(a, 'FEATURECLA'))) - Number(/alt/i.test(prop(b, 'FEATURECLA'))));
    const cap = list[0];
    const lon = Number(prop(cap, 'LONGITUDE') ?? cap.geometry.coordinates[0]);
    const lat = Number(prop(cap, 'LATITUDE') ?? cap.geometry.coordinates[1]);
    const xy = world.tx(lon, lat);
    meta[iso].capital = {
      names: namesFrom(cap, prop(cap, 'NAME')),
      alts: list.slice(1).map((f) => prop(f, 'NAME')).filter(Boolean),
    };
    (worldFeatureMap[iso] as any).k = [round(xy[0]), round(xy[1])];
  }
  log(`Capitales : ${capFeatures.size}`);

  fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify({ w: world.w, h: world.h, proj: world.proj, features: world.features }));

  // ---------------------------------------------------------------- régions
  const admin1 = readJson(path.join(RAW, FILES.admin1)).features as any[];
  const byCountry = new Map<string, any[]>();
  for (const f of admin1) {
    const iso = a3ToIso[prop(f, 'adm0_a3')] ?? validIso(prop(f, 'iso_a2'));
    if (!iso || !meta[iso]) continue;
    if (!byCountry.has(iso)) byCountry.set(iso, []);
    byCountry.get(iso)!.push(f);
  }

  let regionCount = 0;
  for (const [iso, feats] of byCountry) {
    // Écarte les subdivisions lointaines (outre-mer…).
    const mb = bbox([mainRingLL[iso]]);
    const span = Math.max(mb[2] - mb[0], mb[3] - mb[1], 1);
    let subs = feats
      .map((f) => ({ f, rings: ringsOf(f.geometry) }))
      .filter((s) => s.rings.length)
      .filter((s) => {
        const b = bbox(s.rings);
        const cx = (b[0] + b[2]) / 2;
        const cy = (b[1] + b[3]) / 2;
        const dx = Math.max(mb[0] - cx, 0, cx - mb[2]);
        const dy = Math.max(mb[1] - cy, 0, cy - mb[3]);
        return Math.hypot(dx, dy) <= span * REGION_MAX_DISTANCE_FACTOR || Math.abs(dx) > 180; // >180 : antiméridien
      });
    if (subs.length < 2) continue;

    // Antiméridien (Russie, Fidji, îles Aléoutiennes…).
    const lb = bbox(subs.flatMap((s) => s.rings));
    if (lb[2] - lb[0] > 180) for (const s of subs) s.rings = s.rings.map((r) => r.map(([x, y]) => [x < 0 ? x + 360 : x, y] as Pt));
    const lb2 = bbox(subs.flatMap((s) => s.rings));
    const proj = localProjection((lb2[1] + lb2[3]) / 2);

    subs.sort((a, b) => String(prop(a.f, 'name')).localeCompare(String(prop(b.f, 'name'))));
    const levels: Record<string, any> = {};

    const subItems = subs.map((s, i) => ({ id: `${iso}-${i + 1}`, rings: s.rings }));
    const subNames = Object.fromEntries(subs.map((s, i) => [`${iso}-${i + 1}`, namesFrom(s.f, prop(s.f, 'name'))]));

    // Regroupements : table officielle (config/regions.ts) ou champ « region » de Natural Earth.
    const cfg = REGION_GROUPS[iso];
    const groupOf = new Map<number, string>();
    const groupNames: Record<string, Names> = {};
    const unmatched: string[] = [];
    if (cfg) {
      subs.forEach((s, i) => {
        const n = norm([prop(s.f, 'name'), prop(s.f, 'name_en'), prop(s.f, 'name_fr'), prop(s.f, 'name_alt'), prop(s.f, 'region')].filter(Boolean).join(' '));
        const g = cfg.groups.findIndex((gr) => gr.tokens.some((t) => n.includes(` ${t} `)));
        if (g < 0) { unmatched.push(prop(s.f, 'name')); return; }
        const id = `${iso}-g${g + 1}`;
        groupOf.set(i, id);
        groupNames[id] = cfg.groups[g].names;
      });
    } else {
      const regs = new Set(subs.map((s) => String(prop(s.f, 'region') ?? '').trim()).filter(Boolean));
      if (regs.size >= 2 && regs.size < subs.length * 0.8) {
        const list = [...regs].sort();
        subs.forEach((s, i) => {
          const r = String(prop(s.f, 'region') ?? '').trim();
          if (!r) return;
          const id = `${iso}-g${list.indexOf(r) + 1}`;
          groupOf.set(i, id);
          const n = String(r);
          groupNames[id] = { fr: n, en: n, ar: n, es: n };
        });
      }
    }
    if (unmatched.length) log(`${iso} : subdivisions non rattachées à une région → gardées seules : ${unmatched.join(', ')}`);

    const groupIds = [...new Set(groupOf.values())];
    const hasGroups = groupIds.length >= 2 && groupIds.length < subs.length;
    const allSubsAreGroups = cfg && groupIds.length === subs.length; // NE fournit déjà les régions officielles

    const buildLevel = (its: { id: string; rings: Ring[] }[], names: Record<string, Names>) => {
      const m = buildFeatures(its, proj, 1000, 0.45, 0.6);
      const level: any = { w: m.w, h: m.h, features: m.features, names };
      // Villes à placer (Maroc) : position sur la carte, région, et échelle en km.
      if (iso === 'MA' && fs.existsSync(path.join(ROOT, 'data/games/macities.json'))) {
        const cities = readJson(path.join(ROOT, 'data/games/macities.json')) as { id: string; lat: number; lon: number }[];
        level.points = {};
        for (const c of cities) {
          const region = its.find((it) => it.rings.some((r) => inRing([c.lon, c.lat], r)))?.id;
          const [x, y] = m.tx(c.lon, c.lat);
          level.points[c.id] = [round(x), round(y), region ?? ''];
        }
        level.kmPerUnit = round(111.32 / m.proj[2], 4);
      }
      return level;
    };

    if (hasGroups || allSubsAreGroups) {
      const gItems: { id: string; rings: Ring[] }[] = [];
      for (const gid of groupIds) {
        const members = subs.filter((_, i) => groupOf.get(i) === gid);
        const rings = members.flatMap((m) => m.rings);
        gItems.push({ id: gid, rings: members.length > 1 ? dissolve(rings) : rings });
      }
      subs.forEach((s, i) => { if (!groupOf.has(i)) { gItems.push({ id: `${iso}-${i + 1}`, rings: s.rings }); groupNames[`${iso}-${i + 1}`] = subNames[`${iso}-${i + 1}`]; } });
      levels.groups = buildLevel(gItems, groupNames);
    }
    if (!allSubsAreGroups) levels.subs = buildLevel(subItems, subNames);

    fs.writeFileSync(path.join(OUT, 'regions', `${iso}.json`), JSON.stringify({ iso, levels }));
    meta[iso].regions = Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, [v.features.length, v.w, v.h]]));
    if (cfg) meta[iso].regionLabel = cfg.label;
    regionCount++;
    if (iso === 'MA') log(`Maroc : ${levels.groups?.features.length ?? 0} régions, ${levels.subs?.features.length ?? 0} provinces/préfectures`);
  }
  log(`Cartes de régions : ${regionCount} pays`);

  // Monnaies (CLDR) et données des jeux annexes.
  const currencies = readJson(path.join(ROOT, 'data/names/currencies.json'));
  for (const [iso, m] of Object.entries<any>(meta)) if (currencies[iso]) m.currency = currencies[iso];
  for (const f of fs.readdirSync(path.join(ROOT, 'data/games'))) fs.copyFileSync(path.join(ROOT, 'data/games', f), path.join(OUT, f));

  fs.writeFileSync(path.join(OUT, 'countries.json'), JSON.stringify(meta));

  // ---------------------------------------------------------------- drapeaux
  const flagDir = path.join(OUT, 'flags');
  fs.mkdirSync(flagDir, { recursive: true });
  const lib = path.join(ROOT, 'node_modules/flag-icons/flags/4x3');
  let flags = 0;
  for (const iso of Object.keys(meta)) {
    const src = path.join(lib, `${iso.toLowerCase()}.svg`);
    if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(flagDir, `${iso}.svg`)); flags++; }
    else if (DEMO) { fs.writeFileSync(path.join(flagDir, `${iso}.svg`), demoFlag(iso)); flags++; }
  }
  log(`Drapeaux : ${flags}${flags ? '' : ' (installez flag-icons : npm install)'}`);
  log('Terminé →', path.relative(ROOT, OUT));
}

/** Drapeau de substitution pour le monde de démo (3 bandes dérivées du code). */
function demoFlag(iso: string) {
  const h = (n: number) => `hsl(${(iso.charCodeAt(0) * 37 + iso.charCodeAt(1) * 11 + n * 120) % 360} 60% ${40 + n * 12}%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><rect width="640" height="480" fill="${h(0)}"/><rect width="640" height="160" y="160" fill="${h(1)}"/><rect width="640" height="160" y="320" fill="${h(2)}"/><text x="320" y="290" font-size="140" text-anchor="middle" fill="#fff" font-family="sans-serif">${iso}</text></svg>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
