// Les 75 préfectures et provinces du Maroc (découpage de 2015), avec leurs noms dans les 4 langues.
// Contours : geoBoundaries MAR ADM2 (OpenStreetMap, licence ODbL). Les noms de la source sont mélangés
// (français, anglais, arabe, parfois faux) : on les remplace par ces noms.
// `key` : mot (sans accent, en minuscules) qui identifie l'entité dans le nom de la source.
export const MA_PROVINCES: { key: string; fr: string; en: string; es: string; ar: string }[] = [
  // Tanger-Tétouan-Al Hoceïma
  { key: 'tangier', fr: 'Tanger-Assilah', en: 'Tangier-Assilah', es: 'Tánger-Arcila', ar: 'طنجة أصيلة' },
  { key: 'fnideq', fr: "M'diq-Fnideq", en: "M'diq-Fnideq", es: "M'diq-Fnideq", ar: 'المضيق الفنيدق' },
  { key: 'tetouan', fr: 'Tétouan', en: 'Tetouan', es: 'Tetuán', ar: 'تطوان' },
  { key: 'fahs', fr: 'Fahs-Anjra', en: 'Fahs-Anjra', es: 'Fahs-Anjra', ar: 'الفحص أنجرة' },
  { key: 'larache', fr: 'Larache', en: 'Larache', es: 'Larache', ar: 'العرائش' },
  { key: 'hoceima', fr: 'Al Hoceïma', en: 'Al Hoceima', es: 'Alhucemas', ar: 'الحسيمة' },
  { key: 'chefchaouen', fr: 'Chefchaouen', en: 'Chefchaouen', es: 'Chauen', ar: 'شفشاون' },
  { key: 'ouezzane', fr: 'Ouezzane', en: 'Ouezzane', es: 'Uazán', ar: 'وزان' },
  // L'Oriental
  { key: 'oujda', fr: 'Oujda-Angad', en: 'Oujda-Angad', es: 'Uchda-Angad', ar: 'وجدة أنجاد' },
  { key: 'nador', fr: 'Nador', en: 'Nador', es: 'Nador', ar: 'الناظور' },
  { key: 'driouch', fr: 'Driouch', en: 'Driouch', es: 'Driuch', ar: 'الدريوش' },
  { key: 'jerada', fr: 'Jerada', en: 'Jerada', es: 'Yerada', ar: 'جرادة' },
  { key: 'berkane', fr: 'Berkane', en: 'Berkane', es: 'Berkán', ar: 'بركان' },
  { key: 'taourirt', fr: 'Taourirt', en: 'Taourirt', es: 'Taurirt', ar: 'تاوريرت' },
  { key: 'guercif', fr: 'Guercif', en: 'Guercif', es: 'Guercif', ar: 'جرسيف' },
  { key: 'figuig', fr: 'Figuig', en: 'Figuig', es: 'Figuig', ar: 'فكيك' },
  // Fès-Meknès
  { key: 'fes', fr: 'Fès', en: 'Fez', es: 'Fez', ar: 'فاس' },
  { key: 'meknes', fr: 'Meknès', en: 'Meknes', es: 'Mequinez', ar: 'مكناس' },
  { key: 'hajeb', fr: 'El Hajeb', en: 'El Hajeb', es: 'El Hayeb', ar: 'الحاجب' },
  { key: 'ifrane', fr: 'Ifrane', en: 'Ifrane', es: 'Ifrán', ar: 'إفران' },
  { key: 'moulay yacoub', fr: 'Moulay Yacoub', en: 'Moulay Yacoub', es: 'Muley Yacub', ar: 'مولاي يعقوب' },
  { key: 'sefrou', fr: 'Sefrou', en: 'Sefrou', es: 'Sefrú', ar: 'صفرو' },
  { key: 'boulemane', fr: 'Boulemane', en: 'Boulemane', es: 'Bulmán', ar: 'بولمان' },
  { key: 'taounate', fr: 'Taounate', en: 'Taounate', es: 'Taunat', ar: 'تاونات' },
  { key: 'taza', fr: 'Taza', en: 'Taza', es: 'Taza', ar: 'تازة' },
  // Rabat-Salé-Kénitra
  { key: 'rabat', fr: 'Rabat', en: 'Rabat', es: 'Rabat', ar: 'الرباط' },
  { key: 'sale', fr: 'Salé', en: 'Salé', es: 'Salé', ar: 'سلا' },
  { key: 'skhirate', fr: 'Skhirate-Témara', en: 'Skhirate-Temara', es: 'Skhirat-Temara', ar: 'الصخيرات تمارة' },
  { key: 'kenitra', fr: 'Kénitra', en: 'Kenitra', es: 'Kenitra', ar: 'القنيطرة' },
  { key: 'khemisset', fr: 'Khémisset', en: 'Khemisset', es: 'Jemisset', ar: 'الخميسات' },
  { key: 'sidi kacem', fr: 'Sidi Kacem', en: 'Sidi Kacem', es: 'Sidi Kacem', ar: 'سيدي قاسم' },
  { key: 'sidi slimane', fr: 'Sidi Slimane', en: 'Sidi Slimane', es: 'Sidi Slimane', ar: 'سيدي سليمان' },
  // Béni Mellal-Khénifra
  { key: 'beni mellal', fr: 'Béni Mellal', en: 'Beni Mellal', es: 'Beni Mellal', ar: 'بني ملال' },
  { key: 'azilal', fr: 'Azilal', en: 'Azilal', es: 'Azilal', ar: 'أزيلال' },
  { key: 'fquih', fr: 'Fquih Ben Salah', en: 'Fquih Ben Salah', es: 'Fquih Ben Salah', ar: 'الفقيه بن صالح' },
  { key: 'khenifra', fr: 'Khénifra', en: 'Khenifra', es: 'Jenifra', ar: 'خنيفرة' },
  { key: 'khouribga', fr: 'Khouribga', en: 'Khouribga', es: 'Juribga', ar: 'خريبكة' },
  // Casablanca-Settat
  { key: 'casablanca', fr: 'Casablanca', en: 'Casablanca', es: 'Casablanca', ar: 'الدار البيضاء' },
  { key: 'mohammedia', fr: 'Mohammédia', en: 'Mohammedia', es: 'Mohammedia', ar: 'المحمدية' },
  { key: 'jadida', fr: 'El Jadida', en: 'El Jadida', es: 'El Yadida', ar: 'الجديدة' },
  { key: 'nouaceur', fr: 'Nouaceur', en: 'Nouaceur', es: 'Nuaceur', ar: 'النواصر' },
  { key: 'mediouna', fr: 'Médiouna', en: 'Mediouna', es: 'Mediuna', ar: 'مديونة' },
  { key: 'benslimane', fr: 'Benslimane', en: 'Benslimane', es: 'Benslimane', ar: 'بنسليمان' },
  { key: 'berrechid', fr: 'Berrechid', en: 'Berrechid', es: 'Berrechid', ar: 'برشيد' },
  { key: 'settat', fr: 'Settat', en: 'Settat', es: 'Settat', ar: 'سطات' },
  { key: 'sidi bennour', fr: 'Sidi Bennour', en: 'Sidi Bennour', es: 'Sidi Bennur', ar: 'سيدي بنور' },
  // Marrakech-Safi
  { key: 'marrakech', fr: 'Marrakech', en: 'Marrakesh', es: 'Marrakech', ar: 'مراكش' },
  { key: 'chichaoua', fr: 'Chichaoua', en: 'Chichaoua', es: 'Chichaua', ar: 'شيشاوة' },
  { key: 'haouz', fr: 'Al Haouz', en: 'Al Haouz', es: 'Al Hauz', ar: 'الحوز' },
  { key: 'kelaat', fr: 'El Kelâa des Sraghna', en: 'El Kelaa des Sraghna', es: 'El Kelaa des Sraghna', ar: 'قلعة السراغنة' },
  { key: 'essaouira', fr: 'Essaouira', en: 'Essaouira', es: 'Esauira', ar: 'الصويرة' },
  { key: 'rhamna', fr: 'Rehamna', en: 'Rehamna', es: 'Rehamna', ar: 'الرحامنة' },
  { key: 'safi', fr: 'Safi', en: 'Safi', es: 'Safí', ar: 'آسفي' },
  { key: 'youssoufia', fr: 'Youssoufia', en: 'Youssoufia', es: 'Yusufía', ar: 'اليوسفية' },
  // Drâa-Tafilalet
  { key: 'errachidia', fr: 'Errachidia', en: 'Errachidia', es: 'Er Rachidia', ar: 'الرشيدية' },
  { key: 'ouarzazate', fr: 'Ouarzazate', en: 'Ouarzazate', es: 'Uarzazat', ar: 'ورزازات' },
  { key: 'midelt', fr: 'Midelt', en: 'Midelt', es: 'Midelt', ar: 'ميدلت' },
  { key: 'tinghir', fr: 'Tinghir', en: 'Tinghir', es: 'Tinghir', ar: 'تنغير' },
  { key: 'zagora', fr: 'Zagora', en: 'Zagora', es: 'Zagora', ar: 'زاكورة' },
  // Souss-Massa
  { key: 'agadir', fr: 'Agadir Ida-Outanane', en: 'Agadir Ida-Outanane', es: 'Agadir Ida-Utanán', ar: 'أكادير إداوتنان' },
  { key: 'inezgane', fr: 'Inezgane-Aït Melloul', en: 'Inezgane-Ait Melloul', es: 'Inezgane-Ait Melloul', ar: 'إنزكان آيت ملول' },
  { key: 'chtouka', fr: 'Chtouka-Aït Baha', en: 'Chtouka-Ait Baha', es: 'Chtuka-Ait Baha', ar: 'اشتوكة آيت باها' },
  { key: 'taroudant', fr: 'Taroudant', en: 'Taroudant', es: 'Tarudant', ar: 'تارودانت' },
  { key: 'tiznit', fr: 'Tiznit', en: 'Tiznit', es: 'Tiznit', ar: 'تيزنيت' },
  { key: 'tata', fr: 'Tata', en: 'Tata', es: 'Tata', ar: 'طاطا' },
  // Guelmim-Oued Noun
  { key: 'guelmim', fr: 'Guelmim', en: 'Guelmim', es: 'Guelmim', ar: 'كلميم' },
  { key: 'assa', fr: 'Assa-Zag', en: 'Assa-Zag', es: 'Assa-Zag', ar: 'آسا الزاك' },
  { key: 'tan tan', fr: 'Tan-Tan', en: 'Tan-Tan', es: 'Tan-Tan', ar: 'طانطان' },
  { key: 'ifni', fr: 'Sidi Ifni', en: 'Sidi Ifni', es: 'Sidi Ifni', ar: 'سيدي إفني' },
  // Laâyoune-Sakia El Hamra
  { key: 'laayoune', fr: 'Laâyoune', en: 'Laayoune', es: 'El Aaiún', ar: 'العيون' },
  { key: 'boujdour', fr: 'Boujdour', en: 'Boujdour', es: 'Bojador', ar: 'بوجدور' },
  { key: 'tarfaya', fr: 'Tarfaya', en: 'Tarfaya', es: 'Tarfaya', ar: 'طرفاية' },
  { key: 'semara', fr: 'Es-Semara', en: 'Es-Semara', es: 'Smara', ar: 'السمارة' },
  // Dakhla-Oued Ed-Dahab
  { key: 'oued ed dahab', fr: 'Oued Ed-Dahab', en: 'Oued Ed-Dahab', es: 'Río de Oro', ar: 'وادي الذهب' },
  { key: 'aousserd', fr: 'Aousserd', en: 'Aousserd', es: 'Auserd', ar: 'أوسرد' },
];
