// État de l'application côté navigateur, alimenté par les messages du serveur.
import { createContext, useContext } from 'react';
import type {
  Catalog, ChallengeEntry, ClientMsg, Lang, Me, PublicPlayer, QuestionMsg, Reveal, Reward, RoomSnapshot, ServerMsg, Settings, TeamScore,
} from '../shared/protocol';
import { DEFAULT_SETTINGS } from '../shared/protocol';
import type { T } from './i18n';

export type Screen = 'home' | 'setup' | 'lobby' | 'game' | 'final' | 'quick' | 'myquizzes' | 'editor' | 'quizsheet' | 'admin' | 'profile' | 'leaderboard' | 'signin' | 'geo' | 'oauth' | 'print' | 'challenge' | 'passport' | 'league' | 'classes' | 'classjoin' | 'tournament' | 'today' | 'rankings';

export interface Feedback {
  q: number;
  tried: string[];
  lastBad?: string;
  attemptsLeft: number;
  done: boolean;
  correct: boolean;
  points: number;
  value?: string;
  reveal?: Reveal;
  km?: number;
}

export interface State {
  screen: Screen;
  /** « game » : fiche d'un jeu choisi à l'accueil ; « edit » : réglages depuis la salle d'attente */
  setupKind: 'game' | 'edit';
  game: string;
  room?: RoomSnapshot;
  you?: string;
  isHost: boolean;
  question?: QuestionMsg;
  qAt: number;
  fb?: Feedback;
  /** Réponses de la partie en cours (index → juste ?) : barre de progression et série. */
  hist?: Record<number, boolean>;
  progress?: { answered: number; total: number };
  reveal?: { reveal: Reveal; results: Extract<ServerMsg, { t: 'reveal' }>['results']; players: PublicPlayer[]; next: number | null; at: number; q: number; teams?: TeamScore[]; battle?: { lost: string[]; out: string[] } };
  finished?: Extract<ServerMsg, { t: 'finished' }>;
  error?: string;
  joinCode?: string;
  /** Quiz créé ouvert (éditeur ou fiche) : code, et jeton si on en est le créateur. */
  quiz?: { id: string; token?: string };
  /** Gains de la dernière partie (joueur connecté à son compte). */
  reward?: Reward;
  /** Défi entre amis : code créé ou joué, et son classement à la fin. */
  challenge?: { code: string; results?: ChallengeEntry[]; by?: string };
  /** Défi ouvert par un lien /defi/CODE. */
  challengeCode?: string;
  /** Classe ouverte par un lien /classe/CODE. */
  classCode?: string;
  /** Retour de Google / Facebook pour un nouveau joueur : ticket d'inscription. */
  oauthTicket?: string;
}

export const initialState = (joinCode?: string): State => ({ screen: 'home', setupKind: 'game', game: 'countries', isHost: false, qAt: 0, joinCode });

export type Action =
  | { type: 'server'; msg: ServerMsg }
  | { type: 'go'; screen: Screen; setupKind?: State['setupKind'] }
  | { type: 'openGame'; game: string }
  | { type: 'openQuiz'; screen: Screen; quiz?: { id: string; token?: string } }
  | { type: 'error'; code?: string }
  | { type: 'reset' };

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'go':
      return { ...s, screen: a.screen, setupKind: a.setupKind ?? s.setupKind, error: undefined };
    case 'openQuiz':
      return { ...s, screen: a.screen, quiz: a.quiz, error: undefined };
    case 'openGame':
      return { ...s, screen: 'setup', setupKind: 'game', game: a.game, error: undefined };
    case 'error':
      return { ...s, error: a.code };
    case 'reset':
      return { ...initialState(), screen: 'home', game: s.game };
    case 'server':
      return onServer(s, a.msg);
  }
}

function screenFor(room: RoomSnapshot, cur: Screen): Screen {
  if (room.state === 'lobby') return cur === 'setup' ? 'setup' : 'lobby';
  if (room.state === 'finished') return 'final';
  return 'game';
}

