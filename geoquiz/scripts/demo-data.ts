/**
 * Génère un petit « monde de démonstration » au format Natural Earth (data/raw-demo/),
 * pour lancer et tester le jeu sans télécharger les vraies données.
 * Les formes sont des tuiles schématiques ; les noms, capitales et codes sont réels.
 */
import fs from 'node:fs';
import path from 'node:path';

type P = [number, number];
const OUT = path.resolve(__dirname, '../data/raw-demo');

// Bord dentelé déterministe : identique vu des deux tuiles voisines.
function edge(a: P, b: P, n = 5): P[] {
  const flip = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const [p, q] = flip ? [b, a] : [a, b];
  const pts: P[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = p[0] + (q[0] - p[0]) * t;
    const y = p[1] + (q[1] - p[1]) * t;
    const j = Math.sin(x * 12.9898 + y * 78.233) * 0.6;
    pts.push(p[1] === q[1] ? [x, y + j] : [x + j, y]);
  }
  return flip ? pts.reverse() : pts;
}
function cell(x0: number, y0: number, x1: number, y1: number): P[] {
  const c: P[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const ring: P[] = [];
  for (let i = 0; i < 4; i++) {
    ring.push(c[i]);
    ring.push(...edge(c[i], c[(i + 1) % 4]));
  }
  ring.push(c[0]);
  return ring.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
}

const W = 12, H = 10, X0 = -30, Y0 = 60;
const at = (c: number, r: number) => cell(X0 + c * W, Y0 - r * H, X0 + (c + 1) * W, Y0 - (r + 1) * H);

// [a3, iso2, continent, subregion, labelrank, colonne, rangée, capitale FR/EN/AR/ES]
const C: [string, string, string, string, number, number, number, string[]][] = [
  ['IRL', 'IE', 'Europe', 'Northern Europe', 4, 0, 0, ['Dublin', 'Dublin', 'دبلن', 'Dublín']],
  ['BEL', 'BE', 'Europe', 'Western Europe', 4, 1, 0, ['Bruxelles', 'Brussels', 'بروكسل', 'Bruselas']],
  ['NLD', 'NL', 'Europe', 'Western Europe', 4, 2, 0, ['Amsterdam', 'Amsterdam', 'أمستردام', 'Ámsterdam']],
  ['DEU', 'DE', 'Europe', 'Western Europe', 2, 3, 0, ['Berlin', 'Berlin', 'برلين', 'Berlín']],
  ['POL', 'PL', 'Europe', 'Eastern Europe', 3, 4, 0, ['Varsovie', 'Warsaw', 'وارسو', 'Varsovia']],
  ['ROU', 'RO', 'Europe', 'Eastern Europe', 3, 5, 0, ['Bucarest', 'Bucharest', 'بوخارست', 'Bucarest']],
  ['CAN', 'CA', 'North America', 'Northern America', 2, 6, 0, ['Ottawa', 'Ottawa', 'أوتاوا', 'Ottawa']],
  ['JPN', 'JP', 'Asia', 'Eastern Asia', 2, 7, 0, ['Tokyo', 'Tokyo', 'طوكيو', 'Tokio']],
  ['PRT', 'PT', 'Europe', 'Southern Europe', 3, 0, 1, ['Lisbonne', 'Lisbon', 'لشبونة', 'Lisboa']],
  ['ESP', 'ES', 'Europe', 'Southern Europe', 2, 1, 1, ['Madrid', 'Madrid', 'مدريد', 'Madrid']],
  ['FRA', 'FR', 'Europe', 'Western Europe', 2, 2, 1, ['Paris', 'Paris', 'باريس', 'París']],
  ['LUX', 'LU', 'Europe', 'Western Europe', 6, 3, 1, ['Luxembourg', 'Luxembourg', 'لوكسمبورغ', 'Luxemburgo']],
  ['ITA', 'IT', 'Europe', 'Southern Europe', 2, 4, 1, ['Rome', 'Rome', 'روما', 'Roma']],
  ['USA', 'US', 'North America', 'Northern America', 2, 6, 1, ['Washington', 'Washington, D.C.', 'واشنطن', 'Washington D. C.']],
  ['CHN', 'CN', 'Asia', 'Eastern Asia', 2, 7, 1, ['Pékin', 'Beijing', 'بكين', 'Pekín']],
  ['MAR', 'MA', 'Africa', 'Northern Africa', 3, 0, 2, ['Rabat', 'Rabat', 'الرباط', 'Rabat']],
  ['DZA', 'DZ', 'Africa', 'Northern Africa', 3, 1, 2, ['Alger', 'Algiers', 'الجزائر', 'Argel']],
  ['TUN', 'TN', 'Africa', 'Northern Africa', 4, 2, 2, ['Tunis', 'Tunis', 'تونس', 'Túnez']],
  ['EGY', 'EG', 'Africa', 'Northern Africa', 2, 3, 2, ['Le Caire', 'Cairo', 'القاهرة', 'El Cairo']],
  ['IDN', 'ID', 'Asia', 'South-Eastern Asia', 2, 4, 2, ['Jakarta', 'Jakarta', 'جاكرتا', 'Yakarta']],
  ['MEX', 'MX', 'North America', 'Central America', 2, 6, 2, ['Mexico', 'Mexico City', 'مكسيكو', 'Ciudad de México']],
  ['AUS', 'AU', 'Oceania', 'Australia and New Zealand', 2, 7, 2, ['Canberra', 'Canberra', 'كانبرا', 'Canberra']],
  ['SAH', 'EH', 'Africa', 'Northern Africa', 7, 0, 3, ['Laâyoune', 'Laayoune', 'العيون', 'El Aaiún']],
  ['MLI', 'ML', 'Africa', 'Western Africa', 3, 1, 3, ['Bamako', 'Bamako', 'باماكو', 'Bamako']],
  ['NGA', 'NG', 'Africa', 'Western Africa', 2, 2, 3, ['Abuja', 'Abuja', 'أبوجا', 'Abuya']],
  ['TCD', 'TD', 'Africa', 'Middle Africa', 3, 3, 3, ['N’Djaména', "N'Djamena", 'نجامينا', 'Yamena']],
  ['BRA', 'BR', 'South America', 'South America', 2, 6, 3, ['Brasilia', 'Brasília', 'برازيليا', 'Brasilia']],
  ['NZL', 'NZ', 'Oceania', 'Australia and New Zealand', 3, 7, 3, ['Wellington', 'Wellington', 'ولينغتون', 'Wellington']],
  ['SEN', 'SN', 'Africa', 'Western Africa', 3, 0, 4, ['Dakar', 'Dakar', 'داكار', 'Dakar']],
  ['CIV', 'CI', 'Africa', 'Western Africa', 3, 1, 4, ['Yamoussoukro', 'Yamoussoukro', 'ياموسوكرو', 'Yamusukro']],
  ['ZAF', 'ZA', 'Africa', 'Southern Africa', 2, 2, 4, ['Pretoria', 'Pretoria', 'بريتوريا', 'Pretoria']],
  ['ARG', 'AR', 'South America', 'South America', 2, 6, 4, ['Buenos Aires', 'Buenos Aires', 'بوينس آيرس', 'Buenos Aires']],
];

const feats: any[] = [];
const places: any[] = [];
const center = (c: number, r: number): P => [X0 + c * W + W / 2, Y0 - r * H - H / 2];

for (const [a3, iso, cont, sub, rank, c, r, cap] of C) {
  let coords: any = [at(c, r)];
  if (iso === 'ZA') {
    // Enclave (comme le Lesotho) : trou dans l'Afrique du Sud.
    const [x, y] = center(c, r);
    coords = [at(c, r), cell(x - 2, y + 2, x + 2, y - 2).reverse()];
  }
  feats.push({
    type: 'Feature',
    properties: {
      ADM0_A3: a3, ISO_A2: a3 === 'FRA' ? '-99' : iso, ISO_A2_EH: iso, NAME: cap[1], TYPE: 'Sovereign country',
      CONTINENT: cont, SUBREGION: sub, LABELRANK: rank,
    },
    geometry: { type: 'Polygon', coordinates: coords },
  });
  places.push({
    type: 'Feature',
    properties: { FEATURECLA: 'Admin-0 capital', ADM0_A3: a3, NAME: cap[1], NAME_FR: cap[0], NAME_EN: cap[1], NAME_AR: cap[2], NAME_ES: cap[3] },
    geometry: { type: 'Point', coordinates: center(c, r) },
  });
}
// Lesotho dans le trou de l'Afrique du Sud, Monaco minuscule et isolé.
{
  const [x, y] = center(2, 4);
  feats.push({ type: 'Feature', properties: { ADM0_A3: 'LSO', ISO_A2_EH: 'LS', NAME: 'Lesotho', CONTINENT: 'Africa', SUBREGION: 'Southern Africa', LABELRANK: 5 },
    geometry: { type: 'Polygon', coordinates: [cell(x - 2, y + 2, x + 2, y - 2)] } });
  places.push({ type: 'Feature', properties: { FEATURECLA: 'Admin-0 capital', ADM0_A3: 'LSO', NAME: 'Maseru', NAME_FR: 'Maseru', NAME_AR: 'ماسيرو', NAME_ES: 'Maseru' }, geometry: { type: 'Point', coordinates: [x, y] } });
  places.push({ type: 'Feature', properties: { FEATURECLA: 'Admin-0 capital alt', ADM0_A3: 'ZAF', NAME: 'Cape Town', NAME_FR: 'Le Cap', NAME_AR: 'كيب تاون', NAME_ES: 'Ciudad del Cabo' }, geometry: { type: 'Point', coordinates: [x - 4, y - 3] } });
  feats.push({ type: 'Feature', properties: { ADM0_A3: 'MCO', ISO_A2_EH: 'MC', NAME: 'Monaco', CONTINENT: 'Europe', SUBREGION: 'Western Europe', LABELRANK: 8 },
    geometry: { type: 'Polygon', coordinates: [[[35, 46], [35.3, 46], [35.3, 45.7], [35, 45.7], [35, 46]]] } });
  places.push({ type: 'Feature', properties: { FEATURECLA: 'Admin-0 capital', ADM0_A3: 'MCO', NAME: 'Monaco', NAME_FR: 'Monaco', NAME_AR: 'موناكو', NAME_ES: 'Mónaco' }, geometry: { type: 'Point', coordinates: [35.15, 45.85] } });
}

// Subdivisions (admin-1).
const admin1: any[] = [];
function subdivide(c: number, r: number, cols: number, rows: number, a3: string, list: Record<string, string>[]) {
  const x0 = X0 + c * W, y0 = Y0 - r * H;
  let k = 0;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const p = list[k++];
      if (!p) continue;
      admin1.push({
        type: 'Feature',
        properties: { adm0_a3: a3, ...p },
        geometry: { type: 'Polygon', coordinates: [cell(x0 + (i * W) / cols, y0 - (j * H) / rows, x0 + ((i + 1) * W) / cols, y0 - ((j + 1) * H) / rows)] },
      });
    }
}
subdivide(0, 2, 2, 3, 'MAR', [
  { name: 'Tanger-Assilah', name_ar: 'طنجة أصيلة' },
  { name: 'Fès', name_ar: 'فاس' },
  { name: 'Casablanca', name_ar: 'الدار البيضاء' },
  { name: 'Settat', name_ar: 'سطات' },
  { name: 'Agadir-Ida ou Tanane', name_ar: 'أكادير إداوتنان' },
  { name: 'Tiznit', name_ar: 'تيزنيت' },
]);
subdivide(0, 3, 1, 2, 'SAH', [
  { name: 'Laâyoune', name_ar: 'العيون' },
  { name: 'Oued Ed-Dahab', name_ar: 'وادي الذهب' },
]);
subdivide(2, 1, 2, 2, 'FRA', [
  { name: 'Paris', name_fr: 'Paris', name_ar: 'باريس', region: 'Île-de-France' },
  { name: 'Yvelines', name_fr: 'Yvelines', name_ar: 'إيفلين', region: 'Île-de-France' },
  { name: 'Gironde', name_fr: 'Gironde', name_ar: 'جيروند', region: 'Nouvelle-Aquitaine' },
  { name: 'Landes', name_fr: 'Landes', name_ar: 'لاند', region: 'Nouvelle-Aquitaine' },
]);
subdivide(6, 1, 3, 1, 'USA', [
  { name: 'California', name_fr: 'Californie', name_ar: 'كاليفورنيا', name_es: 'California' },
  { name: 'Texas', name_fr: 'Texas', name_ar: 'تكساس', name_es: 'Texas' },
  { name: 'Florida', name_fr: 'Floride', name_ar: 'فلوريدا', name_es: 'Florida' },
]);

fs.mkdirSync(OUT, { recursive: true });
const fc = (features: any[]) => JSON.stringify({ type: 'FeatureCollection', features });
fs.writeFileSync(path.join(OUT, 'ne_50m_admin_0_countries.geojson'), fc(feats));
fs.writeFileSync(path.join(OUT, 'ne_10m_admin_1_states_provinces.geojson'), fc(admin1));
fs.writeFileSync(path.join(OUT, 'ne_50m_populated_places.geojson'), fc(places));
console.log(`• Monde de démo : ${feats.length} pays, ${admin1.length} subdivisions → data/raw-demo`);
