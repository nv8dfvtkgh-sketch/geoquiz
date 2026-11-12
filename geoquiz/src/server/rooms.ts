// Moteur de jeu : salles (solo, duel, multijoueur), manches, scores, reconnexion.
// Le serveur fait autorité : il tire les questions, vérifie les réponses et compte les points.
import {
  BATTLE_LIVES, DEFAULT_SETTINGS, LANGS, LIMITS, type TeamScore, type ClientMsg, type Lang, type PlayerRound, type PublicPlayer,
  type QuestionMsg, type RecapItem, type Reveal, type RoomKind, type RoomSnapshot, type RoomState,
  type ServerMsg, type Settings, type Reward, type ChallengeEntry, type ChestResult, REACTIONS,
} from '../shared/protocol';
import { CATEGORIES, customQuestions, dailyQuestions, localize, shuffle, survivalQuestions, type InternalQuestion } from './categories';
import type { QuizContent } from './quizzes';
import { activeEvent, countries, ensureRegion, extras, regionLoaded, zones } from './data';
import { ensurePhotos, ensureSounds, photosLoaded } from './photos';
import type { GameResult } from './accounts';

export interface Conn {
  send(msg: ServerMsg): void;
  room?: Room;
  memberId?: string;
}

/** Réglages modifiables par la plateforme (variable MAX_PLAYERS). */
export const config: {
  maxPlayers: number;
  /** Charge un quiz créé : version validée, ou brouillon si le jeton du créateur est fourni. */
  loadQuiz: (id: string, draftToken?: string) => Promise<QuizContent | null>;
  /** Enregistre la partie d'un joueur connecté à son compte ; renvoie ses gains. */
  recordGame: (accountToken: string, result: GameResult) => Promise<Reward | null>;
  /** Défis entre amis : création, questions (cibles), ajout d'un résultat. */
  createChallenge: (c: ChallengeData) => Promise<string | null>;
  loadChallenge: (code: string) => Promise<ChallengeData | null>;
  addChallengeResult: (code: string, e: ChallengeEntry) => Promise<{ by: string; results: ChallengeEntry[] } | null>;
  /** Révisions : questions à revoir aujourd'hui pour ce compte. */
  loadReview: (accountToken: string) => Promise<{ c: string; t: string; z: string }[]>;
} = {
  loadReview: async () => [],
  maxPlayers: 50, loadQuiz: async () => null, recordGame: async () => null,
  createChallenge: async () => null, loadChallenge: async () => null, addChallengeResult: async () => null,
};
export interface ChallengeData { settings: Settings; items: { target: string; kind: string }[]; by: string; first: ChallengeEntry }
/** Jeux qu'on peut lancer en défi (pas le défi du jour, déjà commun, ni les quiz créés). */
export const challengeable = (cat: string) => cat !== 'daily' && cat !== 'custom';
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans O/0, I/1/L
const GRACE_MS = 600; // latence réseau tolérée après la fin du chrono
const REVEAL_MS = { duel: 3500, room: 5000, solo: 0 };
const WAGER_MS = 12_000;

interface Member {
  id: string;
  token: string;
  name: string;
  lang: Lang;
  role: 'player' | 'host';
  conn: Conn | null;
  score: number;
  streak: number;
  joinedAt: number;
  team?: number;
  lives?: number;
  outAt?: number; // Battle Royale : numéro de la question où le joueur a été éliminé
  auth?: string; // jeton du compte joueur (progression)
  pickTeam?: number; // équipe choisie dans la salle d'attente
  shield?: boolean; // coffre « bouclier » : protégé du prochain vol
  bet?: number; // mise finale (en points)
  reactAt?: number; // dernière réaction envoyée (anti-déluge)
}

interface AnswerState {
  attempts: number;
  done: boolean;
  correct: boolean;
  points: number;
  timeMs: number | null;
  credit: number;
  answer?: string;
  km?: number;
}

interface Round {
  q: InternalQuestion;
  sentAt: number;
  deadline: number | null;
  answers: Map<string, AnswerState>;
  msgByLang: Partial<Record<Lang, QuestionMsg>>;
  revealByLang: Partial<Record<Lang, Reveal>>;
  flagTokens: Record<string, string>;
  buzzed?: string; // mode Buzzer : premier joueur à avoir trouvé
}

// Aléatoire cryptographique standard (disponible dans Node 20+ et dans Cloudflare Workers).
function randomString(len: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}
const id = () => randomString(8);
const secret = () => randomString(24);

/** Code de partie de 6 caractères, sans caractères ambigus. */
export function newCode(taken: (code: string) => boolean = () => false): string {
  for (;;) {
    const code = randomString(6, CODE_ALPHABET);
    if (!taken(code)) return code;
  }
}

export function validSettings(s: any): Settings | null {
  if (!s || typeof s !== 'object') return null;
  const cat = CATEGORIES[s.category];
  const zone = zones.get(s.zone);
  if (!cat || !zone || !cat.zoneKinds.includes(zone.info.kind)) return null;
  const qtype = s.qtype === 'mix' || s.qtype === 'auto' || cat.qtypes.includes(s.qtype) ? s.qtype : 'auto';
  const clamp = (v: any, lo: number, hi: number, d: number) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
  if (cat.id === 'custom' && !(typeof s.quiz === 'string' && /^[A-Z0-9]{6}$/.test(s.quiz))) return null;
  return {
    category: cat.id,
    zone: s.zone,
    difficulty: ['easy', 'medium', 'hard'].includes(s.difficulty) ? s.difficulty : 'easy',
    qtype,
    count: clamp(s.count, LIMITS.minCount, LIMITS.maxCount, DEFAULT_SETTINGS.count),
    timeLimit: clamp(s.timeLimit, LIMITS.minTime, LIMITS.maxTime, DEFAULT_SETTINGS.timeLimit),
    soloMode: s.soloMode === 'timed' ? 'timed' : 'training',
    mode: ['battle', 'teams', 'buzzer'].includes(s.mode) ? s.mode : 'classic',
    quiz: cat.id === 'custom' ? (typeof s.quiz === 'string' && /^[A-Z0-9]{6}$/.test(s.quiz) ? s.quiz : undefined) : undefined,
    teams: clamp(s.teams, 2, 4, 2),
    chests: !!s.chests,
    wager: !!s.wager,
  };
}

