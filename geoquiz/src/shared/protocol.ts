// Types partagés entre le serveur et le navigateur (messages WebSocket, réglages).

export const LANGS = ['fr', 'en', 'ar', 'es'] as const;
export type Lang = (typeof LANGS)[number];
export type Names = Record<Lang, string>;

export type CategoryId = 'flags' | 'countries' | 'capitals' | 'regions' | (string & {});
/** 'auto' : selon la difficulté (facile = QCM, moyen = mélange, difficile = saisie). */
export type QType = 'auto' | 'map' | 'mcq' | 'type' | 'mix';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type RoomKind = 'solo' | 'duel' | 'room';
export type SoloMode = 'training' | 'timed';
/** Mode d'une salle : classique, Battle Royale (duels par paires, 3 cœurs) ou équipes. */
export type RoomMode = 'classic' | 'battle' | 'teams' | 'buzzer';
export const BATTLE_LIVES = 3;

export interface Settings {
  category: CategoryId;
  zone: string; // 'world' | 'c:africa' | 's:northern-africa' | 'r:MA:groups'
  difficulty: Difficulty;
  qtype: QType;
  count: number;
  timeLimit: number; // secondes par question (duel / salle)
  soloMode?: SoloMode;
  mode?: RoomMode; // salles seulement
  quiz?: string; // catégorie « custom » : code du quiz créé
  teams?: number; // nombre d'équipes (2 à 4)
  chests?: boolean; // coffres surprises après une bonne réponse (duel, salle)
  wager?: boolean; // mise avant la dernière question (duel, salle)
}

export const DEFAULT_SETTINGS: Settings = {
  category: 'countries',
  zone: 'world',
  difficulty: 'easy',
  qtype: 'auto',
  count: 10,
  timeLimit: 20,
  soloMode: 'training',
};

export const LIMITS = { minCount: 3, maxCount: 50, minTime: 5, maxTime: 90, maxNameLength: 20 };

// ------------------------------------------------------------------ catalogue
export interface ZoneInfo {
  id: string;
  kind: 'world' | 'continent' | 'subregion' | 'regions';
  parent?: string;
  /** Noms traduits pour les zones « pays » ; continents et sous-régions viennent des fichiers i18n. */
  names?: Names;
  level?: 'groups' | 'subs';
  count: number;
  categories: CategoryId[];
  /** Cadrage de la zone sur sa carte (aperçus). */
  view?: [number, number, number, number];
  /** Pays de la zone (continents et sous-régions). */
  ids?: string[];
  /** Nombre d'éléments à trouver par jeu pour maîtriser la zone (page Géographie). */
  pool?: Record<string, number>;
}

export interface CategoryInfo {
  id: CategoryId;
  /** true : pas de choix de zone (langues, calcul mental) */
  noZone?: boolean;
  qtypes: Exclude<QType, 'mix' | 'auto'>[];
  zoneKinds: ZoneInfo['kind'][];
}

export interface Catalog {
  zones: ZoneInfo[];
  categories: CategoryInfo[];
  maxPlayers: number;
}

// ------------------------------------------------------------------ cartes
export interface MapFeature {
  id: string;
  d: string; // chemin SVG pré-projeté
  c: [number, number]; // point d'étiquette / cible des petits pays
  b: [number, number, number, number]; // emprise
  a: number; // surface
  k?: [number, number]; // capitale (carte du monde)
  line?: boolean; // entité linéaire (fleuve…)
}
export interface MapData {
  w: number;
  h: number;
  /** carte du monde : [x0, y1, échelle] de la projection Natural Earth (mesure des distances) */
  proj?: [number, number, number];
  features: MapFeature[];
}

/** Ce que le navigateur doit afficher pour une question. */
export interface MapSpec {
  map: string; // 'world' | 'region:MA:groups'
  view: [number, number, number, number]; // x, y, largeur, hauteur
  active: string[]; // entités de la zone (les autres sont grisées)
  layer: 'shapes' | 'capitals';
}

// ------------------------------------------------------------------ partie
export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  lang: Lang;
  streak: number;
  team?: number; // mode équipes
  lives?: number; // Battle Royale
  out?: boolean; // Battle Royale : éliminé
}

