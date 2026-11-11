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

/** Fautes tolérées selon la longueur du mot attendu. */
export function tolerance(len: number): number {
  return len <= 3 ? 0 : len <= 6 ? 1 : len <= 12 ? 2 : 3;
}

export function matches(input: string, accepted: string[]): boolean {
  const a = normalize(input);
  if (!a) return false;
  const compact = a.replace(/ /g, '');
  return accepted.some((cand) => {
    const b = normalize(cand);
    if (!b) return false;
    if (a === b) return true;
    const bc = b.replace(/ /g, '');
    return distance(compact, bc) <= tolerance(bc.length);
  });
}
