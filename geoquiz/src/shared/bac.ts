// Petit Bac : catégories, préréglages, lettres et vues échangées entre le serveur et le navigateur.
// Une manche : la roulette tire une lettre, chacun écrit un mot par catégorie ; le premier qui a
// tout rempli peut crier STOP. Puis vérification (listes connues, sinon vote des joueurs) et points :
// 10 pour un mot trouvé seul, 5 pour un mot trouvé par plusieurs, 0 sinon.
import type { Names } from './protocol';

/** check : 'country' / 'capital' vérifiés strictement ; 'list' : mots connus acceptés d'office, les autres votés. */
export interface BacCat { id: string; n: Names; check?: 'country' | 'capital' | 'list' }
const c = (id: string, fr: string, en: string, es: string, ar: string, check?: BacCat['check']): BacCat => ({ id, n: { fr, en, es, ar }, ...(check ? { check } : {}) });

export const BAC_CATS: BacCat[] = [
  c('pays', 'Pays', 'Country', 'País', 'بلد', 'country'),
  c('capitale', 'Capitale', 'Capital city', 'Capital', 'عاصمة', 'capital'),
  c('ville', 'Ville', 'City', 'Ciudad', 'مدينة'),
  c('animal', 'Animal', 'Animal', 'Animal', 'حيوان', 'list'),
  c('fruitleg', 'Fruit ou légume', 'Fruit or vegetable', 'Fruta o verdura', 'فاكهة أو خضار', 'list'),
  c('prenom', 'Prénom', 'First name', 'Nombre', 'اسم'),
  c('metier', 'Métier', 'Job', 'Profesión', 'مهنة', 'list'),
  c('sport', 'Sport', 'Sport', 'Deporte', 'رياضة', 'list'),
  c('couleur', 'Couleur', 'Colour', 'Color', 'لون', 'list'),
  c('plat', 'Plat', 'Dish', 'Plato', 'طبق', 'list'),
  c('objet', 'Objet', 'Object', 'Objeto', 'شيء'),
  c('corps', 'Partie du corps', 'Body part', 'Parte del cuerpo', 'جزء من الجسم', 'list'),
  c('vetement', 'Vêtement', 'Clothing', 'Ropa', 'لباس', 'list'),
  c('instrument', 'Instrument de musique', 'Musical instrument', 'Instrumento musical', 'آلة موسيقية', 'list'),
  c('fleuve', 'Fleuve ou rivière', 'River', 'Río', 'نهر'),
  c('celebre', 'Personnage célèbre', 'Famous person', 'Personaje famoso', 'شخصية مشهورة'),
];
export const BAC_BY_ID: Record<string, BacCat> = Object.fromEntries(BAC_CATS.map((x) => [x.id, x]));

/** Préréglages : les premières catégories servent quand on choisit un nombre plus petit. */
export const BAC_PRESETS: Record<string, string[]> = {
  classic: ['pays', 'animal', 'fruitleg', 'prenom', 'metier', 'ville', 'sport', 'objet', 'couleur', 'plat', 'corps', 'vetement'],
  geo: ['pays', 'capitale', 'ville', 'fleuve', 'plat', 'animal', 'sport', 'celebre', 'prenom', 'fruitleg', 'metier', 'instrument'],
  kids: ['animal', 'fruitleg', 'couleur', 'prenom', 'corps', 'objet', 'vetement', 'sport', 'pays', 'metier', 'plat', 'instrument'],
};
export const BAC_MIN = 3, BAC_MAX = 12;
/** Catégorie inventée par l'hôte : « + texte » (toujours votée). */
export const customCat = (label: string) => `+${label}`;

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const RARE = new Set(['K', 'Q', 'W', 'X', 'Y', 'Z']);

/** Réglages d'une partie (dans les réglages de la salle). */
export interface BacConfig { cats: string[]; rounds: number; time: number; rare: boolean }
export const DEFAULT_BAC: BacConfig = { cats: BAC_PRESETS.classic.slice(0, 6), rounds: 3, time: 90, rare: false };

export function cleanBac(x: any): BacConfig {
  const n = (v: any, lo: number, hi: number, d: number) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
  const seen = new Set<string>();
  const cats: string[] = [];
  for (const id of Array.isArray(x?.cats) ? x.cats : []) {
    if (typeof id !== 'string') continue;
    const v = id.startsWith('+') ? `+${id.slice(1).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24)}` : id;
    if ((v.startsWith('+') ? v.length > 1 : BAC_BY_ID[v]) && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); cats.push(v); }
    if (cats.length >= BAC_MAX) break;
  }
  for (const id of BAC_PRESETS.classic) if (cats.length < BAC_MIN && !seen.has(id)) { seen.add(id); cats.push(id); }
  return { cats, rounds: n(x?.rounds, 1, 10, DEFAULT_BAC.rounds), time: n(x?.time, 30, 240, DEFAULT_BAC.time), rare: !!x?.rare };
}

/** Lettre suivante : jamais une lettre déjà tirée dans la partie. */
export function drawLetter(used: string[], rare: boolean, rnd: () => number): string {
  const pool = ALPHABET.filter((l) => !used.includes(l) && (rare || !RARE.has(l)));
  const list = pool.length ? pool : ALPHABET.filter((l) => rare || !RARE.has(l));
  return list[Math.floor(rnd() * list.length)];
}

/** Statut d'un mot après vérification. */
/** ok : accepté par vote ; known : mot connu ; unchecked : solo, mot inconnu (5 points) ; bad : pas un pays / une capitale. */
export type BacStatus = 'ok' | 'known' | 'unchecked' | 'vote' | 'bad' | 'letter' | 'empty' | 'rejected';
export interface BacCell { word: string; status: BacStatus; points: number }
export interface BacVoteItem { key: string; cat: number; word: string; by: string[]; rejects: number; mine: boolean; voted: boolean }

/** Vue de la partie pour un joueur. */
export interface BacView {
  phase: 'spin' | 'write' | 'vote' | 'round' | 'end';
  round: number; rounds: number;
  letter: string; used: string[];
  cats: string[]; // identifiants (ou « +texte »)
  ms: number; // temps restant de la phase
  answers: string[]; // mes réponses
  filled: Record<string, number>; // cases remplies par joueur
  stopBy?: string; // nom de celui qui a crié STOP
  votes?: BacVoteItem[];
  table?: { id: string; name: string; cells: BacCell[]; round: number; total: number }[];
  ready: string[]; // joueurs qui ont fini de voter / sont prêts pour la manche suivante
  solo: boolean;
}

export function catLabel(id: string, lang: keyof Names): string {
  return id.startsWith('+') ? id.slice(1) : BAC_BY_ID[id]?.n[lang] ?? id;
}