function cleanName(name: any): string {
  const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, LIMITS.maxNameLength);
  return n || 'Joueur';
}
const cleanLang = (l: any): Lang => (LANGS.includes(l) ? l : 'fr');

/** Tirage des questions selon les réglages. */
export function drawQuestions(settings: Settings, rnd: () => number = Math.random, avoid: string[] = []): InternalQuestion[] {
  if (settings.category === 'daily') return dailyQuestions();
  if (settings.category === 'survival') return survivalQuestions(rnd);
  const cat = CATEGORIES[settings.category];
  const zone = zones.get(settings.zone)!;
  const strict = cat.pool(zone, settings.difficulty, settings.count);
  let pool = shuffle(strict, rnd);
  if (avoid.length) {
    // Anti-répétition : d'abord les questions jamais vues de ce niveau, puis celles du niveau
    // au-dessus, et seulement ensuite les déjà vues (les plus anciennes en premier).
    const seenAt = new Map(avoid.map((t, i) => [t, i]));
    const next = settings.difficulty === 'easy' ? 'medium' : settings.difficulty === 'medium' ? 'hard' : null;
    const inStrict = new Set(strict);
    const wide = next ? shuffle(cat.pool(zone, next, settings.count).filter((t) => !inStrict.has(t)), rnd) : [];
    const fresh = [...pool, ...wide].filter((t) => !seenAt.has(t));
    const seen = [...pool, ...wide].filter((t) => seenAt.has(t)).sort((a, b) => seenAt.get(a)! - seenAt.get(b)!);
    // Assez de questions neuves au bon niveau : on ne va pas chercher plus dur.
    const freshStrict = pool.filter((t) => !seenAt.has(t));
    pool = freshStrict.length >= settings.count ? freshStrict : [...fresh, ...seen];
  }
  pool = shuffle(pool.slice(0, settings.count), rnd);
  type Kind = 'map' | 'mcq' | 'type';
  // « Selon la difficulté » : facile = 4 choix, moyen = mélange, difficile = réponse à écrire.
  const auto: Record<string, Kind[]> = { easy: ['mcq'], medium: cat.qtypes, hard: ['type'] };
  const wanted: Kind[] = settings.qtype === 'auto' ? auto[settings.difficulty]
    : settings.qtype === 'mix' ? cat.qtypes : [settings.qtype as Kind];
  // Une catégorie sans saisie (Vrai ou faux) reste en QCM même en difficile.
  const supported = wanted.filter((k) => cat.qtypes.includes(k));
  const kinds: Kind[] = supported.length ? supported : (cat.qtypes as Kind[]);
  return pool.map((t, i) => {
    const q = cat.make(t, kinds[(i + Math.floor(rnd() * kinds.length)) % kinds.length], zone, rnd);
    // Hors du niveau difficile, les territoires (Féroé, Jersey, Groenland…) sont grisés sur la
    // carte : ils ne sont jamais demandés et allègent la carte des petites cibles.
    if (settings.difficulty !== 'hard' && q.map?.map === 'world') {
      q.map = { ...q.map, active: q.map.active.filter((id) => id === t || !countries[id]?.dependency) };
    }
    return q;
  });
}

export class Room {
  members = new Map<string, Member>();
  state: RoomState = 'lobby';
  questions: InternalQuestion[] = [];
  qIndex = -1;
  round: Round | null = null;
  recap: { q: InternalQuestion; results: PlayerRound[] }[] = [];
  timer: ReturnType<typeof setTimeout> | null = null;
  tokens = new Map<string, string>(); // jeton d'image → code pays
  emptySince: number | null = null;
  rematchVotes = new Set<string>();
  lastReveal: { q: number; results: PlayerRound[] } | null = null;
  lastBattle: { lost: string[]; out: string[] } | undefined;
  hostId = '';
  pairs: [string, string | null][] = [];
  /** Quiz créé : jeton du créateur quand il teste son brouillon (solo), contenu chargé. */
  quizToken?: string;
  quizContent?: QuizContent;
  /** Défi joué : son code, et ses questions une fois chargées. */
  challenge?: string;
  challengeItems?: ChallengeData['items'];
  /** « Revoir mes erreurs » : questions ratées rejouées (solo). */
  retryQs?: InternalQuestion[];
  retrying = false;
  /** Défi créé à partir de cette partie (solo), pour ne pas en créer deux. */
  madeChallenge?: string;
  /** Questions déjà vues par le joueur dans ce jeu (anti-répétition), puis celles jouées ici. */
  avoid: string[] = [];
  /** Révisions : jeton du compte, et questions chargées. */
  reviewToken?: string;
  reviewItems?: { c: string; t: string; z: string }[];
  /** Devoir de classe joué (« CODE:id ») et tournoi du vendredi. */
  assignment?: string;
  tournament?: boolean;
  /** Salle automatique (tournoi) : lancée toute seule à cette heure, sans hôte qui décide. */
  autoStartAt?: number;
  autoTimer: ReturnType<typeof setTimeout> | null = null;
  /** Mise finale : question concernée, fin du temps pour miser, mises reçues (en %). */
  betting?: { q: number; until: number; pct: Map<string, number>; done: boolean };
  lastChests?: Record<string, ChestResult>;
  /** Programme le lancement automatique (à rappeler à chaque arrivée : les Workers peuvent s'endormir). */
  armAuto() {
    if (!this.autoStartAt || this.state !== 'lobby') return;
    if (this.autoTimer) clearTimeout(this.autoTimer);
    const wait = this.autoStartAt - Date.now();
    if (wait <= 0) { if (this.players().length >= 2) this.start(); return; }
    this.autoTimer = setTimeout(() => { this.autoTimer = null; if (this.state === 'lobby') { if (this.players().length >= 2) this.start(); else { this.autoStartAt = Date.now() + 60_000; this.armAuto(); } } }, wait);
  }

