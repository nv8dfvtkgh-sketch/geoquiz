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
export type RoomMode = 'classic' | 'battle' | 'teams';
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
  teams?: number; // nombre d'équipes (2 à 4)
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

export interface QOption {
  id: string; // opaque (o0…o3)
  label?: string;
  flag?: string; // jeton d'image
}

export interface QuestionMsg {
  index: number;
  total: number;
  category: CategoryId;
  kind: 'map' | 'mcq' | 'type';
  promptKey: string; // clé i18n
  params: Record<string, string>;
  flag?: string; // jeton d'image de drapeau à afficher
  map?: MapSpec;
  highlight?: string; // entité surlignée (« quel est ce pays ? »)
  shape?: { d: string; w: number; h: number }; // silhouette à deviner (coordonnées recentrées)
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
}

export interface PlayerRound {
  id: string;
  correct: boolean;
  points: number;
  timeMs: number | null;
  attempts: number;
  answer?: string;
}

export interface RecapItem {
  index: number;
  label: string;
  results: PlayerRound[];
}

// Création d'une partie : POST /api/rooms (CreateRoomReq) → { code } ou { error }.
// Ensuite, le navigateur ouvre le WebSocket /ws/<CODE> et envoie « join » (ou « resume »).
export interface CreateRoomReq { kind: RoomKind; settings: Settings; hostPlays?: boolean }

// Messages navigateur → serveur
export type ClientMsg =
  | { t: 'join'; name: string; lang: Lang }
  | { t: 'resume'; token: string; lang: Lang }
  | { t: 'quick'; settings: Settings }
  | { t: 'cancelQuick' }
  | { t: 'settings'; settings: Settings }
  | { t: 'start' }
  | { t: 'answer'; q: number; value: string }
  | { t: 'next' }
  | { t: 'rematch' }
  | { t: 'kick'; playerId: string }
  | { t: 'lang'; lang: Lang }
  | { t: 'leave' }
  | { t: 'ping' };

// Messages serveur → navigateur
export type ServerMsg =
  | { t: 'joined'; you: string; token: string; host: boolean; room: RoomSnapshot }
  | { t: 'room'; room: RoomSnapshot }
  | { t: 'question'; q: QuestionMsg }
  | { t: 'feedback'; q: number; correct: boolean; attemptsLeft: number; done: boolean; points: number; value: string; reveal?: Reveal }
  | { t: 'progress'; answered: number; total: number }
  | { t: 'reveal'; q: number; reveal: Reveal; results: PlayerRound[]; players: PublicPlayer[]; next: number | null; teams?: TeamScore[]; battle?: { lost: string[]; out: string[] } }
  | { t: 'finished'; players: PublicPlayer[]; recap: RecapItem[]; solo?: { accuracy: number; timeMs: number; correct: number; total: number }; teams?: TeamScore[] }
  | { t: 'quickWaiting' }
  | { t: 'matched'; code: string } // partie rapide : adversaire trouvé, rejoindre /ws/<code>
  | { t: 'kicked' }
  | { t: 'error'; code: string }
  | { t: 'pong' };
