// Album d'autocollants et tenues d'avatar : catalogue commun au serveur et au navigateur.
import type { Names } from './protocol';

export interface Sticker { id: string; e: string; n: Names; rare?: boolean }
export interface AlbumPage { id: string; e: string; n: Names; stickers: Sticker[] }

const s = (id: string, e: string, fr: string, en: string, es: string, ar: string, rare = false): Sticker => ({ id, e, n: { fr, en, es, ar }, ...(rare ? { rare } : {}) });

export const ALBUM: AlbumPage[] = [
  {
    id: 'animals', e: '🦁', n: { fr: 'Animaux du monde', en: 'Animals of the world', es: 'Animales del mundo', ar: 'حيوانات العالم' },
    stickers: [
      s('lion', '🦁', 'Lion', 'Lion', 'León', 'أسد'), s('camel', '🐪', 'Dromadaire', 'Camel', 'Dromedario', 'جمل'),
      s('elephant', '🐘', 'Éléphant', 'Elephant', 'Elefante', 'فيل'), s('giraffe', '🦒', 'Girafe', 'Giraffe', 'Jirafa', 'زرافة'),
      s('panda', '🐼', 'Panda', 'Panda', 'Panda', 'باندا'), s('kangaroo', '🦘', 'Kangourou', 'Kangaroo', 'Canguro', 'كنغر'),
      s('penguin', '🐧', 'Manchot', 'Penguin', 'Pingüino', 'بطريق'), s('koala', '🐨', 'Koala', 'Koala', 'Koala', 'كوالا'),
      s('zebra', '🦓', 'Zèbre', 'Zebra', 'Cebra', 'حمار وحشي'), s('polarbear', '🐻‍❄️', 'Ours polaire', 'Polar bear', 'Oso polar', 'دب قطبي'),
      s('parrot', '🦜', 'Perroquet', 'Parrot', 'Loro', 'ببغاء'), s('whale', '🐋', 'Baleine', 'Whale', 'Ballena', 'حوت', true),
    ],
  },
  {
    id: 'morocco', e: '🇲🇦', n: { fr: 'Le Maroc', en: 'Morocco', es: 'Marruecos', ar: 'المغرب' },
    stickers: [
      s('tea', '🫖', 'Thé à la menthe', 'Mint tea', 'Té con menta', 'أتاي بالنعناع'), s('tajine', '🥘', 'Tajine', 'Tagine', 'Tajín', 'طاجين'),
      s('atlas', '🏔️', 'Le Haut Atlas', 'High Atlas', 'Alto Atlas', 'الأطلس الكبير'), s('dunes', '🏜️', 'Dunes de Merzouga', 'Merzouga dunes', 'Dunas de Merzouga', 'كثبان مرزوكة'),
      s('palms', '🌴', 'Palmeraie', 'Palm grove', 'Palmeral', 'واحة النخيل'), s('macaque', '🐒', 'Magot de l\'Atlas', 'Barbary macaque', 'Macaco de Berbería', 'قرد المكاك'),
      s('oranges', '🍊', 'Oranges', 'Oranges', 'Naranjas', 'برتقال'), s('lantern', '🏮', 'Lanterne', 'Lantern', 'Farol', 'فانوس'),
      s('surf', '🌊', 'Vagues de Taghazout', 'Taghazout waves', 'Olas de Taghazout', 'أمواج تغازوت'), s('argan', '🌳', 'Arganier', 'Argan tree', 'Argán', 'شجرة الأركان'),
      s('stork', '🪶', 'Cigogne', 'Stork', 'Cigüeña', 'لقلاق'), s('zellige', '💠', 'Zellige', 'Zellige', 'Zellige', 'زليج', true),
    ],
  },
  {
    id: 'wonders', e: '🗼', n: { fr: 'Merveilles', en: 'Wonders', es: 'Maravillas', ar: 'عجائب' },
    stickers: [
      s('eiffel', '🗼', 'Tour Eiffel', 'Eiffel Tower', 'Torre Eiffel', 'برج إيفل'), s('liberty', '🗽', 'Statue de la Liberté', 'Statue of Liberty', 'Estatua de la Libertad', 'تمثال الحرية'),
      s('pyramids', '🔺', 'Pyramides de Gizeh', 'Pyramids of Giza', 'Pirámides de Guiza', 'أهرامات الجيزة'), s('colosseum', '🏟️', 'Colisée', 'Colosseum', 'Coliseo', 'الكولوسيوم'),
      s('moai', '🗿', 'Moaï', 'Moai', 'Moái', 'تماثيل مواي'), s('fuji', '🗻', 'Mont Fuji', 'Mount Fuji', 'Monte Fuji', 'جبل فوجي'),
      s('torii', '⛩️', 'Torii', 'Torii gate', 'Torii', 'بوابة توري'), s('castle', '🏰', 'Château', 'Castle', 'Castillo', 'قلعة'),
      s('bridge', '🌉', 'Golden Gate', 'Golden Gate', 'Golden Gate', 'جسر البوابة الذهبية'), s('wall', '🧱', 'Grande Muraille', 'Great Wall', 'Gran Muralla', 'سور الصين العظيم'),
      s('volcano', '🌋', 'Volcan', 'Volcano', 'Volcán', 'بركان'), s('aurora', '🌌', 'Aurore boréale', 'Northern lights', 'Aurora boreal', 'الشفق القطبي', true),
    ],
  },
  {
    id: 'space', e: '🪐', n: { fr: 'Espace', en: 'Space', es: 'Espacio', ar: 'الفضاء' },
    stickers: [
      s('sun', '☀️', 'Soleil', 'Sun', 'Sol', 'الشمس'), s('earth', '🌍', 'Terre', 'Earth', 'Tierra', 'الأرض'),
      s('moon', '🌙', 'Lune', 'Moon', 'Luna', 'القمر'), s('saturn', '🪐', 'Saturne', 'Saturn', 'Saturno', 'زحل'),
      s('comet', '☄️', 'Comète', 'Comet', 'Cometa', 'مذنب'), s('rocket', '🚀', 'Fusée', 'Rocket', 'Cohete', 'صاروخ'),
      s('astronaut', '🧑‍🚀', 'Astronaute', 'Astronaut', 'Astronauta', 'رائد فضاء'), s('satellite', '🛰️', 'Satellite', 'Satellite', 'Satélite', 'قمر صناعي'),
      s('star', '🌠', 'Étoile filante', 'Shooting star', 'Estrella fugaz', 'شهاب'), s('telescope', '🔭', 'Télescope', 'Telescope', 'Telescopio', 'تلسكوب'),
      s('ufo', '🛸', 'Soucoupe', 'Flying saucer', 'Platillo volante', 'صحن طائر'), s('galaxy', '🌀', 'Galaxie', 'Galaxy', 'Galaxia', 'مجرة', true),
    ],
  },
  {
    id: 'sports', e: '⚽', n: { fr: 'Sports', en: 'Sports', es: 'Deportes', ar: 'رياضات' },
    stickers: [
      s('football', '⚽', 'Football', 'Football', 'Fútbol', 'كرة القدم'), s('basketball', '🏀', 'Basket', 'Basketball', 'Baloncesto', 'كرة السلة'),
      s('tennis', '🎾', 'Tennis', 'Tennis', 'Tenis', 'التنس'), s('rugby', '🏉', 'Rugby', 'Rugby', 'Rugby', 'الرغبي'),
      s('volley', '🏐', 'Volley', 'Volleyball', 'Voleibol', 'الكرة الطائرة'), s('boxing', '🥊', 'Boxe', 'Boxing', 'Boxeo', 'الملاكمة'),
      s('swim', '🏊', 'Natation', 'Swimming', 'Natación', 'السباحة'), s('bike', '🚴', 'Vélo', 'Cycling', 'Ciclismo', 'ركوب الدراجات'),
      s('ski', '⛷️', 'Ski', 'Skiing', 'Esquí', 'التزلج'), s('judo', '🥋', 'Judo', 'Judo', 'Judo', 'الجودو'),
      s('pingpong', '🏓', 'Ping-pong', 'Table tennis', 'Ping-pong', 'كرة الطاولة'), s('trophy', '🏆', 'Coupe du monde', 'World Cup', 'Copa del Mundo', 'كأس العالم', true),
    ],
  },
  {
    id: 'food', e: '🍜', n: { fr: 'Plats du monde', en: 'World food', es: 'Comida del mundo', ar: 'أطباق العالم' },
    stickers: [
      s('pizza', '🍕', 'Pizza', 'Pizza', 'Pizza', 'بيتزا'), s('sushi', '🍣', 'Sushi', 'Sushi', 'Sushi', 'سوشي'),
      s('taco', '🌮', 'Taco', 'Taco', 'Taco', 'تاكو'), s('croissant', '🥐', 'Croissant', 'Croissant', 'Cruasán', 'كرواسون'),
      s('ramen', '🍜', 'Ramen', 'Ramen', 'Ramen', 'رامن'), s('paella', '🥘', 'Paella', 'Paella', 'Paella', 'باييلا'),
      s('couscous', '🍲', 'Couscous', 'Couscous', 'Cuscús', 'كسكس'), s('curry', '🍛', 'Curry', 'Curry', 'Curry', 'كاري'),
      s('dumpling', '🥟', 'Raviolis chinois', 'Dumplings', 'Empanadillas chinas', 'زلابية صينية'), s('cheese', '🧀', 'Fromage', 'Cheese', 'Queso', 'جبن'),
      s('pretzel', '🥨', 'Bretzel', 'Pretzel', 'Pretzel', 'بريتزل'), s('mooncake', '🥮', 'Gâteau de lune', 'Mooncake', 'Pastel de luna', 'كعكة القمر', true),
    ],
  },
];
export const STICKERS: Sticker[] = ALBUM.flatMap((p) => p.stickers);
export const STICKER_IDS = new Set(STICKERS.map((x) => x.id));

