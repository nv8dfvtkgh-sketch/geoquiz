// Points communs entre pays (« critères ») pour les jeux Connexions, L'intrus et Champ de mines.
// Chaque critère dit, pour un pays : oui, non, ou « on ne sait pas » (null : cas limite, jamais
// utilisé dans une grille pour éviter les réponses discutables).
import type { Lang, Names } from '../shared/protocol';
import { letters, nameOf, type GeoCountry } from './geo';

export interface Crit {
  id: string;
  kind: 'cont' | 'sub' | 'land' | 'island' | 'nb' | 'cur' | 'lang' | 'pop' | 'area' | 'letter' | 'capletter';
  level: 1 | 2 | 3; // 1 facile, 3 difficile
  label: Names; // « point commun » : en Afrique, sans accès à la mer…
  has: (c: GeoCountry) => boolean | null;
}

const N = (fr: string, en: string, es: string, ar: string): Names => ({ fr, en, es, ar });

const CONTINENTS: [string, Names][] = [
  ['africa', N('en Afrique', 'in Africa', 'en África', 'في إفريقيا')],
  ['asia', N('en Asie', 'in Asia', 'en Asia', 'في آسيا')],
  ['europe', N('en Europe', 'in Europe', 'en Europa', 'في أوروبا')],
  ['north-america', N('en Amérique du Nord, centrale ou aux Caraïbes', 'in North or Central America or the Caribbean', 'en América del Norte, Central o el Caribe', 'في أمريكا الشمالية أو الوسطى أو الكاريبي')],
  ['south-america', N('en Amérique du Sud', 'in South America', 'en América del Sur', 'في أمريكا الجنوبية')],
  ['oceania', N('en Océanie', 'in Oceania', 'en Oceanía', 'في أوقيانوسيا')],
];
const SUBS: [string, Names][] = [
  ['northern-africa', N("en Afrique du Nord", 'in North Africa', 'en el norte de África', 'في شمال إفريقيا')],
  ['western-africa', N("en Afrique de l'Ouest", 'in West Africa', 'en África occidental', 'في غرب إفريقيا')],
  ['eastern-africa', N("en Afrique de l'Est", 'in East Africa', 'en África oriental', 'في شرق إفريقيا')],
  ['middle-africa', N('en Afrique centrale', 'in Central Africa', 'en África central', 'في وسط إفريقيا')],
  ['southern-africa', N('en Afrique australe', 'in Southern Africa', 'en África austral', 'في جنوب القارة الإفريقية')],
  ['western-asia', N("au Moyen-Orient (Asie de l'Ouest)", 'in the Middle East (Western Asia)', 'en Oriente Medio (Asia occidental)', 'في الشرق الأوسط (غرب آسيا)')],
  ['central-asia', N('en Asie centrale', 'in Central Asia', 'en Asia central', 'في آسيا الوسطى')],
  ['southern-asia', N('en Asie du Sud', 'in South Asia', 'en Asia del Sur', 'في جنوب آسيا')],
  ['eastern-asia', N("en Asie de l'Est", 'in East Asia', 'en Asia oriental', 'في شرق آسيا')],
  ['south-eastern-asia', N('en Asie du Sud-Est', 'in South-East Asia', 'en el Sudeste Asiático', 'في جنوب شرق آسيا')],
  ['northern-europe', N("en Europe du Nord", 'in Northern Europe', 'en el norte de Europa', 'في شمال أوروبا')],
  ['western-europe', N("en Europe de l'Ouest", 'in Western Europe', 'en Europa occidental', 'في غرب أوروبا')],
  ['eastern-europe', N("en Europe de l'Est", 'in Eastern Europe', 'en Europa del Este', 'في شرق أوروبا')],
  ['southern-europe', N('en Europe du Sud', 'in Southern Europe', 'en el sur de Europa', 'في جنوب أوروبا')],
  ['central-america', N('en Amérique centrale', 'in Central America', 'en América Central', 'في أمريكا الوسطى')],
  ['caribbean', N('dans les Caraïbes', 'in the Caribbean', 'en el Caribe', 'في الكاريبي')],
];
/** Classement ONU surprenant pour beaucoup (Mexique « en Amérique centrale », Zambie « en Afrique de l'Est »,
 *  Géorgie « au Moyen-Orient »…) : jamais utilisés pour les sous-régions. */