export interface TeamScore { id: number; score: number; size: number }
/** Coffre surprise ouvert après une bonne réponse. */
export type ChestKind = 'plus' | 'double' | 'steal' | 'shield' | 'swap' | 'small' | 'blocked';
export interface ChestResult { kind: ChestKind; amount: number; from?: string }
/** Réactions envoyées entre les questions (liste fixe : pas de texte libre). */
export const REACTIONS = ['👏', '🔥', '😂', '😱', '🤯', '❤️'];

export type RoomState = 'lobby' | 'question' | 'reveal' | 'finished';

export interface RoomSnapshot {
  code: string;
  kind: RoomKind;
  state: RoomState;
  settings: Settings;
  hostId: string;
  hostPlays: boolean;
  players: PublicPlayer[];
  maxPlayers: number;
  qIndex: number;
  rematchVotes?: string[];
  teams?: TeamScore[]; // mode équipes, du premier au dernier
  pairs?: [string, string | null][]; // Battle Royale : duels de la question en cours
}

export type QKind = 'map' | 'mcq' | 'type' | 'pin' | 'order';
/** Maillot dessiné (jeu « Couleurs des équipes »). */
export interface KitSpec { p: string; c: string[]; sh: string }

export interface QOption {
  id: string; // opaque (o0…o3)
  label?: string;
  flag?: string; // jeton d'image
}

export interface QuestionMsg {
  index: number;
  total: number;
  category: CategoryId;
  /** pin : placer un point sur la carte ; order : remettre les réponses dans l'ordre */
  kind: QKind;
  promptKey: string; // clé i18n
  params: Record<string, string>;
  flag?: string; // jeton d'image de drapeau à afficher
  map?: MapSpec;
  highlight?: string; // entité surlignée (« quel est ce pays ? »)
  shape?: { d: string; w: number; h: number }; // silhouette à deviner (coordonnées recentrées)
  image?: string; // jeton d'une photo de quiz créé
  emoji?: string; // grand pictogramme (plats, animaux)
  sign?: string; // panneau du code de la route à dessiner
  kit?: KitSpec; // maillot à dessiner
  sound?: string; // jeton d'un enregistrement (cris d'animaux)
  clues?: string[]; // « Qui suis-je ? » : indices, du plus dur au plus facile
  options?: QOption[];
  attempts: number;
  timeLimit: number | null; // ms, null = sans chrono
  remaining: number | null; // ms
}

export interface Reveal {
  id?: string; // entité correcte sur la carte
  optionId?: string;
  label: string;
  flag?: string;
  credit?: string; // crédit de la photo (Monuments)
  point?: [number, number]; // « Où est-ce ? » : emplacement exact sur la carte
  order?: string[]; // frise : ordre correct des options
}

export interface PlayerRound {
  id: string;
  correct: boolean;
  points: number;
  timeMs: number | null;
  attempts: number;
  answer?: string;
  km?: number; // « Où est-ce ? » : distance au bon endroit
  bet?: number; // mise finale : points misés (gagnés ou perdus)
}

export interface RecapItem {
  index: number;
  label: string;
  results: PlayerRound[];
}

// Création d'une partie : POST /api/rooms (CreateRoomReq) → { code } ou { error }.
// Ensuite, le navigateur ouvre le WebSocket /ws/<CODE> et envoie « join » (ou « resume »).
export interface CreateRoomReq { kind: RoomKind; settings: Settings; hostPlays?: boolean; quizToken?: string; challenge?: string; reviewToken?: string; assignment?: string }
/** Défi entre amis : les mêmes questions, jouées chacun quand il veut. */
export interface ChallengeEntry { name: string; correct: number; total: number; timeMs: number; at: number }
export interface ChallengeView { code: string; settings: Settings; by: string; results: ChallengeEntry[] }

// Messages navigateur → serveur
export type ClientMsg =
  | { t: 'join'; name: string; lang: Lang }
  | { t: 'resume'; token: string; lang: Lang }
  | { t: 'quick'; settings: Settings }
  | { t: 'cancelQuick' }
  | { t: 'auth'; token: string }
  | { t: 'challenge' }
  | { t: 'retry' }
  | { t: 'settings'; settings: Settings }
  | { t: 'start' }
  | { t: 'answer'; q: number; value: string }
  | { t: 'next' }
  | { t: 'rematch' }
  | { t: 'kick'; playerId: string }
  | { t: 'lang'; lang: Lang }
  | { t: 'team'; team: number }
  | { t: 'bet'; q: number; pct: number }
  | { t: 'react'; e: number }
  | { t: 'leave' }
  | { t: 'ping' };