  /** Survie : chaque joueur a 3 vies (en solo, la partie s'arrête quand il n'en a plus). */
  get survival() {
    return this.settings.category === 'survival';
  }
  /** Mode réellement appliqué (seules les salles ont Battle Royale et Équipes). */
  get mode() {
    return this.kind === 'room' ? this.settings.mode ?? 'classic' : 'classic';
  }
  /** Joueurs encore en jeu (Battle Royale : non éliminés). */
  alive() {
    return this.players().filter((p) => (this.mode !== 'battle' && !this.survival) || (p.lives ?? 0) > 0);
  }
  teamScores(): TeamScore[] | undefined {
    if (this.mode !== 'teams' || this.state === 'lobby') return undefined;
    const n = this.settings.teams ?? 2;
    const t = Array.from({ length: n }, (_, id) => ({ id, score: 0, size: 0 }));
    for (const p of this.players()) {
      if (p.team === undefined || !t[p.team]) continue;
      t[p.team].score += Math.round(p.score);
      t[p.team].size++;
    }
    // Moyenne des joueurs : une grande équipe n'est pas avantagée.
    return t.filter((x) => x.size > 0).map((x) => ({ ...x, score: Math.round(x.score / x.size) })).sort((a, b) => b.score - a.score);
  }

  constructor(
    public code: string,
    public kind: RoomKind,
    public settings: Settings,
    public hostPlays: boolean,
    private onDestroy: () => void = () => {},
  ) {}

  get maxPlayers() {
    return this.kind === 'solo' ? 1 : this.kind === 'duel' ? 2 : config.maxPlayers;
  }
  get empty() {
    return this.members.size === 0;
  }
  connected() {
    return [...this.members.values()].some((m) => m.conn);
  }

  /** Jeton opaque pour une image de drapeau : l'URL ne révèle pas le pays. */
  flagToken(iso: string): string {
    const t = `${this.code}.${randomString(10)}`;
    this.tokens.set(t, iso);
    return t;
  }
  resolveImage(token: string): string | null {
    return this.tokens.get(token) ?? null;
  }

  /** Messages d'entrée dans la salle : rejoindre, reprendre sa place, partir. */
  connect(conn: Conn, msg: ClientMsg) {
    if (msg.t === 'join') {
      if (conn.room === this && conn.memberId && this.members.has(conn.memberId)) return;
      const role = this.members.size === 0 && !this.hostPlays ? 'host' : 'player';
      const res = this.addMember(conn, msg.name, msg.lang, role);
      if (typeof res === 'string') return conn.send({ t: 'error', code: res });
      if (this.kind === 'solo' && this.state === 'lobby') this.start();
      if (this.autoStartAt) this.armAuto();
      if (this.kind === 'duel' && this.players().length === 2 && this.state === 'lobby') {
        setTimeout(() => this.state === 'lobby' && this.players().length === 2 && this.start(), 1500);
      }
    } else if (msg.t === 'resume') {
      const m = [...this.members.values()].find((x) => x.token === msg.token);
      if (!m) return conn.send({ t: 'error', code: 'room.expired' });
      m.lang = cleanLang(msg.lang);
      this.attach(m, conn);
    } else if (msg.t === 'leave') {
      this.leave(conn);
    } else {
      this.handle(conn, msg);
    }
  }
  players() {
    return [...this.members.values()].filter((m) => m.role === 'player');
  }