const SUB_UNSURE = new Set('MX ZM ZW MW MZ MG SD MR GE AM AZ CY SS'.split(' '));
/** Pays sans accès à la mer (liste habituelle, mer Caspienne comprise). */
const LANDLOCKED = new Set('AF AD AM AT AZ BY BT BO BW BF BI CF TD CZ SZ ET HU KZ KG LA LS LI LU MW ML MD MN NP NE MK PY RW SM RS SK SS CH TJ TM UG UZ VA ZM ZW'.split(' '));
/** Grands pays voisins : « a une frontière avec… » (France : seulement la métropole). */
const HUBS: [string, Names, string[]?][] = [
  ['FR', N('voisins de la France', 'neighbours of France', 'vecinos de Francia', 'جيران فرنسا'), ['BR', 'SR']],
  ['DE', N("voisins de l'Allemagne", 'neighbours of Germany', 'vecinos de Alemania', 'جيران ألمانيا')],
  ['CN', N('voisins de la Chine', 'neighbours of China', 'vecinos de China', 'جيران الصين')],
  ['RU', N('voisins de la Russie', 'neighbours of Russia', 'vecinos de Rusia', 'جيران روسيا')],
  ['BR', N('voisins du Brésil', 'neighbours of Brazil', 'vecinos de Brasil', 'جيران البرازيل'), ['FR']],
  ['CD', N('voisins de la RD Congo', 'neighbours of the DR Congo', 'vecinos de la RD del Congo', 'جيران الكونغو الديمقراطية')],
  ['TZ', N('voisins de la Tanzanie', 'neighbours of Tanzania', 'vecinos de Tanzania', 'جيران تنزانيا')],
  ['AT', N("voisins de l'Autriche", 'neighbours of Austria', 'vecinos de Austria', 'جيران النمسا')],
  ['TR', N('voisins de la Turquie', 'neighbours of Turkey', 'vecinos de Turquía', 'جيران تركيا')],
  ['SA', N("voisins de l'Arabie saoudite", 'neighbours of Saudi Arabia', 'vecinos de Arabia Saudí', 'جيران السعودية')],
  ['IN', N("voisins de l'Inde", 'neighbours of India', 'vecinos de la India', 'جيران الهند')],
  ['ZA', N("voisins de l'Afrique du Sud", 'neighbours of South Africa', 'vecinos de Sudáfrica', 'جيران جنوب إفريقيا')],
];
const CUR: [string, string[], Names][] = [
  ['eur', ['EUR'], N("monnaie : l'euro", 'currency: the euro', 'moneda: el euro', 'العملة: اليورو')],
  ['cfa', ['XOF', 'XAF'], N('monnaie : le franc CFA', 'currency: the CFA franc', 'moneda: el franco CFA', 'العملة: الفرنك الإفريقي (CFA)')],
  ['usd', ['USD'], N('monnaie : le dollar américain', 'currency: the US dollar', 'moneda: el dólar estadounidense', 'العملة: الدولار الأمريكي')],
];
// Langue officielle. Cas discutables (statut changé récemment) : « on ne sait pas ».
const LANGS: [string, string, string, Names][] = [
  ['ar', 'DZ BH KM DJ EG IQ JO KW LB LY MR MA OM PS QA SA SO SD SY TN AE YE TD', 'IL ER',
    N("l'arabe est langue officielle", 'Arabic is an official language', 'el árabe es lengua oficial', 'العربية لغة رسمية')],
  ['es', 'ES MX GT HN SV NI CR PA CU DO CO VE EC PE BO PY CL AR UY GQ', '',
    N("l'espagnol est langue officielle", 'Spanish is an official language', 'el español es lengua oficial', 'الإسبانية لغة رسمية')],
  ['pt', 'PT BR AO MZ GW CV ST TL GQ', '',
    N('le portugais est langue officielle', 'Portuguese is an official language', 'el portugués es lengua oficial', 'البرتغالية لغة رسمية')],
  ['fr', 'FR BE CH LU MC CA HT SN CI TD CF CG CD GA CM GN BJ TG MG KM DJ RW BI SC VU GQ', 'ML BF NE',
    N('le français est langue officielle', 'French is an official language', 'el francés es lengua oficial', 'الفرنسية لغة رسمية')],
];
const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