// Messages serveur → navigateur
export type ServerMsg =
  | { t: 'joined'; you: string; token: string; host: boolean; room: RoomSnapshot }
  | { t: 'reward'; reward: Reward }
  | { t: 'challenge'; code: string; results?: ChallengeEntry[]; by?: string }
  | { t: 'room'; room: RoomSnapshot }
  | { t: 'question'; q: QuestionMsg }
  | { t: 'feedback'; q: number; correct: boolean; attemptsLeft: number; done: boolean; points: number; value: string; reveal?: Reveal; km?: number }
  | { t: 'progress'; answered: number; total: number }
  | { t: 'reveal'; q: number; reveal: Reveal; results: PlayerRound[]; players: PublicPlayer[]; next: number | null; teams?: TeamScore[]; battle?: { lost: string[]; out: string[] }; chests?: Record<string, ChestResult> }
  | { t: 'wager'; q: number; category: string; ms: number; bets?: Record<string, number> }
  | { t: 'react'; e: number; name: string }
  | { t: 'finished'; players: PublicPlayer[]; recap: RecapItem[]; solo?: { accuracy: number; timeMs: number; correct: number; total: number }; teams?: TeamScore[] }
  | { t: 'quickWaiting' }
  | { t: 'matched'; code: string } // partie rapide : adversaire trouvé, rejoindre /ws/<code>
  | { t: 'kicked' }
  | { t: 'error'; code: string }
  | { t: 'pong' };

// ------------------------------------------------------------------ comptes et progression
export type AgeGroup = 'u13' | '13-17' | '18+';
export const AVATARS = ['🦁', '🐪', '🦊', '🐼', '🐨', '🦉', '🐢', '🐬', '🦜', '🐘', '🦒', '🐧', '🐙', '🦋', '🐝', '🦄', '🐸', '🐯', '🐻', '🐰', '🦓', '🦩', '🐳', '🦖'];
export const BADGES = [
  'first', 'games10', 'games50', 'games200', 'perfect', 'hardHero', 'winner', 'duelWin', 'battleWin',
  'explorer', 'collector', 'streak3', 'streak7', 'flags100', 'morocco', 'polyglot', 'tourney',
] as const;
export const UNLOCK_AT = 60; // % de bonnes réponses pour débloquer la difficulté suivante
export interface CatStats {
  games: number; correct: number; answered: number; best: Partial<Record<'easy' | 'medium' | 'hard', number>>;
  /** Éléments déjà trouvés au moins une fois (pays, régions…) : progression de la page Géographie. */
  found?: string[];
}
/** Ce que le joueur voit de son propre compte. */
export interface Me {
  id: string; pseudo: string; age: AgeGroup; email?: string; country?: string; avatar: string; optin: boolean; createdAt: number;
  xp: number; level: number; levelXp: number; levelNeed: number; title: number;
  games: number; correct: number; answered: number; wins: number; cats: Record<string, CatStats>;
  badges: Record<string, number>; days: { streak: number; best: number }; weekXp: number;
  /** false : compte Google / Facebook sans mot de passe. */
  hasPassword: boolean; linked: string[];
  /** Questions à revoir aujourd'hui ; ligue de la semaine (division 0 = Bronze). */
  reviewDue?: number;
  league?: { div: number; last?: { week: string; div: number; rank: number; size: number; move: 'up' | 'down' | 'stay' } };
  /** Album d'autocollants (id → nombre) et tenue de l'avatar. */
  album?: Record<string, number>;
  look?: import('./stickers').Look;
}
/** Gains d'une partie, envoyés au joueur connecté à la fin. */
export interface Reward {
  xp: number; total: number; level: number; levelUp: boolean; levelXp: number; levelNeed: number; title: number;
  badges: string[]; best?: number; unlocked?: 'medium' | 'hard';
}
