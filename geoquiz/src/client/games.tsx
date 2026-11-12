// Catalogue des jeux affiché à l'accueil, rangé par familles.
// Un jeu « disponible » correspond à une catégorie du serveur (src/server/categories.ts).
// Pour ajouter un jeu : une catégorie côté serveur, une ligne ici, ses textes dans locales/.

export interface GameDef {
  id: string; // = identifiant de catégorie côté serveur
  icon: keyof typeof ICONS;
  soon?: boolean; // affiché « Bientôt », pas encore jouable
  screen?: 'passport' | 'league' | 'tournament' | 'classes'; // ouvre une page plutôt qu'une partie
  fresh?: boolean; // pastille « Nouveau »
}
export interface Family {
  id: string;
  tint: string; // fond des tuiles (classe CSS)
  games: GameDef[];
}

export const FAMILIES: Family[] = [
  {
    id: 'today',
    tint: 'tint-gold',
    games: [
      { id: 'daily', icon: 'calendar', fresh: true },
      { id: 'review', icon: 'refresh', fresh: true },
      { id: 'league', icon: 'trophy', fresh: true, screen: 'league' },
      { id: 'passport', icon: 'passport', fresh: true, screen: 'passport' },
      { id: 'tournament', icon: 'stadium', fresh: true, screen: 'tournament' },
      { id: 'classes', icon: 'school', fresh: true, screen: 'classes' },
    ],
  },
  {
    id: 'geo',
    tint: 'tint-ocean',
    games: [
      { id: 'countries', icon: 'globe' },
      { id: 'regions', icon: 'regions' },
      { id: 'flags', icon: 'flag' },
      { id: 'capitals', icon: 'pin' },
      { id: 'silhouettes', icon: 'shape', fresh: true },
      { id: 'currencies', icon: 'coin', fresh: true },
      { id: 'languages', icon: 'bubble', fresh: true },
      { id: 'pin', icon: 'target', fresh: true },
      { id: 'flagreveal', icon: 'flagq', fresh: true },
      { id: 'higher', icon: 'scale', fresh: true },
      { id: 'chain', icon: 'chain', fresh: true },
      { id: 'timezones', icon: 'clock', fresh: true },
    ],
  },
  {
    id: 'world',
    tint: 'tint-sand',
    games: [
      { id: 'maroc', icon: 'star', fresh: true },
      { id: 'food', icon: 'bowl', fresh: true },
      { id: 'animals', icon: 'paw', fresh: true },
      { id: 'monuments', icon: 'columns', fresh: true },
      { id: 'hello', icon: 'wave', fresh: true },
      { id: 'sounds', icon: 'ear', fresh: true },
      { id: 'brands', icon: 'tag', soon: true },
    ],
  },
  {
    id: 'screens',
    tint: 'tint-violet',
    games: [
      { id: 'cinema', icon: 'clap', fresh: true },
      { id: 'emoji', icon: 'smile', fresh: true },
    ],
  },
  {
    id: 'school',
    tint: 'tint-sage',
    games: [
      { id: 'calc', icon: 'calc', fresh: true },
      { id: 'tables', icon: 'race', fresh: true },
      { id: 'timeline', icon: 'hourglass', fresh: true },
      { id: 'truefalse', icon: 'check', fresh: true },
      { id: 'space', icon: 'planet', fresh: true },
      { id: 'body', icon: 'heart', fresh: true },
      { id: 'dinos', icon: 'dino', fresh: true },
      { id: 'vocab', icon: 'book', fresh: true },
      { id: 'roadsigns', icon: 'sign', fresh: true },
    ],
  },
  {
    id: 'sport',
    tint: 'tint-rose',
    games: [
      { id: 'sport', icon: 'medal', fresh: true },
      { id: 'football', icon: 'ball', fresh: true },
      { id: 'tennis', icon: 'tennis', fresh: true },
      { id: 'rugby', icon: 'rugby', fresh: true },
      { id: 'basketball', icon: 'basket', fresh: true },
      { id: 'olympics', icon: 'rings', fresh: true },
      { id: 'motorsport', icon: 'wheel', fresh: true },
      { id: 'stadiums', icon: 'stadium', fresh: true },
      { id: 'kits', icon: 'shirt', fresh: true },
    ],
  },
];