/** Tous les critères. `lang` : pour les critères de lettres (le nom dépend de la langue). */
export function criteria(lang: Lang, withLetters = false, geo: GeoCountry[] = []): Crit[] {
  const out: Crit[] = [];
  for (const [k, label] of CONTINENTS) out.push({ id: `cont:${k}`, kind: 'cont', level: 1, label, has: (c) => c.co === k });
  for (const [k, label] of SUBS) out.push({ id: `sub:${k}`, kind: 'sub', level: 2, label, has: (c) => (c.sub && !SUB_UNSURE.has(c.id) ? c.sub === k : null) });
  out.push({ id: 'land', kind: 'land', level: 2, label: N("sans accès à la mer", 'landlocked', 'sin salida al mar', 'بلا منفذ على البحر'), has: (c) => LANDLOCKED.has(c.id) });
  out.push({ id: 'island', kind: 'island', level: 2, label: N('aucune frontière terrestre', 'no land border', 'sin fronteras terrestres', 'بلا حدود برية'), has: (c) => c.nb.length === 0 });
  for (const [hub, label, skip] of HUBS) {
    out.push({ id: `nb:${hub}`, kind: 'nb', level: 2, label, has: (c) => c.id !== hub && c.nb.includes(hub) && !(hub === 'FR' && skip?.includes(c.id)) && !(hub === 'BR' && c.id === 'FR') });
  }
  for (const [k, codes, label] of CUR) out.push({ id: `cur:${k}`, kind: 'cur', level: 2, label, has: (c) => (c.cur ? codes.includes(c.cur) : null) });
  for (const [k, yes, maybe, label] of LANGS) {
    const y = new Set(yes.split(' ')), m = new Set(maybe.split(' ').filter(Boolean));
    out.push({ id: `lang:${k}`, kind: 'lang', level: 2, label, has: (c) => (m.has(c.id) ? null : y.has(c.id)) });
  }
  out.push({ id: 'pop100', kind: 'pop', level: 3, label: N("plus de 100 millions d'habitants", 'over 100 million people', 'más de 100 millones de habitantes', 'أكثر من 100 مليون نسمة'),
    has: (c) => (!c.pop || between(c.pop, 88e6, 115e6) ? null : c.pop > 100e6) });
  out.push({ id: 'area2m', kind: 'area', level: 3, label: N('plus de 2 millions de km²', 'over 2 million km²', 'más de 2 millones de km²', 'أكثر من 2 مليون كم²'),
    has: (c) => (!c.area || between(c.area, 1.75e6, 2.3e6) ? null : c.area > 2e6) });
  if (withLetters) {
    const first = (s: string) => letters(s)[0] ?? '';
    const count = new Map<string, number>();
    for (const c of geo) { const f = first(nameOf(c.n, lang)); count.set(f, (count.get(f) ?? 0) + 1); }
    for (const [L, n] of count) {
      if (n < 5 || !L) continue;
      out.push({ id: `letter:${L}`, kind: 'letter', level: 1, label: N(`nom qui commence par « ${L} »`, `name starts with “${L}”`, `nombre que empieza por «${L}»`, `اسمه يبدأ بـ«${L}»`), has: (c) => first(nameOf(c.n, lang)) === L });
    }
    const capCount = new Map<string, number>();
    for (const c of geo) if (c.cap) { const f = first(nameOf(c.cap, lang)); capCount.set(f, (capCount.get(f) ?? 0) + 1); }
    for (const [L, n] of capCount) {
      if (n < 5 || !L) continue;
      out.push({ id: `capletter:${L}`, kind: 'capletter', level: 2, label: N(`capitale qui commence par « ${L} »`, `capital starts with “${L}”`, `capital que empieza por «${L}»`, `عاصمته تبدأ بـ«${L}»`), has: (c) => (c.cap ? first(nameOf(c.cap, lang)) === L : null) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- hasard reproductible
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffled<T>(a: T[], rnd: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
const pickN = <T,>(a: T[], n: number, rnd: () => number) => shuffled(a, rnd).slice(0, n);

// ---------------------------------------------------------------- Connexions 4×4
export interface ConnexGroup { crit: Crit; ids: string[] }
/** Quatre groupes de quatre pays : chaque pays a le point commun de son groupe et aucun des trois autres. */
export function makeConnex(pool: GeoCountry[], crits: Crit[], rnd: () => number): ConnexGroup[] | null {
  const usable = crits.filter((c) => c.kind !== 'letter' && c.kind !== 'capletter');
  for (let tries = 0; tries < 400; tries++) {
    const four: Crit[] = [];
    for (const c of shuffled(usable, rnd)) {
      // Au plus un critère de chaque sorte (pas quatre continents), sauf voisins et sous-régions (deux).
      const same = four.filter((x) => x.kind === c.kind).length;
      if (same >= ((c.kind === 'nb' || c.kind === 'sub') ? 2 : 1)) continue;
      if (c.kind === 'cont' && four.some((x) => x.kind === 'sub')) continue;
      if (c.kind === 'sub' && four.some((x) => x.kind === 'cont')) continue;
      four.push(c);
      if (four.length === 4) break;
    }
    if (four.length < 4) continue;
    const groups: ConnexGroup[] = [];
    for (const c of four) {
      const ok = pool.filter((p) => c.has(p) === true && four.every((o) => o === c || o.has(p) === false));
      if (ok.length < 4) break;
      groups.push({ crit: c, ids: pickN(ok, 4, rnd).map((p) => p.id) });
    }
    if (groups.length === 4) return groups.sort((a, b) => a.crit.level - b.crit.level);
  }
  return null;
}

// ---------------------------------------------------------------- L'intrus
export interface Intrus { crit: Crit; ids: string[]; odd: string }
/** Trois pays qui partagent un point commun et un intrus ; aucun autre critère ne désigne un autre intrus. */
export function makeIntrus(pool: GeoCountry[], crits: Crit[], rnd: () => number): Intrus | null {
  const usable = crits.filter((c) => c.kind !== 'letter' && c.kind !== 'capletter');
  for (let tries = 0; tries < 300; tries++) {
    const crit = usable[Math.floor(rnd() * usable.length)];
    const yes = pool.filter((p) => crit.has(p) === true);
    const no = pool.filter((p) => crit.has(p) === false);
    if (yes.length < 3 || !no.length) continue;
    const three = pickN(yes, 3, rnd);
    // L'intrus vient de préférence du même continent : sinon c'est trop facile.
    const near = no.filter((p) => three.some((t) => t.co === p.co));
    const from = near.length && rnd() < 0.8 ? near : no;
    const odd = from[Math.floor(rnd() * from.length)];
    const four = [...three, odd];
    let clean = true;
    for (const c of usable) {
      if (c === crit) continue;
      const v = four.map((p) => c.has(p));
      if (v.includes(null)) continue;
      const t = v.filter(Boolean).length;
      // Un autre pays serait aussi un intrus : l'un des trois n'a pas ce point commun (que l'intrus a),
      // ou l'un des trois est le seul à l'avoir.
      if ((t === 3 && v[3]) || (t === 1 && !v[3])) { clean = false; break; }
    }
    if (!clean) continue;
    return { crit, ids: shuffled(four, rnd).map((p) => p.id), odd: odd.id };
  }
  return null;
}

// ---------------------------------------------------------------- Champ de mines
export interface Mines { crit: Crit; ids: string[]; good: string[] }
/** Une grille de 16 pays dont 4 à 7 ont le point commun demandé. */
export function makeMines(pool: GeoCountry[], crits: Crit[], rnd: () => number): Mines | null {
  for (let tries = 0; tries < 300; tries++) {
    const crit = crits[Math.floor(rnd() * crits.length)];
    const yes = pool.filter((p) => crit.has(p) === true);
    const no = pool.filter((p) => crit.has(p) === false);
    const k = 4 + Math.floor(rnd() * 4);
    if (yes.length < k || no.length < 16 - k) continue;
    const good = pickN(yes, k, rnd);
    // Pièges : d'abord des pays proches (même continent) que les bons.
    const near = shuffled(no.filter((p) => good.some((g) => g.co === p.co)), rnd);
    const bad = [...near, ...shuffled(no, rnd)].filter((p, i, a) => a.indexOf(p) === i).slice(0, 16 - k);
    return { crit, ids: shuffled([...good, ...bad], rnd).map((p) => p.id), good: good.map((p) => p.id) };
  }
  return null;
}
