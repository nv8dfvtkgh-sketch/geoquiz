// État de l'application côté navigateur, alimenté par les messages du serveur.
import { createContext, useContext } from 'react';
import type {
  Catalog, ClientMsg, Lang, PublicPlayer, QuestionMsg, Reveal, RoomSnapshot, ServerMsg, Settings,
} from '../shared/protocol';
import { DEFAULT_SETTINGS } from '../shared/protocol';
import type { T } from './i18n';

export type Screen = 'home' | 'setup' | 'lobby' | 'game' | 'final' | 'quick';

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
  progress?: { answered: number; total: number };
  reveal?: { reveal: Reveal; results: Extract<ServerMsg, { t: 'reveal' }>['results']; players: PublicPlayer[]; next: number | null; at: number; q: number };
  finished?: Extract<ServerMsg, { t: 'finished' }>;
  error?: string;
  joinCode?: string;
}

export const initialState = (joinCode?: string): State => ({ screen: 'home', setupKind: 'game', game: 'countries', isHost: false, qAt: 0, joinCode });

export type Action =
  | { type: 'server'; msg: ServerMsg }
  | { type: 'go'; screen: Screen; setupKind?: State['setupKind'] }
  | { type: 'openGame'; game: string }
  | { type: 'error'; code?: string }
  | { type: 'reset' };

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'go':
      return { ...s, screen: a.screen, setupKind: a.setupKind ?? s.setupKind, error: undefined };
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
      return { ...s, room: m.room, you: m.you, isHost: m.host, screen: m.room.kind === 'solo' ? 'game' : screenFor(m.room, 'lobby'), error: undefined, joinCode: undefined };
    case 'room': {
      const screen = s.screen === 'home' || s.screen === 'quick' ? s.screen : screenFor(m.room, s.screen);
      return { ...s, room: m.room, isHost: m.room.hostId === s.you, screen: s.room ? screen : s.screen };
    }
    case 'question': {
      const same = s.question?.index === m.q.index && s.room?.state !== 'lobby';
      return {
        ...s, question: m.q, qAt: performance.now(), screen: 'game',
        fb: same ? s.fb : undefined, reveal: same ? s.reveal : undefined, progress: same ? s.progress : undefined,
      };
    }
    case 'feedback': {
      const prev = s.fb?.q === m.q ? s.fb : undefined;
      const tried = [...(prev?.tried ?? []), m.value];
      return {
        ...s,
        fb: { q: m.q, tried, lastBad: m.correct ? undefined : m.value, attemptsLeft: m.attemptsLeft, done: m.done, correct: m.correct, points: m.points, value: m.value, reveal: m.reveal ?? prev?.reveal },
      };
    }
    case 'progress':
      return { ...s, progress: { answered: m.answered, total: m.total } };
    case 'reveal':
      return { ...s, reveal: { reveal: m.reveal, results: m.results, players: m.players, next: m.next, at: performance.now(), q: m.q } };
    case 'finished':
      return { ...s, finished: m, screen: 'final' };
    case 'quickWaiting':
      return { ...s, screen: 'quick' };
    case 'kicked':
      return { ...initialState(), error: 'kicked' };
    case 'error':
      if (m.code === 'room.expired') return { ...initialState(), error: s.room ? m.code : undefined };
      return { ...s, error: m.code };
    default:
      return s;
  }
}

export interface Ctx {
  s: State;
  t: T;
  lang: Lang;
  setLang: (l: Lang) => void;
  send: (m: ClientMsg) => void;
  go: (screen: Screen, setupKind?: State['setupKind']) => void;
  openGame: (game: string) => void;
  catalog: Catalog | null;
  name: string;
  setName: (n: string) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  leave: () => void;
  fail: (code: string | null) => void;
}

export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function loadSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('gq.settings') ?? '{}') }; } catch { return DEFAULT_SETTINGS; }
}