export const findGame = (id: string) => FAMILIES.flatMap((f) => f.games.map((g) => ({ ...g, tint: f.tint }))).find((g) => g.id === id);

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const ICONS = {
  globe: <g {...P}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></g>,
  regions: <g {...P}><path d="M4 5l6-2 4 3 6-1v14l-6 2-4-3-6 1z" /><path d="M10 3v15M14 6v15" /></g>,
  flag: <g {...P}><path d="M5 21V4h11l-1.5 4H19v8h-8l1.5-4H5" /></g>,
  pin: <g {...P}><path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></g>,
  shape: <g {...P}><path d="M6 4l5 2 4-1 3 4-2 3 2 4-4 4-3-2-4 2-2-5 2-3-3-4z" /></g>,
  coin: <g {...P}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /></g>,
  bubble: <g {...P}><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h8" /></g>,
  bowl: <g {...P}><path d="M3 12h18a9 7 0 0 1-18 0z" /><path d="M8 9c0-2 2-2 2-4M12 9c0-2 2-2 2-4M16 9c0-2 2-2 2-4" /></g>,
  paw: <g {...P}><ellipse cx="12" cy="16" rx="4.5" ry="4" /><circle cx="6" cy="10" r="2" /><circle cx="10" cy="6" r="2" /><circle cx="14" cy="6" r="2" /><circle cx="18" cy="10" r="2" /></g>,
  columns: <g {...P}><path d="M4 20h16M5 20v-9M9.5 20v-9M14.5 20v-9M19 20v-9M3 11h18L12 4z" /></g>,
  tag: <g {...P}><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8" r="1.5" /></g>,
  clap: <g {...P}><rect x="3" y="8" width="18" height="12" rx="1.5" /><path d="M3 8l3-4h4l-3 4M10 8l3-4h4l-3 4" /></g>,
  smile: <g {...P}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c2 2 5 2 7 0" /><path d="M9 10h.01M15 10h.01" strokeWidth="2.4" /></g>,
  calc: <g {...P}><path d="M7 3v8M3 7h8M14 5l6 6M20 5l-6 6M3 17h8M15 15h6M15 19h6" /></g>,
  check: <g {...P}><path d="M3 12l4 4 7-8" /><path d="M15 15l6 6M21 15l-6 6" /></g>,
  plus: <g {...P}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></g>,
  star: <g {...P}><path d="M12 2.5l2.4 6.1H21l-5.3 4 2 6.4L12 15.2 6.3 19l2-6.4L3 8.6h6.6z" /></g>,
  wave: <g {...P}><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.6 0-4.3-1.4-5.6-3.6L4 14.6a1.5 1.5 0 0 1 2.5-1.6L8 15" /><path d="M19 3.5c1 .8 1.6 1.8 1.8 3M3.5 6.5c.3-1.2.9-2.2 1.9-3" /></g>,
  planet: <g {...P}><circle cx="12" cy="12" r="5.5" /><path d="M5.2 15.6C2.4 17.6 1.6 19.3 2.4 20c1.3 1.1 6-1 10.6-4.6S20.9 8 19.6 6.9c-.8-.7-2.6-.1-4.8 1.4" /></g>,
  heart: <g {...P}><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z" /><path d="M7 12h2.5l1.5-2.5 2 5 1.5-2.5H17" /></g>,
  dino: <g {...P}><path d="M3 20h3l1-4h6l1 4h3v-6c2 0 4-1.5 4-4V6l-3-2h-3l-1 3h2v3c-2 0-4 1-5 2H8C5 12 3 14 3 17z" /><path d="M17.5 6h.01" strokeWidth="2.4" /></g>,
  book: <g {...P}><path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z" /><path d="M12 6v13.5" /></g>,
  sign: <g {...P}><path d="M12 3l9.5 16.5h-19z" /><path d="M12 9.5v4.5M12 16.8h.01" strokeWidth="2" /></g>,
  medal: <g {...P}><circle cx="12" cy="15" r="5.5" /><path d="M8.5 10.7L5 3h4.5l2.5 5 2.5-5H19l-3.5 7.7" /><path d="M12 12.5l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" /></g>,
  ball: <g {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4zM12 3v4.5M15.8 10.3l4.7-1.6M14.3 14.7l2.8 4M9.7 14.7l-2.8 4M8.2 10.3L3.5 8.7" /></g>,
  tennis: <g {...P}><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6c3.3 3.3 3.3 9.5 0 12.8M18.4 5.6c-3.3 3.3-3.3 9.5 0 12.8" /></g>,
  rugby: <g {...P}><ellipse cx="12" cy="12" rx="10" ry="5.5" transform="rotate(-35 12 12)" /><path d="M9 15l6-6M10.5 10.5l1.5 1.5M12 9l1.5 1.5M9 12l1.5 1.5" /></g>,
  basket: <g {...P}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M5.6 5.6c2.5 2.5 2.5 10.3 0 12.8M18.4 5.6c-2.5 2.5-2.5 10.3 0 12.8" /></g>,
  rings: <g {...P}><circle cx="6" cy="10" r="3.3" /><circle cx="12" cy="10" r="3.3" /><circle cx="18" cy="10" r="3.3" /><circle cx="9" cy="14" r="3.3" /><circle cx="15" cy="14" r="3.3" /></g>,
  school: <g {...P}><path d="M3 9l9-5 9 5-9 5z" /><path d="M7 11.2V16c1.5 1.5 3 2 5 2s3.5-.5 5-2v-4.8M21 9v6" /></g>,
  refresh: <g {...P}><path d="M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5" /><path d="M5 3v4h4M19 21v-4h-4" /></g>,
  trophy: <g {...P}><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8M9.5 18h5" /></g>,
  passport: <g {...P}><rect x="5" y="3" width="14" height="18" rx="2" /><circle cx="12" cy="10" r="3.2" /><path d="M8.8 10h6.4M12 6.8c1 1 1 5.4 0 6.4M12 6.8c-1 1-1 5.4 0 6.4M9 17h6" /></g>,
  calendar: <g {...P}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M12 12.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" /></g>,
  target: <g {...P}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></g>,
  flagq: <g {...P}><path d="M5 21V4h14v10H5" /><path d="M10.2 7.6a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.6-.8 1.2M12 12.3h.01" /></g>,
  scale: <g {...P}><path d="M12 4v16M7 20h10M4 7h16" /><path d="M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z" /></g>,
  chain: <g {...P}><rect x="2.5" y="8.5" width="10" height="7" rx="3.5" /><rect x="11.5" y="8.5" width="10" height="7" rx="3.5" /></g>,
  clock: <g {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></g>,
  ear: <g {...P}><path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.6" /><path d="M10 9.5a2 2 0 0 1 4 0c0 1.4-1.5 1.8-1.5 3" /><path d="M19.5 4.5c1.3 1.3 2 3 2 4.8M2.5 9.3c0-1.8.7-3.5 2-4.8" /></g>,
  race: <g {...P}><path d="M4 21V4M4 4h14l-2.5 4L18 12H4" /><path d="M8 4v8M12 4v8M4 8h12" /></g>,
  hourglass: <g {...P}><path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9" /></g>,
  stadium: <g {...P}><ellipse cx="12" cy="13" rx="9.5" ry="5.5" /><ellipse cx="12" cy="13" rx="5" ry="2.5" /><path d="M2.5 13v3c0 3 4.3 5.5 9.5 5.5s9.5-2.5 9.5-5.5v-3M5 6l1 3M19 6l-1 3M12 4v3.5" /></g>,
  shirt: <g {...P}><path d="M8 3l-5 3 2 4 2.5-1V21h9V9l2.5 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z" /></g>,
  wheel: <g {...P}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21" /></g>,
};

export function Icon({ name, size = 26 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
