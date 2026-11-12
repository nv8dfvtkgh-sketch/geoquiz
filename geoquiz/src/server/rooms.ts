// Moteur de jeu : salles (solo, duel, multijoueur), manches, scores, reconnexion.
// Le serveur fait autorité : il tire les questions, vérifie les réponses et compte les points.
import {
  BATTLE_LIVES, DEFAULT_SETTINGS, LANGS, LIMITS, type TeamScore, type ClientMsg, type Lang, type PlayerRound, type PublicPlayer,
  type QuestionMsg, type RecapItem, type Reveal, type RoomKind, type RoomSnapshot, type RoomState,
  type ServerMsg, type Settings, type Reward,
} from '../shared/protocol';
import { CATEGORIES, customQuestions, localize, shuffle, type InternalQuestion } from './categories';
import type { QuizContent } from './quizzes';
import { countries, ensureRegion, extras, regionLoaded, zones } from './data';
import { ensurePhotos, photosLoaded } from './photos';
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
} = { maxPlayers: 50, loadQuiz: async () => null, recordGame: async () => null };
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans O/0, I/1/L
const GRACE_MS = 600; // latence réseau tolérée après la fin du chrono
const REVEAL_MS = { duel: 3500, room: 5000, solo: 0 };

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
}

interface AnswerState {
  attempts: number;
  done: boolean;
  correct: boolean;
  points: number;
  timeMs: number | null;
  credit: number;
  answer?: string;
}

interface Round {
  q: InternalQuestion;
  sentAt: number;
  deadline: number | null;
  answers: Map<string, AnswerState>;
  msgByLang: Partial<Record<Lang, QuestionMsg>>;
  revealByLang: Partial<Record<Lang, Reveal>>;
  flagTokens: Record<string, string>;
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
    mode: ['battle', 'teams'].includes(s.mode) ? s.mode : 'classic',
    quiz: cat.id === 'custom' ? (typeof s.quiz === 'string' && /^[A-Z0-9]{6}$/.test(s.quiz) ? s.quiz : undefined) : undefined,
    teams: clamp(s.teams, 2, 4, 2),
  };
}

function cleanName(name: any): string {
  const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, LIMITS.maxNameLength);
  return n || 'Joueur';
}
const cleanLang = (l: any): Lang => (LANGS.includes(l) ? l : 'fr');

