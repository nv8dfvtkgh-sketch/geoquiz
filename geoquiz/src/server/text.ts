// Comparaison tolérante des réponses tapées : accents, casse, ponctuation, articles,
// variantes de l'écriture arabe et petites fautes de frappe.

const ARTICLES = new Set(['le', 'la', 'les', 'l', 'the', 'el', 'los', 'las', 'de', 'du', 'des', 'of', 'd', 'republique', 'republic', 'republica']);

export function normalize(s: string): string {
  let t = s.normalize('NFKD').toLowerCase();
  // Arabe : tachkil, tatweel, formes de alif/hamza, tā' marbūṭa, alif maqṣūra.
  t = t
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
  t = t.replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[œ]/g, 'oe').replace(/[æ]/g, 'ae');
  t = t.replace(/['’`´]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const words = t.split(' ').filter((w) => w && !ARTICLES.has(w));
  // Article arabe « ال » collé au mot.
  return words.map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w)).join(' ');
}

/** Distance de Damerau-Levenshtein (transpositions comptées comme une seule faute). */
export function distance(a: string, b: string): number {
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => [i, ...new Array(m).fill(0)]);
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[n][m];
}

/** Fautes d'orthographe tolérées : une pour les noms courts, deux au-delà de 4 lettres. */
export function tolerance(len: number): number {
  return len <= 4 ? 1 : 2;
}

const compact = (s: string) => normalize(s).replace(/ /g, '');

/** Plus petite distance entre la saisie et une liste de noms. */
function closest(input: string, names: Iterable<string>): number {
  let best = Infinity;
  for (const n of names) {
    const c = n.replace(/ /g, '');
    if (!c) continue;
    const d = input === c ? 0 : distance(input, c);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

/**
 * Réponse tapée acceptée si elle est à une ou deux fautes près d'un nom attendu (selon sa
 * longueur) ET plus proche de ce nom que de tout autre lieu de la même catégorie :
 * « Marok » → Maroc, mais « Niger » n'est pas accepté pour « Nigeria », ni « Iran » pour « Irak ».
 * `others` : noms normalisés de tous les lieux de la catégorie (ceux attendus compris).
 */
export function matches(input: string, accepted: string[], others: Iterable<string> = []): boolean {
  const a = compact(input);
  if (!a) return false;
  const acc = accepted.map(compact).filter(Boolean);
  const accSet = new Set(acc);
  let best = Infinity;
  let bestLen = 0;
  for (const c of acc) {
    const d = a === c ? 0 : distance(a, c);
    if (d < best) { best = d; bestLen = c.length; }
  }
  if (best === 0) return true;
  if (best > tolerance(bestLen)) return false;
  const rivals = [...others].map((o) => o.replace(/ /g, '')).filter((o) => o && !accSet.has(o));
  return best < closest(a, rivals);
}
