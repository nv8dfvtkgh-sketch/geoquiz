// Traductions de l'interface. Pour ajouter une langue : un fichier dans locales/ + une ligne ici.
// Le français est livré avec l'application (langue de secours) ; les autres langues sont des
// morceaux séparés, chargés seulement quand on en a besoin (loadLang).
import fr from './locales/fr.json';
import type { Lang } from '../shared/protocol';
import { revName } from '../shared/school';

const DICTS: Partial<Record<Lang, Record<string, string>>> = { fr };
const LOADERS: Record<Lang, () => Promise<{ default: Record<string, string> }>> = {
  fr: async () => ({ default: fr }),
  en: () => import('./locales/en.json'),
  es: () => import('./locales/es.json'),
  ar: () => import('./locales/ar.json'),
};
export const LANG_CODES = Object.keys(LOADERS) as Lang[];
/** Charge le dictionnaire d'une langue (une seule fois). En cas d'échec, le français sert. */
export async function loadLang(lang: Lang): Promise<void> {
  if (DICTS[lang] || !LOADERS[lang]) return;
  try { DICTS[lang] = (await LOADERS[lang]()).default; } catch { /* reste en français */ }
}
export const langReady = (lang: Lang) => !!DICTS[lang];
export const LANG_LABELS: Record<Lang, string> = { fr: 'Français', en: 'English', ar: 'العربية', es: 'Español' };
export const RTL: Lang[] = ['ar'];

export type T = (key: string, params?: Record<string, string | number>) => string;

export function makeT(lang: Lang): T {
  const d = DICTS[lang] ?? fr;
  return (key, params) => {
    let s = d[key] ?? (fr as Record<string, string>)[key] ?? revKey(key, d) ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

/** Jeux de révision (rev_fr_cm1_maths…) : nom fabriqué à partir du programme. */
function revKey(key: string, d: Record<string, string>): string | undefined {
  const m = /^(cat|game)\.(rev_[a-z0-9]+_[a-z0-9]+_[a-z]+(?:-[a-z0-9-]+)?)(\.long)?$/.exec(key);
  if (!m) return undefined;
  if (m[1] === 'game') return d['rev.long'] ?? (fr as Record<string, string>)['rev.long'];
  return revName(m[2]);
}

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('gq.lang') as Lang | null;
    if (saved && saved in LOADERS) return saved;
  } catch {}
  const nav = (navigator.language || 'fr').slice(0, 2) as Lang;
  return nav in LOADERS ? nav : 'fr';
}

export function applyLang(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.includes(lang) ? 'rtl' : 'ltr';
  try { localStorage.setItem('gq.lang', lang); } catch {}
}

export function formatTime(ms: number): string {
  const s = Math.round(ms / 100) / 10;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1);
  return m ? `${m}:${rest.padStart(4, '0')}` : `${rest} s`;
}