/** Tirage des questions selon les réglages. */
export function drawQuestions(settings: Settings, rnd: () => number = Math.random): InternalQuestion[] {
  const cat = CATEGORIES[settings.category];
  const zone = zones.get(settings.zone)!;
  const pool = shuffle(cat.pool(zone, settings.difficulty, settings.count), rnd).slice(0, settings.count);
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

  /** Mode réellement appliqué (seules les salles ont Battle Royale et Équipes). */
  get mode() {
    return this.kind === 'room' ? this.settings.mode ?? 'classic' : 'classic';
  }
  /** Joueurs encore en jeu (Battle Royale : non éliminés). */
  alive() {
    return this.players().filter((p) => this.mode !== 'battle' || (p.lives ?? 0) > 0);
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
    return t.filter((x) => x.size > 0).sort((a, b) => b.score - a.score);
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
      conn.send({ t: 'reveal', q: this.qIndex, reveal: this.revealFor(m.lang), results: this.lastReveal.results, players: this.publicPlayers(), next: null, teams: this.teamScores(), battle: this.lastBattle });
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
    const isHost = m.id === this.hostId;
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
      case 'auth':
        m.auth = typeof msg.token === 'string' ? msg.token.slice(0, 64) : undefined;
        break;
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
    // Monuments : les photos libres sont cherchées sur Wikipédia à la première partie.
    if (this.settings.category === 'monuments' && !photosLoaded()) {
      ensurePhotos(extras.monuments).then((ok) => (ok ? this.start() : this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'photos.unavailable' })));
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
    this.questions = this.quizContent ? customQuestions(this.settings.quiz!, this.quizContent, Math.random) : drawQuestions(this.settings);
    if (!this.questions.length) return this.members.get(this.hostId)?.conn?.send({ t: 'error', code: 'settings.empty' });
    for (const p of players) { p.score = 0; p.streak = 0; p.team = undefined; p.lives = undefined; p.outAt = undefined; }
    if (this.mode === 'teams') {
      // Équipes formées au hasard et équilibrées en nombre.
      const n = Math.min(this.settings.teams ?? 2, players.length);
      shuffle(players, Math.random).forEach((p, i) => (p.team = i % n));
    }
    if (this.mode === 'battle') for (const p of players) p.lives = BATTLE_LIVES;
    this.lastBattle = undefined;
    this.recap = [];
    this.rematchVotes.clear();
    this.qIndex = -1;
    this.nextQuestion();
  }

  rematch(m: Member) {
    if (this.state !== 'finished') return;
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
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.qIndex++;
    if (this.qIndex >= this.questions.length) return this.finish();
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
      image: q.imageRef ? r.flagTokens[q.imageRef] : undefined,
      flag: q.flagIso ? r.flagTokens[q.flagIso] : undefined,
      map: q.map,
      highlight: q.highlight,
      shape: q.shape,
      emoji: q.emoji,
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
    if (this.mode === 'battle' && (m.lives ?? 0) <= 0) return; // éliminé : il regarde
    a.attempts++;
    const ok = r.q.check(value);
    a.answer = r.q.kind === 'type' ? value : undefined;
    if (ok || a.attempts >= r.q.attempts) {
      a.done = true;
      a.correct = ok;
      a.timeMs = now - r.sentAt;
      a.credit = ok ? [1, 0.5, 0.25][a.attempts - 1] ?? 0.25 : 0;
      if (ok) {
        const limit = this.settings.timeLimit * 1000;
        const speed = r.deadline ? Math.max(0, 1 - Math.min(a.timeMs, limit) / limit) : 1;
        a.points = Math.round((500 + 500 * speed) * a.credit);
      }
    }
    const solo = this.kind === 'solo';
    m.conn?.send({
      t: 'feedback', q: qi, correct: ok, attemptsLeft: r.q.attempts - a.attempts, done: a.done, points: a.points, value,
      reveal: a.done && solo ? this.revealFor(m.lang) : undefined,
    });
    if (a.done) {
      if (solo) this.endRound();
      else { this.sendProgress(); this.maybeEndRound(); }
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
    const results: PlayerRound[] = this.players().map((p) => {
      const a = r.answers.get(p.id) ?? { attempts: 0, done: true, correct: false, points: 0, timeMs: null, credit: 0 };
      if (a.correct) { p.score += a.points; p.streak++; } else p.streak = 0;
      return { id: p.id, correct: a.correct, points: a.points, timeMs: a.timeMs, attempts: a.attempts, answer: a.answer };
    });
    this.recap.push({ q: r.q, results });
    this.lastReveal = { q: this.qIndex, results };
    let battle: { lost: string[]; out: string[] } | undefined;
    if (this.mode === 'battle') battle = this.resolveDuels(results);
    this.lastBattle = battle;
    // Battle Royale : la partie s'arrête quand il ne reste qu'un joueur (ou plus aucun).
    const last = this.qIndex >= this.questions.length - 1 || (this.mode === 'battle' && this.alive().length <= 1);
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
    this.broadcast((m) => ({ t: 'reveal', q: this.qIndex, reveal: this.revealFor(m.lang), results, players, next: last ? 1500 : wait, teams, battle }));
    this.timer = setTimeout(() => this.advance(), last ? 1500 : wait);
  }

  /** Question suivante, ou fin de partie (dernière question, ou un seul survivant). */
  advance() {
    if (this.timer) clearTimeout(this.timer);
    if (this.mode === 'battle' && this.alive().length <= 1 && this.players().length > 1) return this.finish();
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
    const recap: RecapItem[] = this.recap.map((x, i) => ({ index: i, label: localize(x.q.answer, lang), results: x.results }));
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
      };
      config.recordGame(p.auth, result)
        .then((reward) => { if (reward) p.conn?.send({ t: 'reward', reward }); })
        .catch((e) => console.error('progression', e));
    }
  }
}
