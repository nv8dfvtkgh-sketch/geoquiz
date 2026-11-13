// Traductions de l'interface. Pour ajouter une langue : un fichier dans locales/ + une ligne ici.
import fr from './locales/fr.json';
import en from './locales/en.json';
import ar from './locales/ar.json';
import es from './locales/es.json';
import type { Lang } from '../shared/protocol';
import { revName } from '../shared/school';

const DICTS: Record<Lang, Record<string, string>> = { fr, en, ar, es };
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
  const m = /^(cat|game)\.(rev_[a-z0-9]+_[a-z0-9]+_[a-z]+)(\.long)?$/.exec(key);
  if (!m) return undefined;
  if (m[1] === 'game') return d['rev.long'] ?? (fr as Record<string, string>)['rev.long'];
  return revName(m[2]);
}

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('gq.lang') as Lang | null;
    if (saved && saved in DICTS) return saved;
  } catch {}
  const nav = (navigator.language || 'fr').slice(0, 2) as Lang;
  return nav in DICTS ? nav : 'fr';
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
