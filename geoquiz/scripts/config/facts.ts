// Corrections des données Natural Earth / CLDR, vérifiées à la main (audit du 16 novembre 2026).
// Natural Earth date un peu : capitales déplacées ou renommées, monnaies changées.

/** Capitale à retenir quand Natural Earth en donne plusieurs (nom anglais du point dans ne_50m_populated_places). */
export const CAPITAL_PICK: Record<string, string> = {
  ZA: 'Pretoria', // capitale exécutive (Le Cap : législative, Bloemfontein : judiciaire)
  TZ: 'Dodoma', // capitale officielle depuis 1996 (Dar es Salaam : ancienne capitale)
  BJ: 'Porto-Novo', // capitale officielle (Cotonou : siège du gouvernement)
};

/** Noms de capitale corrigés (renommage, accents). Les langues absentes gardent le nom de Natural Earth. */
export const CAPITAL_NAMES: Record<string, { names: Partial<Record<'fr' | 'en' | 'es' | 'ar', string>>; alts?: string[] }> = {
  KZ: { names: { fr: 'Astana', en: 'Astana', es: 'Astaná', ar: 'أستانا' }, alts: ['Nur-Sultan', 'Noursoultan'] }, // renommée en 2022
  BR: { names: { fr: 'Brasília' }, alts: ['Brasilia'] },
  PY: { names: { fr: 'Asunción' }, alts: ['Asuncion'] },
  SS: { names: { fr: 'Djouba' }, alts: ['Juba'] },
  ZA: { names: {}, alts: ['Le Cap', 'Cape Town', 'Bloemfontein'] },
};
/** Alternatives retirées (ce ne sont pas des capitales). */
export const CAPITAL_ALT_DROP: Record<string, string[]> = { ZA: ['Johannesburg'], MA: ['Laayoune'] };

/** Monnaies changées depuis les données CLDR. */
export const CURRENCY_FIX: Record<string, { code: string; names: Record<'fr' | 'en' | 'es' | 'ar', string> }> = {
  BG: { code: 'EUR', names: { fr: 'Euro', en: 'Euro', es: 'Euro', ar: 'يورو' } }, // la Bulgarie est passée à l'euro le 1er janvier 2026
  ZW: { code: 'ZWG', names: { fr: 'ZiG (or du Zimbabwe)', en: 'ZiG (Zimbabwe Gold)', es: 'ZiG (oro de Zimbabue)', ar: 'الزيغ (ذهب زيمبابوي)' } }, // depuis avril 2024
  CN: { code: 'CNY', names: { fr: 'Yuan (renminbi)', en: 'Yuan (renminbi)', es: 'Yuan (renminbi)', ar: 'يوان (رنمينبي)' } },
};

/** Territoires qui ne sont pas des pays : gardés sur la carte, mais pas dans les questions « pays ». */
export const NOT_COUNTRIES = ['IO', 'FK', 'JE', 'GG', 'IM', 'AW', 'CW', 'AX', 'GL', 'MO', 'HK', 'SX'];