  // ---------------------------------------------------------------- membres
  addMember(conn: Conn, name: string, lang: Lang, role: Member['role']): Member | string {
    if (role === 'player') {
      if (this.players().length >= this.maxPlayers) return 'room.full';
      if (this.state !== 'lobby' && this.kind === 'room') return 'room.started';
      if (this.state !== 'lobby' && this.kind === 'duel') return 'room.full';
    }
    let n = cleanName(name);
    const taken = new Set(this.players().map((p) => p.name.toLowerCase()));
    for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${cleanName(name).slice(0, LIMITS.maxNameLength - 3)} ${i}`;
    const m: Member = { id: id(), token: secret(), name: n, lang: cleanLang(lang), role, conn: null, score: 0, streak: 0, joinedAt: Date.now() };
    this.members.set(m.id, m);
    if (!this.hostId) this.hostId = m.id;
    this.attach(m, conn);
    return m;
  }

  attach(m: Member, conn: Conn) {
    if (m.conn && m.conn !== conn) {
      m.conn.room = undefined;
      m.conn.memberId = undefined;
    }
    m.conn = conn;
    conn.room = this;
    conn.memberId = m.id;
    this.emptySince = null;
    conn.send({ t: 'joined', you: m.id, token: m.token, host: m.id === this.hostId, room: this.snapshot() });
    this.broadcastRoom();
    this.resync(m);
  }

  /** Renvoie l'état en cours à un membre qui (re)arrive. */
  resync(m: Member) {
    const conn = m.conn;
    if (!conn) return;
    if (this.state === 'question' && this.round) {
      conn.send({ t: 'question', q: this.questionFor(m.lang) });
      const a = this.round.answers.get(m.id);
      if (a && (a.attempts || a.done)) {
        conn.send({ t: 'feedback', q: this.qIndex, correct: a.correct, attemptsLeft: this.round.q.attempts - a.attempts, done: a.done, points: a.points, value: a.answer ?? '', reveal: a.done && this.kind === 'solo' ? this.revealFor(m.lang) : undefined });
      }
      this.sendProgress();
    } else if (this.state === 'reveal' && this.round && this.lastReveal) {
      conn.send({ t: 'question', q: this.questionFor(m.lang) });
      conn.send({ t: 'reveal', q: this.qIndex, reveal: this.revealFor(m.lang), results: this.lastReveal.results, players: this.publicPlayers(), next: null, teams: this.teamScores(), battle: this.lastBattle, chests: this.lastChests });
      if (this.betting && !this.betting.done) conn.send({ t: 'wager', q: this.betting.q, category: this.questions[this.betting.q].category, ms: Math.max(0, this.betting.until - Date.now()), bets: Object.fromEntries(this.betting.pct) });
    } else if (this.state === 'finished') {
      conn.send(this.finishedMsg(m.lang));
    }
  }

  detach(conn: Conn) {
    const m = conn.memberId ? this.members.get(conn.memberId) : undefined;
    if (!m || m.conn !== conn) return;
    m.conn = null;
    if (![...this.members.values()].some((x) => x.conn)) this.emptySince = Date.now();
    this.broadcastRoom();
    if (this.state === 'question') this.maybeEndRound();
  }

  leave(conn: Conn) {
    const m = conn.memberId ? this.members.get(conn.memberId) : undefined;
    if (!m) return;
    conn.room = undefined;
    conn.memberId = undefined;
    m.conn = null;
    if (this.state === 'lobby' || m.role === 'host' || this.kind === 'solo') {
      this.members.delete(m.id);
      if (m.id === this.hostId) {
        // L'hôte part : on transmet la main au joueur connecté le plus ancien.
        const next = this.players().filter((p) => p.conn).sort((a, b) => a.joinedAt - b.joinedAt)[0];
        this.hostId = next?.id ?? '';
        if (!next) return this.destroy();
        if (!this.hostPlays) this.hostPlays = true;
        next.conn?.send({ t: 'joined', you: next.id, token: next.token, host: true, room: this.snapshot() });
      }
    }
    if (!this.players().length && this.kind !== 'room') return this.destroy();
    if (this.empty) return this.destroy();
    this.broadcastRoom();
    if (this.state === 'question') this.maybeEndRound();
  }

  kick(by: string, playerId: string) {
    if (this.autoStartAt) return;
    if (by !== this.hostId || playerId === this.hostId) return;
    const m = this.members.get(playerId);
    if (!m) return;
    m.conn?.send({ t: 'kicked' });
    if (m.conn) { m.conn.room = undefined; m.conn.memberId = undefined; }
    this.members.delete(playerId);
    this.broadcastRoom();
    if (this.state === 'question') this.maybeEndRound();
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    if (this.autoTimer) clearTimeout(this.autoTimer);
    for (const m of this.members.values()) if (m.conn) { m.conn.room = undefined; m.conn.memberId = undefined; }
    this.members.clear();
    this.onDestroy();
  }

  // ---------------------------------------------------------------- diffusion
  publicPlayers(): PublicPlayer[] {
    return this.players()
      .map((p) => ({
        id: p.id, name: p.name, score: Math.round(p.score), connected: !!p.conn, lang: p.lang, streak: p.streak,
        team: p.team, lives: p.lives, out: p.lives !== undefined ? p.lives <= 0 : undefined,
        rank: p.lives !== undefined ? [p.lives > 0 ? 1 : 0, p.lives, p.outAt ?? 0] : [0, 0, 0],
      }))
      // Battle Royale : les survivants d'abord, puis les derniers éliminés ; ensuite les points.
      .sort((a, b) => b.rank[0] - a.rank[0] || b.rank[1] - a.rank[1] || b.rank[2] - a.rank[2] || b.score - a.score)
      .map(({ rank, ...p }) => p);
  }
  snapshot(): RoomSnapshot {
    return {
      code: this.code, kind: this.kind, state: this.state, settings: this.settings, hostId: this.hostId, hostPlays: this.hostPlays,
      players: this.publicPlayers(), maxPlayers: this.maxPlayers, qIndex: this.qIndex,
      rematchVotes: this.kind === 'duel' ? [...this.rematchVotes] : undefined,
      teams: this.teamScores(),
      pairs: this.mode === 'battle' && this.state !== 'lobby' ? this.pairs : undefined,
    };
  }
  broadcast(f: (m: Member) => ServerMsg | null) {
    for (const m of this.members.values()) {
      if (!m.conn) continue;
      const msg = f(m);
      if (msg) m.conn.send(msg);
    }
  }
  broadcastRoom() {
    const room = this.snapshot();
    this.broadcast(() => ({ t: 'room', room }));
  }
  sendProgress() {
    if (!this.round) return;
    const players = this.alive();
    const answered = players.filter((p) => this.round!.answers.get(p.id)?.done).length;
    this.broadcast(() => ({ t: 'progress', answered, total: players.length }));
  }

  // ---------------------------------------------------------------- partie
  handle(conn: Conn, msg: ClientMsg) {
    const m = conn.memberId ? this.members.get(conn.memberId) : undefined;
    if (!m) return;
    // Tournoi : personne ne pilote la salle.
    const isHost = m.id === this.hostId && !this.autoStartAt;
    switch (msg.t) {
      case 'settings':
        if (isHost && this.state === 'lobby') {
          const s = validSettings(msg.settings);
          if (s) { this.settings = s; this.broadcastRoom(); }
          else conn.send({ t: 'error', code: 'settings.invalid' });
        }
        break;
      case 'start':
        if (isHost && (this.state === 'lobby' || this.state === 'finished')) this.start();
        break;
      case 'answer':
        if (m.role === 'player') this.answer(m, msg.q, String(msg.value ?? '').slice(0, 80));
        break;
      case 'next':
        if (this.kind === 'solo' && this.state === 'reveal') this.nextQuestion();
        else if (isHost && this.state === 'reveal') this.advance();
        else if (isHost && this.state === 'question' && this.kind === 'room' && !this.hostPlays) this.endRound();
        break;
      case 'rematch':
        this.rematch(m);
        break;
      case 'kick':
        this.kick(m.id, msg.playerId);
        break;
      case 'challenge':
        this.makeChallenge(m);
        break;
      case 'retry':
        if (this.kind === 'solo' && this.state === 'finished') {
          const wrong = this.recap.filter((x) => !x.results[0]?.correct).map((x) => x.q);
          if (wrong.length) { this.retryQs = wrong; this.start(); }
        }
        break;
      case 'auth':
        m.auth = typeof msg.token === 'string' ? msg.token.slice(0, 64) : undefined;
        break;
      case 'team':
        // Salle d'attente : chacun choisit son équipe (mode Équipes).
        if (this.state === 'lobby' && this.mode === 'teams' && m.role === 'player' && Number.isInteger(msg.team) && msg.team >= 0 && msg.team < (this.settings.teams ?? 2)) {
          m.pickTeam = msg.team; m.team = msg.team; this.broadcastRoom();
        }
        break;
      case 'bet':
        if (this.betting && !this.betting.done && msg.q === this.betting.q && m.role === 'player' && [0, 25, 50, 100].includes(msg.pct)) {
          this.betting.pct.set(m.id, msg.pct);
          m.conn?.send({ t: 'wager', q: this.betting.q, category: this.questions[this.betting.q].category, ms: Math.max(0, this.betting.until - Date.now()), bets: Object.fromEntries(this.betting.pct) });
          if (this.alive().filter((p) => p.conn).every((p) => this.betting!.pct.has(p.id))) this.endWager();
        }
        break;
      case 'react': {
        // Réactions : emojis d'une liste fixe, pas plus d'une toutes les 0,7 s par joueur.
        const now = Date.now();
        if (this.kind === 'solo' || !Number.isInteger(msg.e) || msg.e < 0 || msg.e >= REACTIONS.length || now - (m.reactAt ?? 0) < 700) break;
        m.reactAt = now;
        this.broadcast(() => ({ t: 'react', e: msg.e, name: m.name }));
        break;
      }
      case 'lang':
        m.lang = cleanLang(msg.lang);
        this.broadcastRoom();
        this.resync(m);
        break;
    }
  }

  start() {
    // Les cartes de régions se chargent à la demande (fichier ou requête selon la plateforme).
    const region = zones.get(this.settings.zone)?.region;
    if (region && !regionLoaded(region.iso)) {
      ensureRegion(region.iso).then((ok) => (ok ? this.start() : this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'settings.empty' })));
      return;
    }
    // Photos (monuments, stades) et sons : cherchés sur Wikimedia à la première partie.
    const media = CATEGORIES[this.settings.category]?.media;
    if (media && !photosLoaded(media)) {
      const job = media === 'sounds' ? ensureSounds(extras.sounds) : ensurePhotos(extras[media] as { id: string; wiki: string }[], undefined, media);
      job.then((ok) => (ok ? this.start() : this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'photos.unavailable' })));
      return;
    }
    if (this.settings.category === 'review' && !this.reviewItems) {
      config.loadReview(this.reviewToken ?? '').then((items) => {
        this.reviewItems = items;
        if (items.length) this.start();
        else this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'review.empty' });
      }).catch(() => this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'review.empty' }));
      return;
    }
    if (this.challenge && !this.challengeItems) {
      config.loadChallenge(this.challenge).then((c) => {
        if (c) { this.challengeItems = c.items; this.settings = { ...this.settings, ...c.settings, soloMode: this.settings.soloMode }; this.start(); }
        else this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'challenge.notFound' });
      });
      return;
    }
    if (this.settings.category === 'custom' && !this.quizContent) {
      config.loadQuiz(this.settings.quiz!, this.quizToken).then((c) => {
        if (c) { this.quizContent = c; this.start(); }
        else this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'quiz.notFound' });
      });
      return;
    }
    const players = this.players();
    const min = this.kind === 'solo' ? 1 : 2;
    if (players.length < min) return this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'room.notEnough' });
    const retry = this.retryQs;
    this.retryQs = undefined;
    this.retrying = !!retry;
    this.questions = retry ? retry
      : this.quizContent ? customQuestions(this.settings.quiz!, this.quizContent, Math.random)
      : this.challengeItems ? this.challengeQuestions()
      : this.reviewItems ? this.reviewQuestions() : drawQuestions(this.settings, Math.random, this.avoid);
    // Une revanche ne repose pas les mêmes questions.
    if (!retry) this.avoid = [...this.avoid.filter((t) => !this.questions.some((q) => q.target === t)), ...this.questions.map((q) => q.target)].slice(-300);
    this.madeChallenge = undefined;
    if (!this.questions.length) return this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'settings.empty' });
    for (const p of players) { p.score = 0; p.streak = 0; p.team = undefined; p.lives = undefined; p.outAt = undefined; p.shield = undefined; p.bet = undefined; }
    this.betting = undefined;
    this.lastChests = undefined;
    if (this.mode === 'teams') {
      // Chacun garde l'équipe choisie ; les autres complètent les équipes les moins nombreuses.
      const n = Math.min(this.settings.teams ?? 2, players.length);
      const size = Array.from({ length: n }, () => 0);
      for (const p of players) if (p.pickTeam !== undefined && p.pickTeam < n) { p.team = p.pickTeam; size[p.team]++; }
      for (const p of shuffle(players.filter((x) => x.team === undefined), Math.random)) {
        const tm = size.indexOf(Math.min(...size));
        p.team = tm; size[tm]++;
      }
    }
    if (this.mode === 'battle') for (const p of players) p.lives = BATTLE_LIVES;
    // Survie : 3 vies, la partie s'arrête à la troisième erreur.
    if (this.survival && this.mode !== 'battle') for (const p of players) p.lives = BATTLE_LIVES;
    this.lastBattle = undefined;
    this.recap = [];
    this.rematchVotes.clear();
    this.qIndex = -1;
    this.nextQuestion();
  }

  /** Questions d'un défi : mêmes cibles et même type, choix remélangés. */
  challengeQuestions(): InternalQuestion[] {
    const cat = CATEGORIES[this.settings.category];
    const zone = zones.get(this.settings.zone) ?? zones.get('world')!;
    const out: InternalQuestion[] = [];
    for (const it of this.challengeItems ?? []) {
      try { out.push(cat.make(it.target, it.kind as 'map' | 'mcq' | 'type', zone, Math.random)); } catch { /* élément disparu des données */ }
    }
    return out;
  }

  /** Révisions : chaque question revient de son jeu d'origine, en QCM. */
  reviewQuestions(): InternalQuestion[] {
    const out: InternalQuestion[] = [];
    const kept: typeof this.reviewItems = [];
    for (const it of this.reviewItems ?? []) {
      const cat = CATEGORIES[it.c];
      const zone = zones.get(it.z) ?? zones.get('world')!;
      if (!cat || zone.region) continue;
      try { out.push(cat.make(it.t, 'mcq', zone, Math.random)); kept.push(it); } catch { /* élément disparu des données */ }
    }
    this.reviewItems = kept;
    return shuffle(out.map((q, i) => ({ q, i })), Math.random).map(({ q, i }) => { (q as any).reviewIndex = i; return q; });
  }

  /** Solo terminé : crée un défi à partager (ou renvoie celui déjà créé / joué). */
  async makeChallenge(m: Member) {
    if (this.kind !== 'solo' || this.state !== 'finished' || !challengeable(this.settings.category)) return;
    if (this.challenge) return m.conn?.send({ t: 'challenge', code: this.challenge });
    if (this.madeChallenge) return m.conn?.send({ t: 'challenge', code: this.madeChallenge });
    const res = this.recap.map((x) => x.results.find((r) => r.id === m.id));
    const first: ChallengeEntry = {
      name: m.name, correct: res.filter((r) => r?.correct).length, total: this.recap.length,
      timeMs: res.reduce((t, r) => t + (r?.timeMs ?? 0), 0), at: Date.now(),
    };
    const code = await config.createChallenge({
      settings: this.settings, by: m.name, first,
      items: this.questions.map((q) => ({ target: q.target, kind: q.kind })),
    }).catch(() => null);
    if (code) { this.madeChallenge = code; m.conn?.send({ t: 'challenge', code }); }
    else m.conn?.send({ t: 'error', code: 'challenge.failed' });
  }

  rematch(m: Member) {
    if (this.state !== 'finished' || this.autoStartAt) return;
    if (this.kind === 'duel') {
      this.rematchVotes.add(m.id);
      if (this.players().every((p) => this.rematchVotes.has(p.id)) && this.players().length === 2) this.start();
      else this.broadcastRoom();
    } else if (this.kind === 'solo') {
      this.start();
    } else if (m.id === this.hostId) {
      // Salle : retour à la salle d'attente avec les mêmes joueurs.
      this.state = 'lobby';
      this.qIndex = -1;
      this.round = null;
      for (const p of this.players()) { p.score = 0; p.streak = 0; p.team = undefined; p.lives = undefined; p.outAt = undefined; }
      this.pairs = [];
      // On retire les joueurs partis pendant la partie.
      for (const p of this.players()) if (!p.conn && p.id !== this.hostId) this.members.delete(p.id);
      this.broadcastRoom();
    }
  }

  nextQuestion() {
    // Mise en cours : on attend les mises (ou la fin du temps), pas le bouton « suivant ».
    if (this.betting && !this.betting.done && this.qIndex + 1 === this.betting.q) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.qIndex++;
    if (this.qIndex >= this.questions.length) return this.finish();
    if (this.survival && this.players().every((p) => (p.lives ?? 1) <= 0)) return this.finish();
    // Mise finale : avant la dernière question, on montre le thème et chacun mise une part de ses points.
    if (this.settings.wager && this.kind !== 'solo' && this.qIndex === this.questions.length - 1 && this.questions.length > 1 && !this.betting) {
      this.betting = { q: this.qIndex, until: Date.now() + WAGER_MS, pct: new Map(), done: false };
      this.qIndex--;
      this.state = 'reveal';
      const b = this.betting;
      this.broadcast(() => ({ t: 'wager', q: b.q, category: this.questions[b.q].category, ms: WAGER_MS }));
      this.timer = setTimeout(() => this.endWager(), WAGER_MS + GRACE_MS);
      return;
    }
    const q = this.questions[this.qIndex];
    const now = Date.now();
    const timed = this.kind !== 'solo';
    if (this.mode === 'battle') {
      // Duels tirés au hasard parmi les joueurs encore en jeu ; un nombre impair laisse un joueur seul.
      const ids = shuffle(this.alive().map((p) => p.id), Math.random);
      this.pairs = [];
      for (let i = 0; i < ids.length; i += 2) this.pairs.push([ids[i], ids[i + 1] ?? null]);
    }
    const flagTokens: Record<string, string> = {};
    const tok = (iso: string) => (flagTokens[iso] ??= this.flagToken(iso));
    if (q.flagIso) tok(q.flagIso);
    if (q.imageRef) flagTokens[q.imageRef] = this.flagToken(q.imageRef);
    for (const o of q.options ?? []) if (o.flagIso) tok(o.flagIso);
    this.round = {
      q, sentAt: now, deadline: timed ? now + this.settings.timeLimit * 1000 : null,
      answers: new Map(), msgByLang: {}, revealByLang: {}, flagTokens,
    };
    this.state = 'question';
    this.broadcastRoom();
    this.broadcast((m) => ({ t: 'question', q: this.questionFor(m.lang) }));
    this.sendProgress();
    if (timed) this.timer = setTimeout(() => this.endRound(), this.settings.timeLimit * 1000 + GRACE_MS);
  }

  endWager() {
    const b = this.betting;
    if (!b || b.done) return;
    b.done = true;
    for (const p of this.players()) p.bet = Math.round((p.score * (b.pct.get(p.id) ?? 0)) / 100);
    this.nextQuestion();
  }

  /**
   * Coffres surprises : chaque bonne réponse ouvre un coffre (points en plus, doublés, bouclier,
   * vol de points au premier, échange de place avec le joueur juste devant).
   */
  openChests(results: PlayerRound[]): Record<string, ChestResult> {
    const out: Record<string, ChestResult> = {};
    const roll = (): ChestResult['kind'] => {
      const r = Math.random() * 100;
      return r < 28 ? 'plus' : r < 42 ? 'small' : r < 62 ? 'double' : r < 76 ? 'shield' : r < 92 ? 'steal' : 'swap';
    };
    for (const res of shuffle(results.filter((x) => x.correct), Math.random)) {
      const me = this.members.get(res.id);
      if (!me) continue;
      let kind = roll();
      const others = this.players().filter((p) => p.id !== me.id && p.score > me.score);
      if ((kind === 'steal' || kind === 'swap') && !others.length) kind = 'plus';
      if (kind === 'plus') { me.score += 300; out[me.id] = { kind, amount: 300 }; }
      else if (kind === 'small') { me.score += 100; out[me.id] = { kind, amount: 100 }; }
      else if (kind === 'double') { const n = Math.max(100, res.points); me.score += n; out[me.id] = { kind, amount: n }; }
      else if (kind === 'shield') { me.shield = true; out[me.id] = { kind, amount: 0 }; }
      else if (kind === 'steal') {
        const v = others.sort((a, b) => b.score - a.score)[0];
        if (v.shield) { v.shield = false; out[me.id] = { kind: 'blocked', amount: 0, from: v.name }; }
        else { const n = Math.round(v.score * 0.1); v.score -= n; me.score += n; out[me.id] = { kind, amount: n, from: v.name }; }
      } else {
        // Échange avec le joueur juste devant.
        const v = others.sort((a, b) => a.score - b.score)[0];
        const gain = v.score - me.score;
        [v.score, me.score] = [me.score, v.score];
        out[me.id] = { kind: 'swap', amount: gain, from: v.name };
      }
    }
    return out;
  }

  /** Question traduite, sans la réponse. */
  questionFor(lang: Lang): QuestionMsg {
    const r = this.round!;
    const remaining = r.deadline ? Math.max(0, r.deadline - Date.now()) : null;
    const cached = r.msgByLang[lang];
    if (cached) return { ...cached, remaining };
    const q = r.q;
    const msg: QuestionMsg = {
      index: this.qIndex,
      total: this.questions.length,
      category: q.category,
      kind: q.kind,
      promptKey: q.promptKey,
      params: { ...(q.extraParams ?? {}), ...(q.promptName ? { name: localize(q.promptName, lang) } : {}) },
      image: q.imageRef && !q.imageRef.startsWith('wiki:snd:') ? r.flagTokens[q.imageRef] : undefined,
      sound: q.imageRef?.startsWith('wiki:snd:') ? r.flagTokens[q.imageRef] : undefined,
      clues: q.clues?.map((c) => localize(c, lang)),
      kit: q.kit,
      flag: q.flagIso ? r.flagTokens[q.flagIso] : undefined,
      map: q.map,
      highlight: q.highlight,
      shape: q.shape,
      emoji: q.emoji,
      sign: q.sign,
      options: q.options?.map((o) => ({ id: o.id, label: o.label ? localize(o.label, lang) : undefined, flag: o.flagIso ? r.flagTokens[o.flagIso] : undefined })),
      attempts: q.attempts,
      timeLimit: r.deadline ? this.settings.timeLimit * 1000 : null,
      remaining,
    };
    r.msgByLang[lang] = msg;
    return msg;
  }

  revealFor(lang: Lang): Reveal {
    const r = this.round!;
    if (r.revealByLang[lang]) return r.revealByLang[lang]!;
    const q = r.q;
    const rv: Reveal = {
      id: q.kind === 'map' || q.highlight ? q.revealId : undefined,
      optionId: q.revealOption,
      label: localize(q.answer, lang),
      flag: q.revealFlagIso ? (r.flagTokens[q.revealFlagIso] ??= this.flagToken(q.revealFlagIso)) : undefined,
      credit: q.credit,
      point: q.point,
      order: q.order,
    };
    r.revealByLang[lang] = rv;
    return rv;
  }

  answer(m: Member, qi: number, value: string) {
    const r = this.round;
    if (!r || this.state !== 'question' || qi !== this.qIndex) return;
    const now = Date.now();
    if (r.deadline && now > r.deadline + GRACE_MS) return;
    let a = r.answers.get(m.id);
    if (!a) { a = { attempts: 0, done: false, correct: false, points: 0, timeMs: null, credit: 0 }; r.answers.set(m.id, a); }
    if (a.done) return;
    if ((this.mode === 'battle' || this.survival) && (m.lives ?? 0) <= 0) return; // éliminé : il regarde
    a.attempts++;
    // « Où est-ce ? » : points selon la distance, même sans être « juste ».
    const g = r.q.grade ? r.q.grade(value) : { ok: r.q.check(value), credit: 1, km: undefined };
    const ok = g.ok;
    a.answer = r.q.kind === 'type' ? value : undefined;
    if (g.km !== undefined) a.km = g.km;
    if (ok || a.attempts >= r.q.attempts) {
      a.done = true;
      a.correct = ok;
      a.timeMs = now - r.sentAt;
      a.credit = r.q.grade ? g.credit : ok ? [1, 0.5, 0.25][a.attempts - 1] ?? 0.25 : 0;
      if (a.credit > 0) {
        const limit = this.settings.timeLimit * 1000;
        const speed = r.deadline ? Math.max(0, 1 - Math.min(a.timeMs, limit) / limit) : 1;
        a.points = Math.round((500 + 500 * speed) * a.credit);
      }
      if (this.mode === 'buzzer') {
        // Buzzer : seul le premier à trouver marque ; une erreur coûte des points.
        if (ok && !r.buzzed) { r.buzzed = m.id; a.points = 1000; }
        else if (ok) a.points = 0;
        else a.points = -250;
      }
    }
    const solo = this.kind === 'solo';
    m.conn?.send({
      t: 'feedback', q: qi, correct: ok, attemptsLeft: r.q.attempts - a.attempts, done: a.done, points: a.points, value,
      reveal: a.done && solo ? this.revealFor(m.lang) : undefined, km: a.km,
    });
    if (a.done) {
      if (solo) this.endRound();
      else if (this.mode === 'buzzer' && r.buzzed === m.id) {
        // Quelqu'un a trouvé : la manche se termine presque aussitôt.
        this.sendProgress();
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.endRound(), 700);
      } else { this.sendProgress(); this.maybeEndRound(); }
    }
  }

  maybeEndRound() {
    const r = this.round;
    if (!r || this.state !== 'question') return;
    const active = this.alive().filter((p) => p.conn);
    if (active.length && active.every((p) => r.answers.get(p.id)?.done)) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.endRound(), 400);
    }
  }

  endRound() {
    const r = this.round;
    if (!r || this.state !== 'question') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.state = 'reveal';
    const wagerQ = this.betting?.q === this.qIndex;
    const results: PlayerRound[] = this.players().map((p) => {
      const a: AnswerState = r.answers.get(p.id) ?? { attempts: 0, done: true, correct: false, points: 0, timeMs: null, credit: 0 };
      const bet = wagerQ && p.bet ? (a.correct ? p.bet : -p.bet) : undefined;
      p.score = Math.max(0, p.score + a.points + (bet ?? 0));
      if (a.correct) p.streak++; else p.streak = 0;
      if (this.survival && this.mode !== 'battle' && !a.correct && (r.answers.has(p.id) || this.kind !== 'solo') && p.lives !== undefined && p.lives > 0) { p.lives--; if (!p.lives) p.outAt = this.qIndex + 1; }
      return { id: p.id, correct: a.correct, points: a.points, timeMs: a.timeMs, attempts: a.attempts, answer: a.answer, km: a.km, bet };
    });
    const chests = this.settings.chests && this.kind !== 'solo' && this.mode !== 'battle' ? this.openChests(results) : undefined;
    this.lastChests = chests;
    this.recap.push({ q: r.q, results });
    this.lastReveal = { q: this.qIndex, results };
    let battle: { lost: string[]; out: string[] } | undefined;
    if (this.mode === 'battle') battle = this.resolveDuels(results);
    this.lastBattle = battle;
    // Battle Royale : la partie s'arrête quand il ne reste qu'un joueur (ou plus aucun).
    const last = this.qIndex >= this.questions.length - 1 || (this.mode === 'battle' && this.alive().length <= 1)
      || (this.survival && this.players().every((p) => (p.lives ?? 1) <= 0));
    if (this.kind === 'solo') {
      const auto = this.settings.soloMode === 'timed';
      const ok = results[0]?.correct;
      this.broadcastRoom();
      if (auto) this.timer = setTimeout(() => this.nextQuestion(), ok ? 900 : 1800);
      return;
    }
    const wait = REVEAL_MS[this.kind];
    const players = this.publicPlayers();
    this.broadcastRoom();
    const teams = this.teamScores();
    // Un coffre ouvert laisse un peu plus de temps pour voir ce qu'il contient.
    const pause = last ? 1500 : wait + (chests && Object.keys(chests).length ? 1500 : 0);
    this.broadcast((m) => ({ t: 'reveal', q: this.qIndex, reveal: this.revealFor(m.lang), results, players, next: pause, teams, battle, chests }));
    this.timer = setTimeout(() => this.advance(), pause);
  }

  /** Question suivante, ou fin de partie (dernière question, ou un seul survivant). */
  advance() {
    if (this.timer) clearTimeout(this.timer);
    if (this.mode === 'battle' && this.alive().length <= 1 && this.players().length > 1) return this.finish();
    if (this.survival && this.players().every((p) => (p.lives ?? 1) <= 0)) return this.finish();
    this.nextQuestion();
  }

  /**
   * Battle Royale : dans chaque duel, le plus rapide avec la bonne réponse gagne et l'autre
   * perd un cœur ; deux mauvaises réponses font perdre un cœur aux deux. Un joueur seul
   * (nombre impair) ne perd un cœur que s'il se trompe.
   */
  resolveDuels(results: PlayerRound[]) {
    const res = new Map(results.map((r) => [r.id, r]));
    const lost: string[] = [];
    const ok = (id: string) => !!res.get(id)?.correct;
    const time = (id: string) => res.get(id)?.timeMs ?? Infinity;
    for (const [a, b] of this.pairs) {
      if (!b) { if (!ok(a)) lost.push(a); continue; }
      if (ok(a) && ok(b)) lost.push(time(a) <= time(b) ? b : a);
      else if (ok(a)) lost.push(b);
      else if (ok(b)) lost.push(a);
      else lost.push(a, b);
    }
    const out: string[] = [];
    for (const id of lost) {
      const p = this.members.get(id);
      if (!p || p.lives === undefined) continue;
      p.lives = Math.max(0, p.lives - 1);
      if (p.lives === 0) { p.outAt = this.qIndex + 1; out.push(id); }
    }
    // Tout le monde éliminé au même tour : on rend un cœur aux joueurs qui ont tenu le plus longtemps.
    if (this.alive().length === 0) for (const id of out) { const p = this.members.get(id)!; p.lives = 1; p.outAt = undefined; }
    return { lost, out: out.filter((id) => (this.members.get(id)?.lives ?? 0) <= 0) };
  }

  finishedMsg(lang: Lang): ServerMsg {
    const recap: RecapItem[] = this.recap.map((x, i) => ({ index: i, label: localize(x.q.answer, lang), results: x.results, target: x.q.target }));
    let solo;
    if (this.kind === 'solo') {
      const p = this.players()[0];
      const res = this.recap.map((x) => x.results.find((r) => r.id === p?.id));
      const credit = this.recap.reduce((s, x) => s + (x.results[0]?.correct ? [1, 0.5, 0.25][(x.results[0].attempts || 1) - 1] ?? 0.25 : 0), 0);
      solo = {
        accuracy: this.recap.length ? Math.round((credit / this.recap.length) * 100) : 0,
        timeMs: res.reduce((s, x) => s + (x?.timeMs ?? 0), 0),
        correct: res.filter((x) => x?.correct).length,
        total: this.recap.length,
      };
    }
    return { t: 'finished', players: this.publicPlayers(), recap, solo, teams: this.teamScores() };
  }

  finish() {
    this.state = 'finished';
    this.round = null;
    this.broadcastRoom();
    this.broadcast((m) => this.finishedMsg(m.lang));
    this.recordAll();
    // Défi joué : on ajoute le résultat et on renvoie le classement du défi.
    if (this.challenge && this.kind === 'solo' && !this.retrying) {
      const p = this.players()[0];
      if (p) {
        const res = this.recap.map((x) => x.results.find((r) => r.id === p.id));
        const e: ChallengeEntry = { name: p.name, correct: res.filter((r) => r?.correct).length, total: this.recap.length, timeMs: res.reduce((t, r) => t + (r?.timeMs ?? 0), 0), at: Date.now() };
        const code = this.challenge;
        config.addChallengeResult(code, e).then((r) => { if (r) p.conn?.send({ t: 'challenge', code, results: r.results, by: r.by }); }).catch(() => {});
      }
    }
  }

  /** Progression : chaque joueur connecté à un compte reçoit ses gains (XP, badges…). */
  recordAll() {
    const ranking = this.publicPlayers();
    const teams = this.teamScores();
    const bestTeam = teams?.length ? teams[0].id : undefined;
    for (const p of this.players()) {
      if (!p.auth) continue;
      const res = this.recap.map((x) => x.results.find((r) => r.id === p.id));
      const credit = res.reduce((s, x) => s + (x?.correct ? [1, 0.5, 0.25][(x.attempts || 1) - 1] ?? 0.25 : 0), 0);
      const total = this.recap.length;
      const result: GameResult = {
        category: this.settings.category, difficulty: this.settings.difficulty, kind: this.kind, mode: this.mode, zone: this.settings.zone, lang: p.lang,
        total, correct: res.filter((x) => x?.correct).length, accuracy: total ? (credit / total) * 100 : 0,
        rank: ranking.findIndex((x) => x.id === p.id) + 1, players: ranking.length,
        teamWon: this.mode === 'teams' && p.team !== undefined && p.team === bestTeam,
        found: this.recap.filter((x, i) => res[i]?.correct).map((x) => x.q.target),
        timeMs: res.reduce((t, x) => t + (x?.timeMs ?? (this.settings.timeLimit * 1000)), 0),
        assignment: this.assignment, tournament: this.tournament,
        event: this.settings.category === 'event' ? activeEvent()?.id : undefined,
        items: this.recap.map((x, i) => ({
          c: x.q.category, t: x.q.target, ok: !!res[i]?.correct,
          z: this.reviewItems?.[(x.q as any).reviewIndex ?? -1]?.z ?? (this.settings.category === 'daily' ? 'world' : this.settings.zone),
        })),
      };
      config.recordGame(p.auth, result)
        .then((reward) => { if (reward) p.conn?.send({ t: 'reward', reward }); })
        .catch((e) => console.error('progression', e));
    }
  }
}
