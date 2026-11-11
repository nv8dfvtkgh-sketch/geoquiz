// Regroupements officiels des subdivisions, par pays.
// Natural Earth fournit souvent des provinces ; on les regroupe ici en régions officielles.
// Clé de chaque région : mots-clés (sans accents, minuscules) présents dans le nom des provinces.

export interface RegionGroup {
  names: { fr: string; en: string; ar: string; es: string };
  tokens: string[];
}

export const REGION_GROUPS: Record<string, { label: string; groups: RegionGroup[] }> = {
  // Maroc : 12 régions (découpage de 2015), Sahara inclus.
  MA: {
    label: 'regions',
    groups: [
      { names: { fr: 'Tanger-Tétouan-Al Hoceïma', en: 'Tanger-Tetouan-Al Hoceima', ar: 'طنجة تطوان الحسيمة', es: 'Tánger-Tetuán-Alhucemas' },
        tokens: ['tanger', 'tangier', 'mdiq', 'fnideq', 'tetouan', 'fahs', 'anjra', 'larache', 'hoceima', 'chefchaouen', 'chaouen', 'ouezzane'] },
      { names: { fr: "L'Oriental", en: 'Oriental', ar: 'الشرق', es: 'Oriental' },
        tokens: ['oriental', 'oujda', 'nador', 'driouch', 'jerada', 'berkane', 'taourirt', 'guercif', 'figuig'] },
      { names: { fr: 'Fès-Meknès', en: 'Fès-Meknès', ar: 'فاس مكناس', es: 'Fez-Mequinez' },
        tokens: ['fes', 'fez', 'meknes', 'hajeb', 'ifrane', 'moulay yacoub', 'moulay yaacoub', 'sefrou', 'boulemane', 'taounate', 'taza'] },
      { names: { fr: 'Rabat-Salé-Kénitra', en: 'Rabat-Salé-Kénitra', ar: 'الرباط سلا القنيطرة', es: 'Rabat-Salé-Kenitra' },
        tokens: ['rabat', 'sale', 'skhirate', 'temara', 'kenitra', 'khemisset', 'sidi kacem', 'sidi slimane', 'gharb'] },
      { names: { fr: 'Béni Mellal-Khénifra', en: 'Béni Mellal-Khénifra', ar: 'بني ملال خنيفرة', es: 'Beni Mellal-Jenifra' },
        tokens: ['beni mellal', 'azilal', 'fquih', 'ben salah', 'khenifra', 'khouribga', 'tadla'] },
      { names: { fr: 'Casablanca-Settat', en: 'Casablanca-Settat', ar: 'الدار البيضاء سطات', es: 'Casablanca-Settat' },
        tokens: ['casablanca', 'anfa', 'ain chock', 'ain sebaa', 'hay hassani', 'sidi bernoussi', 'ben msik', 'moulay rachid', 'al fida', 'mohammedia', 'jadida', 'nouaceur', 'mediouna', 'benslimane', 'ben slimane', 'berrechid', 'settat', 'sidi bennour', 'chaouia', 'doukkala'] },
      { names: { fr: 'Marrakech-Safi', en: 'Marrakesh-Safi', ar: 'مراكش آسفي', es: 'Marrakech-Safí' },
        tokens: ['marrakech', 'marrakesh', 'menara', 'chichaoua', 'haouz', 'kelaa', 'sraghna', 'essaouira', 'rehamna', 'safi', 'youssoufia', 'tensift'] },
      { names: { fr: 'Drâa-Tafilalet', en: 'Drâa-Tafilalet', ar: 'درعة تافيلالت', es: 'Draa-Tafilalet' },
        tokens: ['draa', 'tafilalet', 'errachidia', 'ouarzazate', 'midelt', 'tinghir', 'tinerhir', 'zagora'] },
      { names: { fr: 'Souss-Massa', en: 'Souss-Massa', ar: 'سوس ماسة', es: 'Sus-Masa' },
        tokens: ['souss', 'agadir', 'inezgane', 'chtouka', 'taroudant', 'taroudannt', 'tiznit', 'tata'] },
      { names: { fr: 'Guelmim-Oued Noun', en: 'Guelmim-Oued Noun', ar: 'كلميم واد نون', es: 'Guelmim-Río Noun' },
        tokens: ['guelmim', 'assa', 'tan tan', 'tantan', 'ifni'] },
      { names: { fr: 'Laâyoune-Sakia El Hamra', en: 'Laâyoune-Sakia El Hamra', ar: 'العيون الساقية الحمراء', es: 'El Aaiún-Saguía el Hamra' },
        tokens: ['laayoune', 'layoune', 'aaiun', 'boujdour', 'tarfaya', 'semara', 'smara', 'sakia'] },
      { names: { fr: 'Dakhla-Oued Ed-Dahab', en: 'Dakhla-Oued Ed-Dahab', ar: 'الداخلة وادي الذهب', es: 'Dajla-Río de Oro' },
        tokens: ['dakhla', 'dahab', 'eddahab', 'aousserd', 'ousserd', 'lagouira'] },
    ],
  },
};