// ------------------------------------------------------------------ tenues d'avatar
export type LookSlot = 'hat' | 'pin' | 'frame';
export interface Look { hat?: string; pin?: string; frame?: string }
/** Ce qui débloque un objet (vérifié par le serveur à partir du compte). */
export type Unlock =
  | { k: 'free' } | { k: 'level'; n: number } | { k: 'games'; n: number } | { k: 'badge'; id: string } | { k: 'stickers'; n: number } | { k: 'page' };
export interface LookItem { id: string; slot: LookSlot; e: string; u: Unlock }
export const LOOK_ITEMS: LookItem[] = [
  { id: 'cap', slot: 'hat', e: '🧢', u: { k: 'free' } },
  { id: 'bow', slot: 'hat', e: '🎀', u: { k: 'free' } },
  { id: 'straw', slot: 'hat', e: '👒', u: { k: 'games', n: 10 } },
  { id: 'tophat', slot: 'hat', e: '🎩', u: { k: 'level', n: 5 } },
  { id: 'grad', slot: 'hat', e: '🎓', u: { k: 'badge', id: 'perfect' } },
  { id: 'flower', slot: 'hat', e: '🌸', u: { k: 'badge', id: 'explorer' } },
  { id: 'crown', slot: 'hat', e: '👑', u: { k: 'badge', id: 'tourney' } },
  { id: 'star', slot: 'pin', e: '⭐', u: { k: 'free' } },
  { id: 'ma', slot: 'pin', e: '🇲🇦', u: { k: 'badge', id: 'morocco' } },
  { id: 'fire', slot: 'pin', e: '🔥', u: { k: 'badge', id: 'streak7' } },
  { id: 'medal', slot: 'pin', e: '🏅', u: { k: 'badge', id: 'winner' } },
  { id: 'compass', slot: 'pin', e: '🧭', u: { k: 'level', n: 10 } },
  { id: 'cards', slot: 'pin', e: '🎴', u: { k: 'stickers', n: 30 } },
  { id: 'blue', slot: 'frame', e: '#1E5AA8', u: { k: 'free' } },
  { id: 'green', slot: 'frame', e: '#1F8A5B', u: { k: 'level', n: 3 } },
  { id: 'gold', slot: 'frame', e: '#E0A800', u: { k: 'level', n: 15 } },
  { id: 'zellige', slot: 'frame', e: 'zellige', u: { k: 'page' } },
];
export const LOOK_BY_ID = Object.fromEntries(LOOK_ITEMS.map((x) => [x.id, x]));

/** Un objet est-il débloqué ? (niveau, parties, badges, autocollants différents, page d'album complète) */
export function isUnlocked(u: Unlock, a: { level: number; games: number; badges: Record<string, number>; album?: Record<string, number> }): boolean {
  const owned = Object.entries(a.album ?? {}).filter(([id, n]) => n > 0 && STICKER_IDS.has(id)).map(([id]) => id);
  switch (u.k) {
    case 'free': return true;
    case 'level': return a.level >= u.n;
    case 'games': return a.games >= u.n;
    case 'badge': return !!a.badges[u.id];
    case 'stickers': return owned.length >= u.n;
    case 'page': return ALBUM.some((p) => p.stickers.every((x) => owned.includes(x.id)));
  }
}