function onServer(s: State, m: ServerMsg): State {
  switch (m.t) {
    case 'joined':
      return { ...s, room: m.room, you: m.you, isHost: m.host, screen: m.room.kind === 'solo' ? 'game' : screenFor(m.room, 'lobby'), error: undefined, joinCode: undefined, reward: undefined, challenge: undefined };
    case 'room': {
      const screen = s.screen === 'home' || s.screen === 'quick' ? s.screen : screenFor(m.room, s.screen);
      return { ...s, room: m.room, isHost: m.room.hostId === s.you, screen: s.room ? screen : s.screen };
    }
    case 'question': {
      const same = s.question?.index === m.q.index && s.room?.state !== 'lobby';
      return {
        ...s, question: m.q, qAt: performance.now(), screen: 'game', reward: m.q.index === 0 ? undefined : s.reward,
        hist: m.q.index === 0 && !same ? {} : s.hist,
        fb: same ? s.fb : undefined, reveal: same ? s.reveal : undefined, progress: same ? s.progress : undefined,
      };
    }
    case 'feedback': {
      const prev = s.fb?.q === m.q ? s.fb : undefined;
      const tried = [...(prev?.tried ?? []), m.value];
      return {
        ...s,
        hist: m.done ? { ...(s.hist ?? {}), [m.q]: m.correct } : s.hist,
        fb: { q: m.q, tried, lastBad: m.correct ? undefined : m.value, attemptsLeft: m.attemptsLeft, done: m.done, correct: m.correct, points: m.points, value: m.value, reveal: m.reveal ?? prev?.reveal, km: m.km },
      };
    }
    case 'progress':
      return { ...s, progress: { answered: m.answered, total: m.total } };
    case 'reveal': {
      const mine = m.results.find((r) => r.id === s.you);
      const hist = mine ? { ...(s.hist ?? {}), [m.q]: mine.correct } : s.hist;
      return { ...s, hist, reveal: { reveal: m.reveal, results: m.results, players: m.players, next: m.next, at: performance.now(), q: m.q, teams: m.teams, battle: m.battle } };
    }
    case 'finished':
      return { ...s, finished: m, screen: 'final' };
    case 'reward':
      return { ...s, reward: m.reward };
    case 'challenge':
      return { ...s, challenge: { code: m.code, results: m.results ?? s.challenge?.results, by: m.by ?? s.challenge?.by } };
    case 'quickWaiting':
      return { ...s, screen: 'quick' };
    case 'kicked':
      return { ...initialState(), error: 'kicked' };
    case 'error':
      if (m.code === 'room.expired') return { ...initialState(), error: s.room ? m.code : undefined };
      if (m.code === 'photos.unavailable' && s.room?.kind === 'solo') return { ...s, room: undefined, question: undefined, screen: 'setup', setupKind: 'game', error: m.code };
      return { ...s, error: m.code };
    default:
      return s;
  }
}

/** Apparence : « kids » ludique et colorée, « classic » épurée (ados et adultes). */
export type Look = 'kids' | 'classic';

export interface Ctx {
  s: State;
  t: T;
  lang: Lang;
  setLang: (l: Lang) => void;
  send: (m: ClientMsg) => void;
  go: (screen: Screen, setupKind?: State['setupKind']) => void;
  openGame: (game: string) => void;
  openQuiz: (screen: Screen, quiz?: { id: string; token?: string }) => void;
  catalog: Catalog | null;
  name: string;
  setName: (n: string) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  leave: () => void;
  fail: (code: string | null) => void;
  look: Look | null; // null : pas encore choisie (premier passage)
  setLook: (l: Look) => void;
  /** Compte joueur (null : invité ou pas encore connecté). */
  me: Me | null;
  auth: string | null;
  signIn: (token: string, me: Me) => void;
  signOut: () => void;
  refreshMe: () => void;
  setMe: (me: Me) => void;
}

export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('gq.settings') ?? '{}') }; } catch { return DEFAULT_SETTINGS; }
}
