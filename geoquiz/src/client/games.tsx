// Catalogue des jeux affiché à l'accueil, rangé par familles.
// Un jeu « disponible » correspond à une catégorie du serveur (src/server/categories.ts).
// Pour ajouter un jeu : une catégorie côté serveur, une ligne ici, ses textes dans locales/.

export interface GameDef {
  id: string; // = identifiant de catégorie côté serveur
  icon: keyof typeof ICONS;
  soon?: boolean; // affiché « Bientôt », pas encore jouable
  fresh?: boolean; // pastille « Nouveau »
}
export interface Family {
  id: string;
  tint: string; // fond des tuiles (classe CSS)
  games: GameDef[];
}

export const FAMILIES: Family[] = [
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
    ],
  },
  {
    id: 'world',
    tint: 'tint-sand',
    games: [
      { id: 'food', icon: 'bowl', fresh: true },
      { id: 'animals', icon: 'paw', fresh: true },
      { id: 'monuments', icon: 'columns', fresh: true },
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
      { id: 'truefalse', icon: 'check', fresh: true },
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
};

export function Icon({ name, size = 26 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
