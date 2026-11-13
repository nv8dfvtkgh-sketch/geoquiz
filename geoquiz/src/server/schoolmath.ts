// Révisions de maths : questions fabriquées au hasard, adaptées à chaque classe
// (CP → Terminale, Kindergarten → Grade 12). Une graine donne toujours la même question.

type L = 'fr' | 'en';
type R = () => number;
/** [énoncé, bonne réponse, piège, piège, piège] */
export type Gen = (r: R, l: L) => string[];

const ri = (r: R, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T>(r: R, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const tr = (l: L, fr: string, en: string) => (l === 'fr' ? fr : en);
/** Nombre écrit à la française (virgule, espace fine) ou à l'américaine. */
export function num(x: number, l: L): string {
  const v = Math.round(x * 1e6) / 1e6;
  const s = Math.abs(v) >= 10000 ? v.toLocaleString(l === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 6 }) : String(v);
  return (l === 'fr' ? s.replace('.', ',') : s).replace(/^-/, '−');
}
/** Pièges numériques plausibles autour de la bonne réponse. */
function near(r: R, ok: number, l: L, cands: number[] = [], allowNeg = ok < 0): string[] {
  const out = new Set<string>();
  const okS = num(ok, l);
  const step = Number.isInteger(ok) ? 1 : Math.pow(10, -Math.min(3, (String(ok).split('.')[1] ?? '').length));
  const pool = [...cands, ok + step, ok - step, ok + 2 * step, ok - 2 * step, ok + 10 * step, ok - 10 * step, ok * 2, ok + 3 * step];
  for (const c of pool) {
    if (out.size >= 3) break;
    if (!Number.isFinite(c) || (!allowNeg && c < 0)) continue;
    const s = num(c, l);
    if (s !== okS) out.add(s);
  }
  for (let i = 1; out.size < 3; i++) { const s = num(ok + (i + 3) * step * (r() < 0.5 ? 1 : -1) * (allowNeg || ok - (i + 3) * step >= 0 ? 1 : -1), l); if (s !== okS) out.add(s); }
  return [...out].slice(0, 3);
}
const q = (text: string, ok: number, r: R, l: L, cands: number[] = []) => [text, num(ok, l), ...near(r, ok, l, cands)];
/** Pièges écrits à la main : on garde les trois premiers différents de la bonne réponse. */
function strs(text: string, ok: string, bad: string[]): string[] {
  const b = [...new Set(bad.filter((x) => x !== ok))].slice(0, 3);
  while (b.length < 3) b.push(`${ok} ?`);
  return [text, ok, ...b];
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (n: number, d: number) => { const g = gcd(n, d) || 1; const s = d / g < 0 ? -1 : 1; return d / g === s ? String((s * n) / g) : `${(s * n) / g}/${(s * d) / g}`; };
const signed = (x: number) => (x < 0 ? `− ${-x}` : `+ ${x}`);
const EMOJI = ['🍎', '⭐', '🐟', '🌸', '⚽', '🚗', '🐞', '🍓', '🎈', '🐤'];

const G: Gen[][] = [];
// ---- Kindergarten
G[0] = [
  (r, l) => { const n = ri(r, 2, 10), e = pick(r, EMOJI); return q(tr(l, `Combien y a-t-il de ${e} ?  ${e.repeat(n)}`, `How many ${e}?  ${e.repeat(n)}`), n, r, l); },
  (r, l) => { const a = ri(r, 0, 5), b = ri(r, 0, 5); return q(`${a} + ${b} = ?`, a + b, r, l); },
  (r, l) => { const a = ri(r, 3, 10), b = ri(r, 0, a); return q(`${a} − ${b} = ?`, a - b, r, l); },
  (r, l) => { const n = ri(r, 1, 19); return q(tr(l, `Quel nombre vient juste après ${n} ?`, `What number comes right after ${n}?`), n + 1, r, l, [n - 1, n + 2]); },
  (r, l) => { const xs = new Set<number>(); while (xs.size < 4) xs.add(ri(r, 0, 20)); const v = [...xs]; const m = Math.max(...v); return [tr(l, 'Quel est le plus grand nombre ?', 'Which number is the greatest?'), String(m), ...v.filter((x) => x !== m).map(String)]; },
  (r, l) => { const n = ri(r, 1, 9); return q(tr(l, `Combien faut-il ajouter à ${n} pour faire 10 ?`, `How many more to make 10 from ${n}?`), 10 - n, r, l); },
];
// ---- CP / Grade 1
G[1] = [
  (r, l) => { const a = ri(r, 2, 15), b = ri(r, 1, 20 - a); return q(`${a} + ${b} = ?`, a + b, r, l, [a + b + 10]); },
  (r, l) => { const a = ri(r, 8, 20), b = ri(r, 1, a); return q(`${a} − ${b} = ?`, a - b, r, l, [a + b]); },
  (r, l) => { const n = ri(r, 11, 99); return q(tr(l, `Combien y a-t-il de dizaines dans ${n} ?`, `How many tens are in ${n}?`), Math.floor(n / 10), r, l, [n % 10]); },
  (r, l) => { const a = ri(r, 2, 12), s = ri(r, a + 1, 20); return q(`${a} + ? = ${s}`, s - a, r, l, [s + a]); },
  (r, l) => { const n = ri(r, 2, 10); return q(tr(l, `Quel est le double de ${n} ?`, `What is double ${n}?`), 2 * n, r, l, [n + 2]); },
  (r, l) => { const xs = new Set<number>(); while (xs.size < 4) xs.add(ri(r, 10, 99)); const v = [...xs]; const m = Math.min(...v); return [tr(l, 'Quel est le plus petit nombre ?', 'Which number is the smallest?'), String(m), ...v.filter((x) => x !== m).map(String)]; },
  (r, l) => { const d = ri(r, 1, 9), u = ri(r, 0, 9); return q(tr(l, `${d} dizaines et ${u} unités, c'est…`, `${d} tens and ${u} ones make…`), d * 10 + u, r, l, [u * 10 + d, d + u]); },
];
// ---- CE1 / Grade 2
G[2] = [
  (r, l) => { const a = ri(r, 15, 70), b = ri(r, 12, 99 - a); return q(`${a} + ${b} = ?`, a + b, r, l, [a + b - 10]); },
  (r, l) => { const a = ri(r, 40, 99), b = ri(r, 11, a - 5); return q(`${a} − ${b} = ?`, a - b, r, l, [a - b + 10]); },
  (r, l) => { const a = pick(r, [2, 3, 4, 5, 10]), b = ri(r, 1, 10); return q(`${a} × ${b} = ?`, a * b, r, l, [a + b, a * (b + 1)]); },
  (r, l) => { const st = pick(r, [2, 5, 10, 100]), s = st * ri(r, 0, 5); return q(`${s}, ${s + st}, ${s + 2 * st}, ?, ${s + 4 * st}`, s + 3 * st, r, l, [s + 3 * st + 1, s + 5 * st]); },
  (r, l) => { const n = ri(r, 101, 999); return q(tr(l, `Quel est le chiffre des centaines de ${n} ?`, `What digit is in the hundreds place of ${n}?`), Math.floor(n / 100), r, l, [n % 10, Math.floor(n / 10) % 10]); },
  (r, l) => { const n = 2 * ri(r, 3, 25); return q(tr(l, `Quelle est la moitié de ${n} ?`, `What is half of ${n}?`), n / 2, r, l, [n * 2]); },
  (r, l) => { const h = ri(r, 1, 3), m = pick(r, [0, 15, 30, 45]); return q(tr(l, `Combien de minutes dans ${h} h${m ? ' ' + m : ''} ?`, `How many minutes are in ${h} h${m ? ' ' + m + ' min' : ''}?`), h * 60 + m, r, l, [h * 100 + m, h * 60 + m + 10]); },
];
// ---- CE2 / Grade 3
G[3] = [
  (r, l) => { const a = ri(r, 2, 10), b = ri(r, 2, 10); return q(`${a} × ${b} = ?`, a * b, r, l, [a * b + a, a * b - b, a + b]); },
  (r, l) => { const a = ri(r, 2, 10), b = ri(r, 2, 10); return q(`${a * b} ÷ ${a} = ?`, b, r, l, [a]); },
  (r, l) => { const a = ri(r, 120, 700), b = ri(r, 101, 999 - a); return q(`${a} + ${b} = ?`, a + b, r, l, [a + b + 100]); },
  (r, l) => { const a = ri(r, 300, 999), b = ri(r, 101, a - 50); return q(`${a} − ${b} = ?`, a - b, r, l, [a - b + 10]); },
  (r, l) => { const n = ri(r, 101, 989), to = pick(r, [10, 100]); const ok = Math.round(n / to) * to; return q(tr(l, `Arrondis ${n} à la ${to === 10 ? 'dizaine' : 'centaine'} la plus proche.`, `Round ${n} to the nearest ${to === 10 ? 'ten' : 'hundred'}.`), ok, r, l, [ok + to, ok - to, Math.floor(n / to) * to === ok ? ok + to : Math.floor(n / to) * to]); },
  (r, l) => { const d = pick(r, [2, 3, 4, 5, 10]), k = ri(r, 2, 10); return q(tr(l, `Combien font 1/${d} de ${d * k} ?`, `What is 1/${d} of ${d * k}?`), k, r, l, [d * k - d, d]); },
  (r, l) => { const a = ri(r, 3, 12), b = ri(r, 2, a); return q(tr(l, `Quel est le périmètre d'un rectangle de ${a} cm sur ${b} cm (en cm) ?`, `What is the perimeter of a ${a} cm by ${b} cm rectangle (in cm)?`), 2 * (a + b), r, l, [a * b, a + b]); },
];
// ---- CM1 / Grade 4
G[4] = [
  (r, l) => { const a = ri(r, 12, 99), b = ri(r, 3, 9); return q(`${a} × ${b} = ?`, a * b, r, l, [a * b + 10, a * b - b]); },
  (r, l) => { const a = ri(r, 11, 35), b = ri(r, 11, 25); return q(`${a} × ${b} = ?`, a * b, r, l, [a * b + 10, a * b - 10]); },
  (r, l) => { const d = ri(r, 3, 9), qq = ri(r, 4, 15), re = ri(r, 1, d - 1); return q(tr(l, `Quel est le reste de la division de ${d * qq + re} par ${d} ?`, `What is the remainder when ${d * qq + re} is divided by ${d}?`), re, r, l, [qq, re + 1, d - re]); },
  (r, l) => { const n = ri(r, 1, 4), d = ri(r, n + 1, 6), k = ri(r, 2, 4); return q(tr(l, `${n}/${d} = ?/${d * k}`, `${n}/${d} = ?/${d * k}`), n * k, r, l, [n + k, n * k + 1, d * k - n]); },
  (r, l) => { const a = ri(r, 4, 15), b = ri(r, 3, 12); return q(tr(l, `Quelle est l'aire d'un rectangle de ${a} m sur ${b} m (en m²) ?`, `What is the area of a ${a} m by ${b} m rectangle (in m²)?`), a * b, r, l, [2 * (a + b), a + b]); },
  (r, l) => { const [fr, en, k] = pick(r, [['m', 'm', 100, 'cm'], ['km', 'km', 1000, 'm'], ['kg', 'kg', 1000, 'g'], ['L', 'L', 100, 'cL'], ['h', 'h', 60, 'min']].map((x) => [x[0] as string, x[3] as string, x[2] as number])) as [string, string, number]; const n = ri(r, 2, 9); return q(`${n} ${fr} = ? ${en}`, n * k, r, l, [n * k * 10, n * k / 10, n * (k === 60 ? 100 : 10)]); },
  (r, l) => { const m = ri(r, 3, 9); const ok = m * ri(r, 3, 11); return strs(tr(l, `Lequel est un multiple de ${m} ?`, `Which one is a multiple of ${m}?`), String(ok), [ok + 1, ok - 1, ok + 2, ok + m + 1].map(String)); },
  (r, l) => { const a = ri(r, 1, 9) / 10, b = ri(r, 11, 99) / 100, c = ri(r, 1, 9) / 10, d = ri(r, 1, 9) / 100; const v = [...new Set([a, b, c, d])]; if (v.length < 4) return q(`${num(a, l)} + ${num(c, l)} = ?`, a + c, r, l); const m = Math.max(...v); return [tr(l, 'Quel est le plus grand nombre ?', 'Which number is the greatest?'), num(m, l), ...v.filter((x) => x !== m).map((x) => num(x, l))]; },
];
// ---- CM2 / Grade 5
G[5] = [
  (r, l) => { const x = ri(r, 11, 999) / 100, k = pick(r, [10, 100, 1000]); return q(`${num(x, l)} × ${k} = ?`, x * k, r, l, [x * k * 10, x * k / 10, x + k]); },
  (r, l) => { const x = ri(r, 11, 999) / 10, k = pick(r, [10, 100]); return q(`${num(x, l)} ÷ ${k} = ?`, x / k, r, l, [x * k, x / k * 10, x / k / 10]); },
  (r, l) => { const a = ri(r, 11, 99) / 10, b = ri(r, 101, 999) / 100; return q(`${num(a, l)} + ${num(b, l)} = ?`, a + b, r, l, [a + b + 1, a + b - 0.1, a * 10 + b]); },
  (r, l) => { const d = ri(r, 4, 12), a = ri(r, 1, d - 2), b = ri(r, 1, d - a - 1); return strs(`${a}/${d} + ${b}/${d} = ?`, `${a + b}/${d}`, [`${a + b}/${2 * d}`, `${a * b}/${d}`, `${a + b + 1}/${d}`]); },
  (r, l) => { const a = ri(r, 2, 9), b = ri(r, 2, 6), c = ri(r, 2, 8); return q(tr(l, `Quel est le volume d'un pavé de ${a} cm × ${b} cm × ${c} cm (en cm³) ?`, `What is the volume of a ${a} cm × ${b} cm × ${c} cm box (in cm³)?`), a * b * c, r, l, [a * b + c, 2 * (a * b + b * c + a * c), a + b + c]); },
  (r, l) => { const p = pick(r, [10, 25, 50, 75]), n = pick(r, [20, 40, 60, 80, 100, 120, 200, 400]); return q(tr(l, `Combien font ${p} % de ${n} ?`, `What is ${p}% of ${n}?`), (p * n) / 100, r, l, [n - (p * n) / 100, p, (p * n) / 10]); },
  (r, l) => { const a = ri(r, 2, 20), b = ri(r, 2, 9), c = ri(r, 2, 9); return q(`${a} + ${b} × ${c} = ?`, a + b * c, r, l, [(a + b) * c, a * b + c]); },
];
// ---- 6e / Grade 6
G[6] = [
  (r, l) => { const p = 5 * ri(r, 1, 19), n = 20 * ri(r, 1, 15); return q(tr(l, `Combien font ${p} % de ${n} ?`, `What is ${p}% of ${n}?`), (p * n) / 100, r, l, [(p * n) / 10, n - (p * n) / 100]); },
  (r, l) => { const a = ri(r, 2, 6), b = ri(r, 2, 9), k = ri(r, 2, 6); return q(tr(l, `Pour ${a} crêpes il faut ${b} œufs. Combien d'œufs pour ${a * k} crêpes ?`, `A recipe uses ${b} eggs for ${a} pancakes. How many eggs for ${a * k} pancakes?`), b * k, r, l, [b + a * k - a, b * k + 1, a * k]); },
  (r, l) => { const b = ri(r, 3, 14), h = 2 * ri(r, 2, 8); return q(tr(l, `Aire d'un triangle de base ${b} cm et de hauteur ${h} cm (en cm²) ?`, `Area of a triangle with base ${b} cm and height ${h} cm (in cm²)?`), (b * h) / 2, r, l, [b * h, b + h]); },
  (r, l) => { const a = ri(r, 2, 9), b = ri(r, 1, 12), x = ri(r, 2, 9); return q(tr(l, `Combien vaut ${a}x + ${b} pour x = ${x} ?`, `What is ${a}x + ${b} when x = ${x}?`), a * x + b, r, l, [a + x + b, a * (x + b), Number(`${a}${x}`) + b]); },
  (r, l) => { const a = ri(r, 11, 49) / 10, b = ri(r, 2, 9); return q(`${num(a, l)} × ${b} = ?`, a * b, r, l, [a * b * 10, a * b + 1, a + b]); },
  (r, l) => { const g = ri(r, 2, 9), a = g * ri(r, 2, 7), b0 = g * ri(r, 2, 7); const b = a === b0 ? b0 + g : b0; return q(tr(l, `Quel est le plus grand diviseur commun de ${a} et ${b} ?`, `What is the greatest common factor of ${a} and ${b}?`), gcd(a, b), r, l, [g === gcd(a, b) ? 1 : g, (a * b) / gcd(a, b)]); },
  (r, l) => { const xs = new Set<number>(); while (xs.size < 4) xs.add(ri(r, -15, 15)); const v = [...xs]; const m = Math.min(...v); return [tr(l, 'Quel est le plus petit nombre ?', 'Which number is the least?'), num(m, l), ...v.filter((x) => x !== m).map((x) => num(x, l))]; },
  (r, l) => { const s = ri(r, 2, 12); return q(tr(l, `Quelle est l'aire d'un carré de côté ${s} cm (en cm²) ?`, `What is the area of a square with side ${s} cm (in cm²)?`), s * s, r, l, [4 * s, 2 * s]); },
];
// ---- 5e / Grade 7
G[7] = [
  (r, l) => { const a = ri(r, -12, 12), b = ri(r, -12, -1); return q(`(${num(a, l)}) + (${num(b, l)}) = ?`, a + b, r, l, [a - b, -(a + b)]); },
  (r, l) => { const a = ri(r, -9, -2), b = ri(r, -9, 9) || 3; return q(`(${num(a, l)}) × (${num(b, l)}) = ?`, a * b, r, l, [-(a * b), a + b]); },
  (r, l) => { const a = ri(r, 2, 30), x = ri(r, -10, 20); return q(tr(l, `Résous : x + ${a} = ${x + a}`, `Solve: x + ${a} = ${x + a}`), x, r, l, [x + 2 * a, -x]); },
  (r, l) => { const a = ri(r, 2, 9), x = ri(r, -9, 12) || 4; return q(tr(l, `Résous : ${a}x = ${num(a * x, l)}`, `Solve: ${a}x = ${num(a * x, l)}`), x, r, l, [a * x - a, a * x * a, -x]); },
  (r, l) => { const a = ri(r, 30, 80), b = ri(r, 30, 150 - a); return q(tr(l, `Un triangle a deux angles de ${a}° et ${b}°. Combien mesure le troisième ?`, `A triangle has angles of ${a}° and ${b}°. What is the third angle?`), 180 - a - b, r, l, [360 - a - b, 90 - Math.abs(a - b) + 1, 180 - a]); },
  (r, l) => { const rr = ri(r, 1, 10); return q(tr(l, `Périmètre d'un cercle de rayon ${rr} cm, avec π ≈ 3,14 (en cm) ?`, `Circumference of a circle with radius ${rr} cm, using π ≈ 3.14 (in cm)?`), Math.round(2 * 3.14 * rr * 100) / 100, r, l, [Math.round(3.14 * rr * rr * 100) / 100, Math.round(3.14 * rr * 100) / 100]); },
  (r, l) => { const a = ri(r, 1, 6), b = ri(r, 1, 6); return strs(tr(l, `Un sac contient ${a} billes rouges et ${b} billes bleues. Probabilité de tirer une rouge ?`, `A bag holds ${a} red and ${b} blue marbles. Probability of drawing red?`), frac(a, a + b), [frac(b, a + b), `${a}/${b}`, frac(1, a + b), frac(a, a + b + 1)]); },
  (r, l) => { const a = ri(r, 2, 8), b = ri(r, 3, 12), c = a * ri(r, 2, 6); return q(tr(l, `Tableau de proportionnalité : ${a} → ${b}, ${c} → ?`, `Proportional table: ${a} → ${b}, ${c} → ?`), (b * c) / a, r, l, [b + c - a, b * c, (b * c) / a + b]); },
];
// ---- 4e / Grade 8
G[8] = [
  (r, l) => { const b = pick(r, [2, 3, 5, 10]), n = ri(r, 2, b === 2 ? 10 : 4); return q(`${b}${sup(n)} = ?`, b ** n, r, l, [b * n, b ** (n + 1), n ** b]); },
  (r, l) => { const m = ri(r, 2, 9), n = ri(r, 2, 9); return q(tr(l, `a${sup(m)} × a${sup(n)} = a^?`, `a${sup(m)} × a${sup(n)} = a^?`), m + n, r, l, [m * n, Math.abs(m - n) || m + n + 1]); },
  (r, l) => { const [a, b, c] = pick(r, [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [9, 12, 15], [7, 24, 25]]); const k = ri(r, 1, 2); return q(tr(l, `Triangle rectangle : les côtés de l'angle droit mesurent ${a * k} et ${b * k}. Hypoténuse ?`, `Right triangle with legs ${a * k} and ${b * k}. Hypotenuse?`), c * k, r, l, [(a + b) * k, c * k + 1, (a * k) ** 2 + (b * k) ** 2]); },
  (r, l) => { const a = ri(r, 2, 9), x = ri(r, -6, 10), b = ri(r, -15, 15) || 5; return q(tr(l, `Résous : ${a}x ${signed(b)} = ${num(a * x + b, l)}`, `Solve: ${a}x ${signed(b)} = ${num(a * x + b, l)}`), x, r, l, [(a * x + 2 * b) / a, a * x + b - b * 2, -x]); },
  (r, l) => { const x1 = ri(r, -5, 5), y1 = ri(r, -5, 5), m = ri(r, -4, 4) || 2, dx = ri(r, 1, 4); return q(tr(l, `Pente de la droite passant par (${x1} ; ${y1}) et (${x1 + dx} ; ${y1 + m * dx}) ?`, `Slope of the line through (${x1}, ${y1}) and (${x1 + dx}, ${y1 + m * dx})?`), m, r, l, [-m, m * dx, dx]); },
  (r, l) => { const n = ri(r, 2, 15); return q(`√${n * n} = ?`, n, r, l, [n * n / 2, 2 * n]); },
  (r, l) => { const m = ri(r, 11, 99) / 10, e = ri(r, 3, 7); const v = Math.round(m * 10 ** e); return strs(tr(l, `Écriture scientifique de ${num(v, l)} ?`, `Scientific notation for ${num(v, l)}?`), `${num(m, l)} × 10${sup(e)}`, [`${num(m, l)} × 10${sup(e + 1)}`, `${num(m * 10, l)} × 10${sup(e)}`, `${num(m, l)} × 10${sup(e - 1)}`]); },
  (r, l) => { const k = ri(r, 2, 9), a = ri(r, -9, 9) || 3; return strs(tr(l, `Développe : ${k}(x ${signed(a)})`, `Expand: ${k}(x ${signed(a)})`), `${k}x ${signed(k * a)}`, [`${k}x ${signed(a)}`, `x ${signed(k * a)}`, `${k}x ${signed(k + a)}`]); },
];
// ---- 3e / Grade 9
G[9] = [
  (r, l) => { const a = ri(r, -7, 7) || 2, b = ri(r, -7, 7) || -3; return strs(tr(l, `Développe : (x ${signed(a)})(x ${signed(b)})`, `Expand: (x ${signed(a)})(x ${signed(b)})`), `x² ${signed(a + b)}x ${signed(a * b)}`, [`x² ${signed(a * b)}x ${signed(a + b)}`, `x² ${signed(a * b)}`, `x² ${signed(a + b)}x ${signed(a + b)}`]); },
  (r, l) => { const a = ri(r, 2, 12); return strs(tr(l, `Factorise : x² − ${a * a}`, `Factor: x² − ${a * a}`), `(x − ${a})(x + ${a})`, [`(x − ${a})²`, `(x + ${a})²`, `(x − ${a * a})(x + 1)`]); },
  (r, l) => { const a = ri(r, 3, 9), c = ri(r, 1, a - 1), x = ri(r, -8, 8), b = ri(r, -10, 10); const d = (a - c) * x + b; return q(tr(l, `Résous : ${a}x ${signed(b)} = ${c}x ${signed(d)}`, `Solve: ${a}x ${signed(b)} = ${c}x ${signed(d)}`), x, r, l, [-x, x + 1, (d + b) / (a - c)]); },
  (r, l) => { const a = ri(r, -5, 5) || 2, b = ri(r, -9, 9), x = ri(r, -5, 5); return q(tr(l, `f(x) = ${a}x ${signed(b)}. Combien vaut f(${x}) ?`, `f(x) = ${a}x ${signed(b)}. What is f(${x})?`), a * x + b, r, l, [a * x - b, a + x + b, a * (x + b)]); },
  (r, l) => { const p = pick(r, [10, 20, 25, 30, 40, 50]), n = 20 * ri(r, 2, 15); const up = r() < 0.5; return q(tr(l, `Un prix de ${n} € ${up ? 'augmente' : 'baisse'} de ${p} %. Nouveau prix (en €) ?`, `A $${n} price ${up ? 'rises' : 'drops'} by ${p}%. New price (in $)?`), n * (1 + (up ? p : -p) / 100), r, l, [n * (1 + (up ? -p : p) / 100), (n * p) / 100, n + (up ? p : -p)]); },
  (r, l) => { const [a, , c] = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10]]); return strs(tr(l, `Triangle rectangle : côté adjacent ${a}, hypoténuse ${c}. cos de l'angle ?`, `Right triangle: adjacent side ${a}, hypotenuse ${c}. Cosine of the angle?`), frac(a, c), [frac(c, a), frac(c - a, c), frac(a, c - a)]); },
  (r, l) => { const k = ri(r, 2, 4), a = ri(r, 2, 6), b = ri(r, 3, 9); return q(tr(l, `Théorème de Thalès : AM/AB = AN/AC. AM = ${a}, AB = ${a * k}, AN = ${b}. AC = ?`, `Similar triangles: AM/AB = AN/AC. AM = ${a}, AB = ${a * k}, AN = ${b}. AC = ?`), b * k, r, l, [b + a * k - a, a * b, b * k + k]); },
  (r, l) => { const a = ri(r, 2, 11); return strs(tr(l, `Solutions de x² = ${a * a} ?`, `Solutions of x² = ${a * a}?`), `${a} ${tr(l, 'et', 'and')} −${a}`, [`${a}`, `${a * a / 2}`, `${a} ${tr(l, 'et', 'and')} ${a * a}`]); },
];
// ---- Seconde / Grade 10
G[10] = [
  (r, l) => { const a = ri(r, -8, 8), b = ri(r, -8, 8); const s = [...new Set([a, b])].sort((x, y) => x - y); return strs(tr(l, `Solutions de (x ${signed(-a)})(x ${signed(-b)}) = 0 ?`, `Solutions of (x ${signed(-a)})(x ${signed(-b)}) = 0?`), s.map((v) => num(v, l)).join(tr(l, ' et ', ' and ')), [[-a, -b].map((v) => num(v, l)).join(tr(l, ' et ', ' and ')), num(a * b, l), [a, -b].map((v) => num(v, l)).join(tr(l, ' et ', ' and '))]); },
  (r, l) => { const [a, b, c] = pick(r, [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17]]); const x = ri(r, -4, 4), y = ri(r, -4, 4); return q(tr(l, `Distance entre A(${x} ; ${y}) et B(${x + a} ; ${y + b}) ?`, `Distance between A(${x}, ${y}) and B(${x + a}, ${y + b})?`), c, r, l, [a + b, c * c, c + 1]); },
  (r, l) => { const x1 = 2 * ri(r, -5, 5), x2 = 2 * ri(r, -5, 5), y1 = 2 * ri(r, -5, 5), y2 = 2 * ri(r, -5, 5); return strs(tr(l, `Milieu de [AB] avec A(${x1} ; ${y1}) et B(${x2} ; ${y2}) ?`, `Midpoint of A(${x1}, ${y1}) and B(${x2}, ${y2})?`), `(${(x1 + x2) / 2} ; ${(y1 + y2) / 2})`, [`(${x1 + x2} ; ${y1 + y2})`, `(${(x2 - x1) / 2} ; ${(y2 - y1) / 2})`, `(${(y1 + y2) / 2} ; ${(x1 + x2) / 2})`]); },
  (r, l) => { const xs = Array.from({ length: 5 }, () => ri(r, 2, 20)); const s = xs.reduce((a, b) => a + b, 0); const m = s / 5; return q(tr(l, `Moyenne de ${xs.join(' ; ')} ?`, `Mean of ${xs.join(', ')}?`), Math.round(m * 10) / 10, r, l, [[...xs].sort((a, b) => a - b)[2], s, Math.round(m) + 1]); },
  (r, l) => { const p = pick(r, [5, 10, 12, 15, 20, 25, 30, 40]); const up = r() < 0.5; return q(tr(l, `Coefficient multiplicateur d'une ${up ? 'hausse' : 'baisse'} de ${p} % ?`, `Multiplier for a ${p}% ${up ? 'increase' : 'decrease'}?`), 1 + (up ? p : -p) / 100, r, l, [1 + (up ? -p : p) / 100, p / 100, 1 + (up ? p : -p) / 10]); },
  (r, l) => { const x1 = ri(r, -5, 5), y1 = ri(r, -5, 5), x2 = ri(r, -5, 5), y2 = ri(r, -5, 5); return strs(tr(l, `Coordonnées du vecteur AB, A(${x1} ; ${y1}), B(${x2} ; ${y2}) ?`, `Components of vector AB, A(${x1}, ${y1}), B(${x2}, ${y2})?`), `(${x2 - x1} ; ${y2 - y1})`, [`(${x1 - x2} ; ${y1 - y2})`, `(${x1 + x2} ; ${y1 + y2})`, `(${y2 - y1} ; ${x2 - x1})`]); },
  (r, l) => { const a = ri(r, -4, 4) || 3, b = ri(r, -6, 6); const x1 = ri(r, -3, 3), x2 = x1 + ri(r, 1, 3); return q(tr(l, `Droite passant par (${x1} ; ${a * x1 + b}) et (${x2} ; ${a * x2 + b}) : coefficient directeur ?`, `Line through (${x1}, ${a * x1 + b}) and (${x2}, ${a * x2 + b}): slope?`), a, r, l, [b, -a, a * (x2 - x1)]); },
];
// ---- Première / Grade 11
G[11] = [
  (r, l) => { const a = ri(r, 1, 6), b = ri(r, -9, 9), x = ri(r, -4, 4); return q(tr(l, `f(x) = ${a}x² ${signed(b)}x. Combien vaut f'(${x}) ?`, `f(x) = ${a}x² ${signed(b)}x. What is f'(${x})?`), 2 * a * x + b, r, l, [a * x * x + b * x, a * x + b, 2 * a * x]); },
  (r, l) => { const a = ri(r, 1, 3), b = ri(r, -8, 8), c = ri(r, -8, 8); return q(tr(l, `Discriminant de ${a}x² ${signed(b)}x ${signed(c)} ?`, `Discriminant of ${a}x² ${signed(b)}x ${signed(c)}?`), b * b - 4 * a * c, r, l, [b * b + 4 * a * c, b * b - 2 * a * c, -b * b - 4 * a * c]); },
  (r, l) => { const u0 = ri(r, -5, 10), d = ri(r, -5, 6) || 2, n = ri(r, 3, 20); return q(tr(l, `Suite arithmétique : u₀ = ${u0}, raison ${d}. u${sub(n)} = ?`, `Arithmetic sequence: u₀ = ${u0}, common difference ${d}. u${sub(n)} = ?`), u0 + n * d, r, l, [u0 + (n - 1) * d, u0 * d ** n, u0 + (n + 1) * d]); },
  (r, l) => { const u0 = ri(r, 1, 5), q0 = pick(r, [2, 3, -2]), n = ri(r, 2, 5); return q(tr(l, `Suite géométrique : u₀ = ${u0}, raison ${q0}. u${sub(n)} = ?`, `Geometric sequence: u₀ = ${u0}, ratio ${q0}. u${sub(n)} = ?`), u0 * q0 ** n, r, l, [u0 * q0 ** (n - 1), u0 + n * q0, u0 * q0 ** (n + 1)]); },
  (r, l) => { const a = ri(r, -5, 5), b = ri(r, -5, 5), c = ri(r, -5, 5), d = ri(r, -5, 5); return q(tr(l, `Produit scalaire de u(${a} ; ${b}) et v(${c} ; ${d}) ?`, `Dot product of u(${a}, ${b}) and v(${c}, ${d})?`), a * c + b * d, r, l, [a * d + b * c, a * c - b * d, (a + c) * (b + d)]); },
  (r, l) => { const b = pick(r, [2, 3, 10]), n = ri(r, 2, b === 10 ? 6 : 6); return q(`log${sub(b)}(${num(b ** n, l)}) = ?`, n, r, l, [b ** n / b, n + 1, b * n]); },
  (r, l) => { const a = ri(r, 1, 3), s = ri(r, -6, 6), p = ri(r, -6, 6); return strs(tr(l, `Forme canonique : ${a}(x ${signed(-s)})² ${signed(p)}. Sommet de la parabole ?`, `Vertex form: ${a}(x ${signed(-s)})² ${signed(p)}. Vertex?`), `(${num(s, l)} ; ${num(p, l)})`, [`(${num(-s, l)} ; ${num(p, l)})`, `(${num(p, l)} ; ${num(s, l)})`, `(${num(s, l)} ; ${num(-p, l)})`]); },
];
// ---- Terminale / Grade 12
G[12] = [
  (r, l) => { const a = ri(r, 2, 9); return strs(tr(l, `Dérivée de f(x) = e^(${a}x) ?`, `Derivative of f(x) = e^(${a}x)?`), `${a}e^(${a}x)`, [`e^(${a}x)`, `${a}xe^(${a}x − 1)`, `e^(${a})`]); },
  (r, l) => { const k = ri(r, 2, 12); return q(`ln(e${sup(k)}) = ?`, k, r, l, [Math.round(Math.E ** k), 1, k * k]); },
  (r, l) => { const a = ri(r, 1, 6); return q(tr(l, `∫ de 0 à ${a} de 2x dx = ?`, `∫ from 0 to ${a} of 2x dx = ?`), a * a, r, l, [2 * a, a * a * 2, a]); },
  (r, l) => { const n = ri(r, 4, 9), k = ri(r, 2, Math.min(4, n - 1)); const C = (nn: number, kk: number): number => (kk === 0 ? 1 : (C(nn - 1, kk - 1) * nn) / kk); return q(tr(l, `Combien de façons de choisir ${k} éléments parmi ${n} ?`, `How many ways to choose ${k} items from ${n}?`), C(n, k), r, l, [n * k, C(n, k) * k, n ** k]); },
  (r, l) => { const a = ri(r, 1, 9), c = ri(r, 1, 9), b = ri(r, -9, 9), d = ri(r, 1, 9); return strs(tr(l, `Limite quand n → +∞ de (${a}n ${signed(b)}) / (${c}n ${signed(d)}) ?`, `Limit as n → ∞ of (${a}n ${signed(b)}) / (${c}n ${signed(d)})?`), frac(a, c), [frac(b, d), '+∞', '0']); },
  (r, l) => { const a = ri(r, 2, 6), b = ri(r, 2, 6); return strs(`ln(${a}) + ln(${b}) = ?`, `ln(${a * b})`, [`ln(${a + b})`, `ln(${a}) × ln(${b})`, `${a + b}`]); },
  (r, l) => { const a = ri(r, 1, 5), n = ri(r, 2, 4); return strs(tr(l, `Une primitive de ${a * (n + 1)}x${sup(n)} ?`, `An antiderivative of ${a * (n + 1)}x${sup(n)}?`), `${a === 1 ? '' : a}x${sup(n + 1)}`, [`${a * (n + 1) * n}x${sup(n - 1)}`, `${a * (n + 1)}x${sup(n + 1)}`, `${a}x${sup(n)}`]); },
];

function sup(n: number) { return String(n).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c] ?? '⁻').join(''); }
function sub(n: number) { return String(n).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join(''); }

/** Niveau scolaire (0 = Kindergarten, 1 = CP / Grade 1 … 12 = Terminale / Grade 12). */
export const GRADE: Record<string, number> = { k: 0, cp: 1, ce1: 2, ce2: 3, cm1: 4, cm2: 5, '6e': 6, '5e': 7, '4e': 8, '3e': 9, '2nde': 10, '1re': 11, tle: 12, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`g${i + 1}`, i + 1])) };

function seeded(seed: number): R {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Une question de maths du niveau, toujours la même pour une même graine. */
export function mathQuestion(level: string, seed: number, lang: L): string[] | null {
  const g = GRADE[level];
  const gens = G[g];
  if (!gens) return null;
  const r = seeded(seed);
  const gen = gens[seed % gens.length];
  for (let i = 0; i < 5; i++) {
    const out = gen(r, lang).map((x) => (lang === 'en' ? x.replace(/ ; /g, ', ') : x));
    if (new Set(out.slice(1)).size === 4 && out.every((x) => x && !x.includes('NaN') && !x.includes('undefined'))) return out;
  }
  return null;
}
export const MATH_GENERATORS = G.length;
