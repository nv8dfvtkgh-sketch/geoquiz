// Comptes joueurs et progression (XP, niveaux, badges, étoiles, classement de la semaine).
// Indépendant de la plateforme : même stockage clé-valeur que les quiz créés (fichiers en
// Node, Durable Object « AccountsDO » sur Cloudflare). Tout ce qui rapporte des points est
// calculé ici, à partir des résultats que la salle envoie : le navigateur ne peut pas tricher.
import type { KV } from './quizzes';
import { isUnlocked, LOOK_BY_ID, STICKER_IDS, type Look } from '../shared/stickers';

// ------------------------------------------------------------------ types
import { AVATARS, BADGES, UNLOCK_AT, type AgeGroup, type CatStats, type ChallengeEntry, type ChallengeView, type Me, type Reward, type Settings } from '../shared/protocol';
export { AVATARS, BADGES, UNLOCK_AT };
export type { AgeGroup, CatStats, Me, Reward };

interface ChallengeRecord {
  data: { settings: Settings; items: { target: string; kind: string }[]; by: string; first: ChallengeEntry };
  results: ChallengeEntry[];
  createdAt: number;
}
export const FEEDBACK_TAGS = ['fun', 'learn', 'design', 'multi', 'kids', 'bug', 'hard', 'easy', 'unclear', 'slow', 'more'];
interface FeedbackItem {
  id: string; at: number; rating: number; tags: string[]; comment: string; game: string; games: number;
  lang: string; look: string; device: string; screen: string; pseudo?: string; age?: string;
}
interface DailyRow { correct: number; total: number; timeMs: number; pseudo: string; avatar: string; country?: string }

export interface GameResult {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  kind: 'solo' | 'duel' | 'room';
  mode: 'classic' | 'battle' | 'teams' | 'buzzer';
  zone: string;
  lang: string;
  total: number;
  correct: number;
  accuracy: number; // 0-100, réponses en plusieurs essais comptées en partie
  rank: number; // 1 = premier
  players: number;
  teamWon?: boolean;
  /** Éléments trouvés pendant la partie (pays, régions…). */
  found?: string[];
  /** Temps total de réponse (départage du défi du jour). */
  timeMs?: number;
  /** Devoir d'une classe : « CODE:id ». */
  assignment?: string;
  /** Tournoi du vendredi. */
  tournament?: boolean;
  /** Événement du moment joué (badge si au moins 50 %). */
  event?: string;
  /** Chaque question (jeu, cible, zone, réussie ?) : alimente le mode révision. */
  items?: { c: string; t: string; z: string; ok: boolean }[];
}

/** Révision espacée : on revoit une question ratée après 1, 3, 7, 14 puis 30 jours. */
export const REVIEW_STEPS = [1, 3, 7, 14, 30];
/** Jeux dont les questions peuvent revenir en révision (pas de photo, de son ni de carte de région). */
export const REVIEWABLE = new Set(['flags', 'capitals', 'countries', 'silhouettes', 'currencies', 'languages', 'food', 'animals', 'emoji', 'cinema', 'truefalse',
  'space', 'body', 'dinos', 'football', 'tennis', 'rugby', 'basketball', 'olympics', 'motorsport', 'maroc', 'roadsigns', 'vocab', 'hello', 'kits', 'flagreveal', 'higher', 'timeline']);
interface ReviewItem { c: string; t: string; z: string; step: number; due: number }
/** Ligues : divisions de la semaine, groupes de 20, 5 montent et 5 descendent. */
export const LEAGUE_DIVS = ['bronze', 'silver', 'gold', 'sapphire', 'diamond'] as const;
const LEAGUE_SIZE = 20, LEAGUE_MOVE = 5;
interface LeagueGroup { members: Record<string, { xp: number; pseudo: string; avatar: string; look?: Look }> }

interface Account {
  id: string;
  pseudo: string;
  pass?: { salt: string; hash: string; iter: number }; // absent : compte créé avec Google / Facebook
  oauth?: Partial<Record<Provider, string>>; // identifiant chez le fournisseur
  age: AgeGroup;
  email?: string;
  country?: string;
  avatar: string;
  optin: boolean;
  createdAt: number;
  lastSeen: number;
  xp: number;
  games: number;
  correct: number;
  answered: number;
  wins: number;
  cats: Record<string, CatStats>;
  badges: Record<string, number>;
  days: { last: string; streak: number; best: number };
  langs: string[];
  /** Questions à revoir (clé « jeu|cible »). */
  rev?: Record<string, ReviewItem>;
  /** Ligue : division actuelle, groupe de la semaine, résultat de la semaine passée. */
  league?: { div: number; week?: string; group?: string; last?: { week: string; div: number; rank: number; size: number; move: 'up' | 'down' | 'stay' } };
  /** Classes : celles qu'il anime (prof), celles qu'il a rejointes (élève). */
  teaching?: string[];
  classes?: string[];
  /** Album d'autocollants (id → nombre) et tenue de l'avatar. */
  album?: Record<string, number>;
  look?: Look;
}

// ------------------------------------------------------------------ classes
interface ClassAssignment { id: string; settings: Record<string, unknown>; due?: string; createdAt: number }
interface ClassResult { correct: number; total: number; timeMs: number; at: number; tries: number; best: number }
interface SchoolClass {
  code: string; name: string; level: string; owner: string; ownerPseudo: string; createdAt: number;
  students: Record<string, { pseudo: string; avatar: string; joinedAt: number }>;
  assignments: ClassAssignment[];
  results: Record<string, Record<string, ClassResult>>; // devoir → élève → résultat
}
const CLASS_LIMITS = { classes: 15, students: 60, assignments: 60 };
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class AccountError extends Error {}

// ------------------------------------------------------------------ connexion Google / Facebook
export type Provider = 'google' | 'facebook';
export interface OAuthConfig { google?: { id: string; secret: string }; facebook?: { id: string; secret: string } }
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
interface OAuthProfile { sub: string; email?: string; verified: boolean; name?: string }

function decodeJwtPayload(jwt: string): any {
  const part = jwt.split('.')[1] ?? '';
  const b = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))));
}
/** Propose un pseudo valide à partir du nom donné par Google / Facebook. */
function pseudoFrom(name = ''): string {
  const clean = name.normalize('NFC').replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
  return clean.length >= 3 ? clean : '';
}

// ------------------------------------------------------------------ niveaux et badges
/** XP pour passer du niveau L au niveau L+1. */
const stepXp = (level: number) => 100 + 50 * (level - 1);
export function levelOf(xp: number) {
  let level = 1;
  let rest = xp;
  while (rest >= stepXp(level)) { rest -= stepXp(level); level++; }
  return { level, levelXp: rest, levelNeed: stepXp(level) };
}
/** Titre affiché selon le niveau (clé rank.N côté client). */
export const titleOf = (level: number) => [1, 5, 10, 15, 20, 30, 40, 50].filter((x) => level >= x).length - 1;

const ALL_GAMES = ['countries', 'flags', 'capitals', 'regions', 'silhouettes', 'currencies', 'languages', 'food', 'animals', 'monuments', 'emoji', 'cinema', 'truefalse', 'calc'];

// ------------------------------------------------------------------ outils
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const randomHex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const ITER = 100_000; // maximum accepté par PBKDF2 sur Cloudflare Workers

async function hashPassword(password: string, salt: string, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return b64(bits);
}
function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** Clé d'unicité d'un pseudo : minuscules, sans accents ni espaces. */
const pseudoKey = (p: string) => p.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s_\-]+/g, '');
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Semaine ISO, ex. « 2026-W46 ». */
export function weekOf(t: number) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(n).padStart(2, '0')}`;
}

// Pseudos : lettres (toutes langues), chiffres, espace, _ et -. Pas d'e-mail ni de numéro.
const BANNED = ['merde', 'putain', 'connard', 'conne', 'salope', 'encule', 'nique', 'pute', 'batard', 'fuck', 'shit', 'bitch', 'dick', 'cunt', 'nigger', 'nigga', 'puta', 'mierda', 'cabron', 'pendejo', 'coño', 'زب', 'قحب', 'نيك', 'شرموط', 'كس', 'hitler', 'nazi', 'admin', 'moderat', 'quizellige'];
export function pseudoProblem(p: string): string | null {
  if (!/^[\p{L}\p{N}_\- ]{3,20}$/u.test(p) || p.trim() !== p || /\s{2}/.test(p)) return 'account.pseudoFormat';
  if (/\d{6,}/.test(p)) return 'account.pseudoFormat';
  const k = pseudoKey(p);
  if (BANNED.some((w) => k.includes(pseudoKey(w)))) return 'account.pseudoRefused';
  return null;
}
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

// ------------------------------------------------------------------ service
export class AccountService {
  constructor(private kv: KV, private now = () => Date.now(), private oauth: OAuthConfig = {}, private fetcher: Fetcher = (u, i) => fetch(u, i)) {}

  private async get(id: string) { return this.kv.get<Account>(`acct:${id}`); }
  private async checkPass(a: Account, password: string) {
    return !!a.pass && sameString(await hashPassword(password, a.pass.salt, a.pass.iter), a.pass.hash);
  }
  private async save(a: Account) { await this.kv.put(`acct:${a.id}`, a); }

  private async session(a: Account) {
    const token = randomHex(24);
    await this.kv.put(`sess:${token}`, { id: a.id, exp: this.now() + 90 * 86400000 });
    return token;
  }
  /** Compte associé à un jeton de session (ou null). */
  async byToken(token: unknown): Promise<Account | null> {
    if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) return null;
    const s = await this.kv.get<{ id: string; exp: number }>(`sess:${token}`);
    if (!s || s.exp < this.now()) return null;
    return (await this.get(s.id)) ?? null;
  }

  async register(body: any) {
    const pseudo = String(body?.pseudo ?? '').trim();
    const password = String(body?.password ?? '');
    const age = body?.age as AgeGroup;
    const email = String(body?.email ?? '').trim().toLowerCase();
    const p = pseudoProblem(pseudo);
    if (p) throw new AccountError(p);
    if (password.length < 6 || password.length > 100) throw new AccountError('account.passwordShort');
    if (!['u13', '13-17', '18+'].includes(age)) throw new AccountError('account.ageMissing');
    // E-mail : obligatoire à partir de 13 ans, jamais demandé ni gardé en dessous.
    if (age !== 'u13' && !EMAIL.test(email)) throw new AccountError('account.emailInvalid');
    const key = pseudoKey(pseudo);
    if (await this.kv.get(`pseudo:${key}`)) throw new AccountError('account.pseudoTaken');
    if (age !== 'u13' && (await this.kv.get(`email:${email}`))) throw new AccountError('account.emailTaken');
    const salt = randomHex(16);
    return this.create({ pseudo, pass: { salt, hash: await hashPassword(password, salt), iter: ITER }, age, email, body });
  }

  private async create({ pseudo, pass, age, email, body, oauth }: { pseudo: string; pass?: Account['pass']; age: AgeGroup; email: string; body: any; oauth?: Account['oauth'] }) {
    const key = pseudoKey(pseudo);
    const t = this.now();
    const a: Account = {
      id: randomHex(8), pseudo, pass, oauth, age,
      email: age === 'u13' ? undefined : email,
      country: /^[A-Z]{2}$/.test(body?.country ?? '') ? body.country : undefined,
      avatar: AVATARS.includes(body?.avatar) ? body.avatar : AVATARS[0],
      optin: age !== 'u13' && body?.optin === true,
      createdAt: t, lastSeen: t, xp: 0, games: 0, correct: 0, answered: 0, wins: 0, cats: {}, badges: {},
      days: { last: '', streak: 0, best: 0 }, langs: [],
    };
    await this.kv.put(`pseudo:${key}`, a.id);
    if (a.email) await this.kv.put(`email:${a.email}`, a.id);
    for (const [p, sub] of Object.entries(oauth ?? {})) await this.kv.put(`oauth:${p}:${sub}`, a.id);
    await this.save(a);
    await this.bump('users', 1);
    return { token: await this.session(a), me: await this.me(a) };
  }

  // ---------------------------------------------------------------- Google / Facebook
  providers() { return { google: !!this.oauth.google, facebook: !!this.oauth.facebook }; }

  async oauthStart(provider: Provider, origin: string) {
    const cfg = this.oauth[provider];
    if (!cfg) throw new AccountError('account.providerOff');
    const state = randomHex(16);
    await this.kv.put(`ostate:${state}`, { provider, exp: this.now() + 10 * 60000 });
    const redirect = `${origin}/api/auth/${provider}/callback`;
    if (provider === 'google') {
      return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: cfg.id, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
      });
    }
    return 'https://www.facebook.com/v19.0/dialog/oauth?' + new URLSearchParams({
      client_id: cfg.id, redirect_uri: redirect, response_type: 'code', scope: 'email,public_profile', state,
    });
  }

  private async oauthProfile(provider: Provider, code: string, redirect: string): Promise<OAuthProfile> {
    const cfg = this.oauth[provider]!;
    if (provider === 'google') {
      const r = await this.fetcher('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirect, grant_type: 'authorization_code' }).toString(),
      });
      const j: any = await r.json();
      if (!r.ok || !j.id_token) throw new AccountError('account.providerFailed');
      const p = decodeJwtPayload(j.id_token);
      if (p.aud !== cfg.id || !p.sub) throw new AccountError('account.providerFailed');
      return { sub: String(p.sub), email: p.email ? String(p.email).toLowerCase() : undefined, verified: p.email_verified === true || p.email_verified === 'true', name: p.name };
    }
    const tr = await this.fetcher('https://graph.facebook.com/v19.0/oauth/access_token?' + new URLSearchParams({ client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirect, code }));
    const tj: any = await tr.json();
    if (!tr.ok || !tj.access_token) throw new AccountError('account.providerFailed');
    const mr = await this.fetcher('https://graph.facebook.com/me?' + new URLSearchParams({ fields: 'id,name,email', access_token: tj.access_token }));
    const mj: any = await mr.json();
    if (!mr.ok || !mj.id) throw new AccountError('account.providerFailed');
    // Facebook ne renvoie que des adresses confirmées.
    return { sub: String(mj.id), email: mj.email ? String(mj.email).toLowerCase() : undefined, verified: !!mj.email, name: mj.name };
  }

  /** Retour de Google / Facebook : renvoie l'adresse où rediriger le navigateur. */
  async oauthCallback(provider: Provider, query: URLSearchParams, origin: string): Promise<string> {
    const fail = (code: string) => `${origin}/#autherr=${code}`;
    try {
      const state = query.get('state') ?? '';
      const st = /^[0-9a-f]{32}$/.test(state) ? await this.kv.get<{ provider: string; exp: number }>(`ostate:${state}`) : undefined;
      if (st) await this.kv.delete(`ostate:${state}`);
      if (!st || st.provider !== provider || st.exp < this.now()) return fail('account.providerFailed');
      if (query.get('error') || !query.get('code')) return fail('account.providerCancelled');
      const prof = await this.oauthProfile(provider, query.get('code')!, `${origin}/api/auth/${provider}/callback`);
      // Compte déjà relié, ou même e-mail confirmé : on connecte (et on relie).
      let id = await this.kv.get<string>(`oauth:${provider}:${prof.sub}`);
      if (!id && prof.email && prof.verified) {
        id = await this.kv.get<string>(`email:${prof.email}`);
        const a = id ? await this.get(id) : undefined;
        if (a && a.age !== 'u13') {
          a.oauth = { ...a.oauth, [provider]: prof.sub };
          await this.save(a);
          await this.kv.put(`oauth:${provider}:${prof.sub}`, a.id);
        } else id = undefined;
      }
      const a = id ? await this.get(id) : undefined;
      if (a) {
        a.lastSeen = this.now();
        await this.save(a);
        return `${origin}/#auth=${await this.session(a)}`;
      }
      // Nouveau joueur : il choisit encore son pseudo et sa tranche d'âge.
      const ticket = randomHex(16);
      await this.kv.put(`oticket:${ticket}`, { provider, sub: prof.sub, email: prof.verified ? prof.email : undefined, name: pseudoFrom(prof.name), exp: this.now() + 30 * 60000 });
      return `${origin}/#oauth=${ticket}`;
    } catch (e) {
      if (e instanceof AccountError) return fail(e.message);
      console.error('oauth', e);
      return fail('account.providerFailed');
    }
  }

  async oauthTicket(ticket: string) {
    const t = /^[0-9a-f]{32}$/.test(ticket) ? await this.kv.get<{ provider: Provider; email?: string; name: string; exp: number }>(`oticket:${ticket}`) : undefined;
    if (!t || t.exp < this.now()) throw new AccountError('account.ticketExpired');
    return { provider: t.provider, email: t.email ?? '', name: t.name };
  }

  /** Fin d'inscription avec Google / Facebook (13 ans et plus seulement). */
  async oauthComplete(body: any) {
    const ticket = String(body?.ticket ?? '');
    const t = /^[0-9a-f]{32}$/.test(ticket) ? await this.kv.get<{ provider: Provider; sub: string; email?: string; exp: number }>(`oticket:${ticket}`) : undefined;
    if (!t || t.exp < this.now()) throw new AccountError('account.ticketExpired');
    const pseudo = String(body?.pseudo ?? '').trim();
    const p = pseudoProblem(pseudo);
    if (p) throw new AccountError(p);
    const age = body?.age as AgeGroup;
    if (age !== '13-17' && age !== '18+') throw new AccountError('account.ageMissing');
    const email = (t.email ?? String(body?.email ?? '').trim()).toLowerCase();
    if (!EMAIL.test(email)) throw new AccountError('account.emailInvalid');
    if (await this.kv.get(`pseudo:${pseudoKey(pseudo)}`)) throw new AccountError('account.pseudoTaken');
    if (await this.kv.get(`email:${email}`)) throw new AccountError('account.emailTaken');
    if (await this.kv.get(`oauth:${t.provider}:${t.sub}`)) throw new AccountError('account.pseudoTaken');
    await this.kv.delete(`oticket:${ticket}`);
    return this.create({ pseudo, age, email, body, oauth: { [t.provider]: t.sub } });
  }

  async login(body: any) {
    const key = pseudoKey(String(body?.pseudo ?? ''));
    const password = String(body?.password ?? '');
    // Protection contre les essais en rafale : 10 échecs → 10 minutes d'attente.
    const lockKey = `fail:${key}`;
    const fail = (await this.kv.get<{ n: number; until: number }>(lockKey)) ?? { n: 0, until: 0 };
    if (fail.until > this.now()) throw new AccountError('account.locked');
    const id = key && (await this.kv.get<string>(`pseudo:${key}`));
    const a = id ? await this.get(id) : undefined;
    const ok = !!a && (await this.checkPass(a, password));
    if (!ok || !a) {
      fail.n++;
      if (fail.n >= 10) { fail.until = this.now() + 10 * 60000; fail.n = 0; }
      await this.kv.put(lockKey, fail);
      throw new AccountError('account.wrong');
    }
    if (fail.n) await this.kv.delete(lockKey);
    a.lastSeen = this.now();
    await this.save(a);
    return { token: await this.session(a), me: await this.me(a) };
  }

  async logout(token: string) { await this.kv.delete(`sess:${token}`); }

  async me(a: Account): Promise<Me> {
    const lv = levelOf(a.xp);
    const lb = await this.kv.get<Record<string, { xp: number }>>(`lb:${weekOf(this.now())}`);
    if (await this.settleLeague(a)) await this.save(a);
    return {
      id: a.id, pseudo: a.pseudo, age: a.age, email: a.email, country: a.country, avatar: a.avatar, optin: a.optin, createdAt: a.createdAt,
      xp: a.xp, ...lv, title: titleOf(lv.level), games: a.games, correct: a.correct, answered: a.answered, wins: a.wins,
      cats: a.cats, badges: a.badges, days: { streak: a.days.streak, best: a.days.best }, weekXp: lb?.[a.id]?.xp ?? 0,
      hasPassword: !!a.pass, linked: Object.keys(a.oauth ?? {}),
      reviewDue: this.dueItems(a).length,
      league: { div: a.league?.div ?? 0, last: a.league?.last },
      album: a.album ?? {}, look: a.look,
    };
  }

  // ---------------------------------------------------------------- révision
  private today() { return Math.floor(this.now() / 86400000); }
  dueItems(a: Account) {
    const today = this.today();
    return Object.values(a.rev ?? {}).filter((r) => r.due <= today).sort((x, y) => x.due - y.due);
  }
  /** Questions à revoir aujourd'hui (au plus 15) pour la partie « Révisions ». */
  async reviewDue(token: string) {
    const a = await this.byToken(token);
    return a ? this.dueItems(a).slice(0, 15).map(({ c, t, z }) => ({ c, t, z })) : [];
  }
  private updateReview(a: Account, items: GameResult['items']) {
    if (!Array.isArray(items)) return;
    const today = this.today();
    a.rev ??= {};
    for (const it of items.slice(0, 60)) {
      if (!it || typeof it.c !== 'string' || typeof it.t !== 'string' || !REVIEWABLE.has(it.c) || it.t.length > 80) continue;
      const key = `${it.c}|${it.t}`;
      const cur = a.rev[key];
      if (!it.ok) a.rev[key] = { c: it.c, t: it.t, z: typeof it.z === 'string' ? it.z.slice(0, 24) : 'world', step: 0, due: today + REVIEW_STEPS[0] };
      else if (cur && cur.due <= today) {
        const step = cur.step + 1;
        if (step >= REVIEW_STEPS.length) delete a.rev[key];
        else a.rev[key] = { ...cur, step, due: today + REVIEW_STEPS[step] };
      }
    }
    // Au plus 300 questions suivies : on oublie les plus anciennes.
    const keys = Object.keys(a.rev);
    if (keys.length > 300) for (const k of keys.sort((x, y) => a.rev![x].due - a.rev![y].due).slice(0, keys.length - 300)) delete a.rev[k];
  }

  // ---------------------------------------------------------------- ligues
  /** Nouvelle semaine : on clôt le groupe de la semaine passée (montée, descente). */
  private async settleLeague(a: Account): Promise<boolean> {
    const lg = a.league;
    const week = weekOf(this.now());
    if (!lg?.week || lg.week === week || !lg.group) return false;
    const g = await this.kv.get<LeagueGroup>(lg.group);
    const rows = Object.entries(g?.members ?? {}).sort((x, y) => y[1].xp - x[1].xp);
    const rank = rows.findIndex(([id]) => id === a.id) + 1;
    const size = rows.length;
    let move: 'up' | 'down' | 'stay' = 'stay';
    if (rank > 0 && rank <= LEAGUE_MOVE && size >= 2 && lg.div < LEAGUE_DIVS.length - 1) move = 'up';
    else if (rank > 0 && size >= 10 && rank > size - LEAGUE_MOVE && lg.div > 0) move = 'down';
    const div = lg.div + (move === 'up' ? 1 : move === 'down' ? -1 : 0);
    a.league = { div, last: { week: lg.week, div: lg.div, rank, size, move } };
    return true;
  }
  /** XP gagnés : ajoutés au groupe de la semaine (créé ou rejoint au premier gain). */
  private async addLeagueXp(a: Account, xp: number) {
    await this.settleLeague(a);
    const week = weekOf(this.now());
    a.league ??= { div: 0 };
    if (a.league.week !== week || !a.league.group) {
      const div = a.league.div;
      const idxKey = `lgi:${week}:${div}`;
      let n = (await this.kv.get<number>(idxKey)) ?? 0;
      let key = `lg:${week}:${div}:${n}`;
      const cur = await this.kv.get<LeagueGroup>(key);
      if (!cur || Object.keys(cur.members).length >= LEAGUE_SIZE) { n = cur ? n + 1 : n; key = `lg:${week}:${div}:${n}`; await this.kv.put(idxKey, n); }
      a.league = { ...a.league, week, group: key };
    }
    const g = (await this.kv.get<LeagueGroup>(a.league.group!)) ?? { members: {} };
    g.members[a.id] = { xp: (g.members[a.id]?.xp ?? 0) + xp, pseudo: a.pseudo, avatar: a.avatar, look: a.look };
    await this.kv.put(a.league.group!, g);
  }
  async leagueView(token: string) {
    const a = await this.byToken(token);
    if (!a) return null;
    if (await this.settleLeague(a)) await this.save(a);
    const week = weekOf(this.now());
    const g = a.league?.week === week && a.league.group ? await this.kv.get<LeagueGroup>(a.league.group) : null;
    const rows = Object.entries(g?.members ?? {}).sort((x, y) => y[1].xp - x[1].xp).map(([id, v], i) => ({ id, rank: i + 1, ...v }));
    // Fin de semaine : lundi 00:00 UTC.
    const d = new Date(this.now());
    const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
    return { week, div: a.league?.div ?? 0, rows, me: a.id, up: LEAGUE_MOVE, down: rows.length >= 10 ? LEAGUE_MOVE : 0, endsAt: end, last: a.league?.last };
  }

  async update(a: Account, body: any) {
    if (body?.avatar !== undefined && AVATARS.includes(body.avatar)) a.avatar = body.avatar;
    if (body?.look !== undefined && typeof body.look === 'object') {
      // Tenue : seulement des objets débloqués, chacun à sa place.
      const lv = levelOf(a.xp).level;
      const look: Look = {};
      for (const slot of ['hat', 'pin', 'frame'] as const) {
        const it = LOOK_BY_ID[body.look?.[slot]];
        if (it && it.slot === slot && isUnlocked(it.u, { level: lv, games: a.games, badges: a.badges, album: a.album })) look[slot] = it.id;
      }
      a.look = look;
    }
    if (body?.country !== undefined) a.country = /^[A-Z]{2}$/.test(body.country ?? '') ? body.country : undefined;
    if (body?.optin !== undefined && a.age !== 'u13') a.optin = body.optin === true;
    if (body?.email !== undefined && a.age !== 'u13') {
      const email = String(body.email).trim().toLowerCase();
      if (!EMAIL.test(email)) throw new AccountError('account.emailInvalid');
      if (email !== a.email) {
        if (await this.kv.get(`email:${email}`)) throw new AccountError('account.emailTaken');
        if (a.email) await this.kv.delete(`email:${a.email}`);
        a.email = email;
        await this.kv.put(`email:${email}`, a.id);
      }
    }
    if (body?.newPassword !== undefined) {
      const np = String(body.newPassword);
      // Compte Google / Facebook sans mot de passe : on peut en créer un sans l'ancien.
      if (a.pass && !(await this.checkPass(a, String(body?.password ?? '')))) throw new AccountError('account.wrong');
      if (np.length < 6 || np.length > 100) throw new AccountError('account.passwordShort');
      const salt = randomHex(16);
      a.pass = { salt, hash: await hashPassword(np, salt), iter: ITER };
    }
    await this.save(a);
    return this.me(a);
  }

  /** Suppression définitive (droit à l'effacement) : il faut le mot de passe, ou le pseudo pour un compte Google / Facebook. */
  async remove(a: Account, password: string) {
    const ok = a.pass ? await this.checkPass(a, password) : password.trim().toLowerCase() === a.pseudo.toLowerCase();
    if (!ok) throw new AccountError('account.wrong');
    await this.purge(a);
  }
  private async purge(a: Account) {
    await this.kv.delete(`acct:${a.id}`);
    await this.kv.delete(`pseudo:${pseudoKey(a.pseudo)}`);
    if (a.email) await this.kv.delete(`email:${a.email}`);
    for (const [p, sub] of Object.entries(a.oauth ?? {})) await this.kv.delete(`oauth:${p}:${sub}`);
    for (const k of await this.kv.list('sess:')) {
      const s = await this.kv.get<{ id: string }>(k);
      if (s?.id === a.id) await this.kv.delete(k);
    }
    const wk = `lb:${weekOf(this.now())}`;
    const lb = await this.kv.get<Record<string, unknown>>(wk);
    if (lb?.[a.id]) { delete lb[a.id]; await this.kv.put(wk, lb); }
    await this.bump('users', -1);
  }

  // ---------------------------------------------------------------- progression
  /** Enregistre une partie terminée et renvoie ce que le joueur a gagné. */
  async record(token: string, r: GameResult): Promise<Reward | null> {
    const a = await this.byToken(token);
    if (!a || !r || !(r.total > 0)) return null;
    const total = Math.min(100, Math.max(0, Math.floor(r.total)));
    const correct = Math.min(total, Math.max(0, Math.floor(r.correct)));
    const accuracy = Math.min(100, Math.max(0, Math.round(r.accuracy)));
    const diff = (['easy', 'medium', 'hard'] as const).includes(r.difficulty) ? r.difficulty : 'easy';
    const before = levelOf(a.xp).level;
    const won = r.players >= 2 && (r.rank === 1 || r.teamWon === true);

    // XP : bonnes réponses × difficulté, bonus de fin, de victoire et de sans-faute.
    const mult = { easy: 1, medium: 1.25, hard: 1.5 }[diff];
    let xp = Math.round(correct * 10 * mult) + (total >= 5 ? 10 : 0);
    if (won) xp += 15 + Math.min(30, r.players * 3);
    if (accuracy === 100 && total >= 10) xp += 25;
    xp = Math.min(xp, 600);

    a.xp += xp;
    a.games++;
    a.correct += correct;
    a.answered += total;
    if (won) a.wins++;
    const c = (a.cats[r.category] ??= { games: 0, correct: 0, answered: 0, best: {} });
    c.games++;
    c.correct += correct;
    c.answered += total;
    // Page Géographie : on retient chaque élément trouvé au moins une fois.
    if (Array.isArray(r.found) && r.found.length) {
      const set = new Set(c.found ?? []);
      for (const id of r.found.slice(0, 300)) if (typeof id === 'string' && id.length <= 24) set.add(id);
      c.found = [...set].slice(0, 2000);
    }
    // Meilleur score par difficulté : seulement sur des parties d'au moins 5 questions.
    let best: number | undefined;
    let unlocked: Reward['unlocked'];
    if (total >= 5) {
      const prev = c.best[diff] ?? 0;
      if (accuracy > prev) {
        c.best[diff] = accuracy;
        best = accuracy;
        if (prev < UNLOCK_AT && accuracy >= UNLOCK_AT && diff !== 'hard') unlocked = diff === 'easy' ? 'medium' : 'hard';
      }
    }
    // Jours d'affilée.
    const today = dayOf(this.now());
    if (a.days.last !== today) {
      const yesterday = dayOf(this.now() - 86400000);
      a.days.streak = a.days.last === yesterday ? a.days.streak + 1 : 1;
      a.days.best = Math.max(a.days.best, a.days.streak);
      a.days.last = today;
    }
    if (r.lang && !a.langs.includes(r.lang)) a.langs = [...a.langs, r.lang].slice(0, 8);
    this.updateReview(a, r.items);
    if (typeof r.assignment === 'string' && /^[A-Z0-9]{6}:[0-9a-f]{8}$/.test(r.assignment)) await this.recordAssignment(a, r.assignment, correct, total, Math.round(r.timeMs ?? 0));
    if (xp > 0) await this.addLeagueXp(a, xp);
    a.lastSeen = this.now();

    // Badges.
    const got: string[] = [];
    const give = (id: string, cond: boolean) => { if (cond && !a.badges[id]) { a.badges[id] = this.now(); got.push(id); } };
    give('first', a.games >= 1);
    give('games10', a.games >= 10);
    give('games50', a.games >= 50);
    give('games200', a.games >= 200);
    give('perfect', accuracy === 100 && total >= 10);
    give('hardHero', diff === 'hard' && accuracy >= 80 && total >= 10);
    give('winner', r.kind === 'room' && r.players >= 3 && r.rank === 1);
    give('duelWin', r.kind === 'duel' && r.rank === 1 && r.players >= 2);
    give('battleWin', r.mode === 'battle' && r.rank === 1 && r.players >= 3);
    const played = Object.keys(a.cats).filter((k) => ALL_GAMES.includes(k));
    give('explorer', played.length >= 5);
    give('collector', ALL_GAMES.every((k) => a.cats[k]));
    give('streak3', a.days.streak >= 3);
    give('streak7', a.days.streak >= 7);
    give('flags100', (a.cats.flags?.correct ?? 0) >= 100);
    give('morocco', r.category === 'regions' && r.zone.startsWith('r:MA:') && accuracy === 100 && total >= 5);
    give('polyglot', a.langs.length >= 3);
    give('tourney', r.tournament === true && r.rank === 1 && r.players >= 3);
    if (typeof r.event === 'string' && /^[a-z0-9]{3,24}$/.test(r.event)) give(`ev_${r.event}`, accuracy >= 50 && total >= 5);

    await this.save(a);
    // Classement de la semaine.
    const wk = `lb:${weekOf(this.now())}`;
    const lb = (await this.kv.get<Record<string, { xp: number; pseudo: string; avatar: string; country?: string; look?: Look }>>(wk)) ?? {};
    lb[a.id] = { xp: (lb[a.id]?.xp ?? 0) + xp, pseudo: a.pseudo, avatar: a.avatar, country: a.country, look: a.look };
    await this.kv.put(wk, lb);
    // Défi du jour : seule la première partie du jour compte au classement.
    if (r.category === 'daily' && r.kind === 'solo') {
      const dk = `daily:${today}`;
      const board = (await this.kv.get<Record<string, DailyRow>>(dk)) ?? {};
      if (!board[a.id]) {
        board[a.id] = { correct, total, timeMs: Math.max(0, Math.round(r.timeMs ?? 0)), pseudo: a.pseudo, avatar: a.avatar, country: a.country };
        await this.kv.put(dk, board);
        // On ne garde que les 8 derniers jours.
        for (const k of (await this.kv.list('daily:')).sort().slice(0, -8)) await this.kv.delete(k);
      }
    }
    await this.bump('games', 1, r.category);

    const lv = levelOf(a.xp);
    return { xp, total: a.xp, ...lv, levelUp: lv.level > before, title: titleOf(lv.level), badges: got, best, unlocked };
  }

  /** Classement du défi du jour : bonnes réponses, puis le plus rapide. */
  async daily(token: string | null) {
    const day = dayOf(this.now());
    const board = (await this.kv.get<Record<string, DailyRow>>(`daily:${day}`)) ?? {};
    const rows = Object.entries(board)
      .sort((x, y) => y[1].correct - x[1].correct || x[1].timeMs - y[1].timeMs)
      .map(([id, v], i) => ({ id, rank: i + 1, ...v }));
    const me = token ? await this.byToken(token) : null;
    return { day, players: rows.length, top: rows.slice(0, 30), me: me ? rows.find((r) => r.id === me.id) ?? null : null };
  }

  async leaderboard(token: string | null, country?: string) {
    const week = weekOf(this.now());
    const lb = (await this.kv.get<Record<string, { xp: number; pseudo: string; avatar: string; country?: string }>>(`lb:${week}`)) ?? {};
    const rows = Object.entries(lb)
      .filter(([, v]) => !country || v.country === country)
      .sort((x, y) => y[1].xp - x[1].xp)
      .map(([id, v], i) => ({ id, rank: i + 1, ...v }));
    const me = token ? await this.byToken(token) : null;
    return { week, top: rows.slice(0, 50), me: me ? rows.find((r) => r.id === me.id) ?? null : null };
  }

  // ---------------------------------------------------------------- statistiques et admin
  private async bump(field: 'users' | 'games', n: number, cat?: string) {
    const s = (await this.kv.get<{ users: number; games: number; cats: Record<string, number>; days: Record<string, number> }>('stats')) ?? { users: 0, games: 0, cats: {}, days: {} };
    s[field] = Math.max(0, (s[field] ?? 0) + n);
    if (cat) {
      s.cats[cat] = (s.cats[cat] ?? 0) + 1;
      const d = dayOf(this.now());
      s.days[d] = (s.days[d] ?? 0) + 1;
      // On garde 60 jours.
      for (const k of Object.keys(s.days).sort().slice(0, -60)) delete s.days[k];
    }
    await this.kv.put('stats', s);
  }

  // ---------------------------------------------------------------- classes (espace prof)
  private async cls(code: string) { return /^[A-Z0-9]{6}$/.test(code) ? (await this.kv.get<SchoolClass>(`cl:${code}`)) ?? null : null; }
  private cleanText(v: unknown, n: number) { return String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n); }
  private assignmentSettings(s: any) {
    const cat = this.cleanText(s?.category, 24);
    if (!/^[a-z]+$/.test(cat) || ['custom', 'daily', 'review'].includes(cat)) throw new AccountError('class.badGame');
    const zone = /^[a-zA-Z0-9:\-]{1,24}$/.test(String(s?.zone ?? '')) ? String(s.zone) : 'world';
    const difficulty = ['easy', 'medium', 'hard'].includes(s?.difficulty) ? s.difficulty : 'easy';
    const count = Math.min(30, Math.max(5, Math.round(Number(s?.count) || 10)));
    return { category: cat, zone, difficulty, qtype: 'auto', count, timeLimit: 20, soloMode: 'training' };
  }
  async createClass(a: Account, b: any) {
    if (a.age !== '18+') throw new AccountError('class.adultsOnly');
    if ((a.teaching ?? []).length >= CLASS_LIMITS.classes) throw new AccountError('class.tooMany');
    const name = this.cleanText(b?.name, 40);
    if (name.length < 2) throw new AccountError('class.name');
    let code = '';
    do code = [...crypto.getRandomValues(new Uint8Array(6))].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
    while (await this.kv.get(`cl:${code}`));
    const c: SchoolClass = { code, name, level: this.cleanText(b?.level, 12), owner: a.id, ownerPseudo: a.pseudo, createdAt: this.now(), students: {}, assignments: [], results: {} };
    await this.kv.put(`cl:${code}`, c);
    a.teaching = [...(a.teaching ?? []), code];
    await this.save(a);
    return { code };
  }
  /** Vue d'ensemble : classes animées et classes rejointes (avec les devoirs et mes résultats). */
  async myClasses(a: Account) {
    const teaching = [];
    for (const code of a.teaching ?? []) {
      const c = await this.cls(code);
      if (c) teaching.push({ code, name: c.name, level: c.level, students: Object.keys(c.students).length, assignments: c.assignments.length });
    }
    const joined = [];
    for (const code of a.classes ?? []) {
      const c = await this.cls(code);
      if (!c || !c.students[a.id]) continue;
      joined.push({
        code, name: c.name, level: c.level, teacher: c.ownerPseudo,
        assignments: c.assignments.map((x) => ({ id: x.id, settings: x.settings, due: x.due, mine: c.results[x.id]?.[a.id] ?? null })).reverse(),
      });
    }
    return { teaching, joined, canTeach: a.age === '18+' };
  }
  async classDetail(a: Account, code: string) {
    const c = await this.cls(code);
    if (!c || c.owner !== a.id) throw new AccountError('class.notFound');
    return c;
  }
  async classPublic(code: string) {
    const c = await this.cls(code);
    return c ? { code, name: c.name, level: c.level, teacher: c.ownerPseudo } : null;
  }
  async joinClass(a: Account, code: string) {
    const c = await this.cls(code);
    if (!c) throw new AccountError('class.notFound');
    if (c.owner === a.id) throw new AccountError('class.own');
    if (!c.students[a.id] && Object.keys(c.students).length >= CLASS_LIMITS.students) throw new AccountError('class.full');
    c.students[a.id] = { pseudo: a.pseudo, avatar: a.avatar, joinedAt: c.students[a.id]?.joinedAt ?? this.now() };
    await this.kv.put(`cl:${code}`, c);
    if (!(a.classes ?? []).includes(code)) { a.classes = [...(a.classes ?? []), code].slice(-10); await this.save(a); }
    return { code, name: c.name };
  }
  async leaveClass(a: Account, code: string) {
    const c = await this.cls(code);
    if (c) { delete c.students[a.id]; await this.kv.put(`cl:${code}`, c); }
    a.classes = (a.classes ?? []).filter((x) => x !== code);
    await this.save(a);
  }
  async removeStudent(a: Account, code: string, sid: string) {
    const c = await this.classDetail(a, code);
    delete c.students[sid];
    await this.kv.put(`cl:${code}`, c);
  }
  async assign(a: Account, code: string, b: any) {
    const c = await this.classDetail(a, code);
    if (c.assignments.length >= CLASS_LIMITS.assignments) throw new AccountError('class.tooMany');
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b?.due ?? '')) ? String(b.due) : undefined;
    const x: ClassAssignment = { id: randomHex(4), settings: this.assignmentSettings(b?.settings), due, createdAt: this.now() };
    c.assignments.push(x);
    await this.kv.put(`cl:${code}`, c);
    return x;
  }
  async unassign(a: Account, code: string, id: string) {
    const c = await this.classDetail(a, code);
    c.assignments = c.assignments.filter((x) => x.id !== id);
    delete c.results[id];
    await this.kv.put(`cl:${code}`, c);
  }
  async deleteClass(a: Account, code: string) {
    await this.classDetail(a, code);
    await this.kv.delete(`cl:${code}`);
    a.teaching = (a.teaching ?? []).filter((x) => x !== code);
    await this.save(a);
  }
  async classCsv(a: Account, code: string) {
    const c = await this.classDetail(a, code);
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['eleve', ...c.assignments.map((x) => `${x.settings.category} (${x.createdAt ? new Date(x.createdAt).toISOString().slice(0, 10) : ''})`)];
    const lines = Object.entries(c.students).map(([id, s]) => [s.pseudo, ...c.assignments.map((x) => {
      const r = c.results[x.id]?.[id];
      return r ? `${r.correct}/${r.total}` : '';
    })].map(cell).join(','));
    return '\ufeff' + [head.map(cell).join(','), ...lines].join('\r\n');
  }
  /** Fin d'une partie de devoir : premier score gardé, meilleur score à côté. */
  private async recordAssignment(a: Account, ref: string, correct: number, total: number, timeMs: number) {
    const [code, id] = ref.split(':');
    const c = await this.cls(code ?? '');
    if (!c || !c.students[a.id] || !c.assignments.some((x) => x.id === id)) return;
    const cur = c.results[id]?.[a.id];
    const pct = total ? Math.round((correct / total) * 100) : 0;
    c.results[id] ??= {};
    c.results[id][a.id] = cur
      ? { ...cur, tries: cur.tries + 1, best: Math.max(cur.best, pct) }
      : { correct, total, timeMs, at: this.now(), tries: 1, best: pct };
    await this.kv.put(`cl:${code}`, c);
  }

  // ---------------------------------------------------------------- défis entre amis
  /** Nouveau défi : les questions (cibles) restent côté serveur ; gardé 30 jours. */
  async createChallenge(c: ChallengeRecord['data']): Promise<string> {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => A[b % A.length]).join('');
      if (!(await this.kv.get(`ch:${code}`))) break;
    }
    const clean = (s: string) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 20) || '?';
    const rec: ChallengeRecord = { data: { ...c, by: clean(c.by), first: { ...c.first, name: clean(c.first.name) }, items: c.items.slice(0, 50) }, results: [{ ...c.first, name: clean(c.first.name) }], createdAt: this.now() };
    await this.kv.put(`ch:${code}`, rec);
    // Ménage occasionnel des défis de plus de 30 jours.
    if (Math.random() < 0.05) {
      for (const k of await this.kv.list('ch:')) {
        const r = await this.kv.get<ChallengeRecord>(k);
        if (r && this.now() - r.createdAt > 30 * 86400000) await this.kv.delete(k);
      }
    }
    return code;
  }
  async challengeData(code: string) {
    return (await this.kv.get<ChallengeRecord>(`ch:${code}`))?.data ?? null;
  }
  private sortResults(list: ChallengeEntry[]) {
    return list.slice().sort((a, b) => b.correct / b.total - a.correct / a.total || a.timeMs - b.timeMs);
  }
  async challengeView(code: string): Promise<ChallengeView | null> {
    const r = await this.kv.get<ChallengeRecord>(`ch:${code}`);
    return r ? { code, settings: r.data.settings, by: r.data.by, results: this.sortResults(r.results).slice(0, 30) } : null;
  }
  async addChallengeResult(code: string, e: ChallengeEntry) {
    const r = await this.kv.get<ChallengeRecord>(`ch:${code}`);
    if (!r) return null;
    const name = String(e.name ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 20) || '?';
    r.results = [...r.results, { ...e, name }].slice(-100);
    await this.kv.put(`ch:${code}`, r);
    return { by: r.data.by, results: this.sortResults(r.results).slice(0, 30) };
  }

  // ---------------------------------------------------------------- avis des joueurs
  /** Avis envoyé depuis le site (après quelques parties, ou par le lien « Donner mon avis »). */
  // ---------------------------------------------------------------- album d'autocollants
  /**
   * Opérations sur l'album. Connecté : l'album du compte fait foi. Invité : l'album vit sur
   * l'appareil, le serveur ne sert qu'aux échanges (codes de cadeau).
   */
  async album(a: Account | null, b: any): Promise<{ album?: Record<string, number>; code?: string; id?: string }> {
    const op = String(b?.op ?? '');
    const id = String(b?.id ?? '');
    const save = async () => { if (a) await this.save(a); return a ? { album: a.album ?? {} } : {}; };
    if (a) a.album ??= {};
    if (op === 'get') return { album: a?.album ?? {} };
    if (op === 'add') {
      if (!a) throw new AccountError('account.signedOut');
      if (!STICKER_IDS.has(id)) throw new AccountError('album.invalid');
      a.album![id] = Math.min(99, (a.album![id] ?? 0) + 1);
      return save();
    }
    if (op === 'merge') {
      if (!a) throw new AccountError('account.signedOut');
      for (const [k, n] of Object.entries(b?.s ?? {})) if (STICKER_IDS.has(k) && Number.isFinite(+(n as number))) a.album![k] = Math.min(99, Math.max(a.album![k] ?? 0, Math.round(+(n as number))));
      return save();
    }
    if (op === 'gift') {
      // Doublon offert : un code à donner à un ami (valable 14 jours, une seule fois).
      if (!STICKER_IDS.has(id)) throw new AccountError('album.invalid');
      if (a) { if ((a.album![id] ?? 0) < 2) throw new AccountError('album.noDuplicate'); a.album![id]--; }
      let code: string;
      do code = [...crypto.getRandomValues(new Uint8Array(6))].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
      while (await this.kv.get(`gift:${code}`));
      await this.kv.put(`gift:${code}`, { id, at: this.now() });
      return { ...(await save()), code };
    }
    if (op === 'claim') {
      const code = String(b?.code ?? '').toUpperCase();
      const g = /^[A-Z0-9]{6}$/.test(code) ? await this.kv.get<{ id: string; at: number }>(`gift:${code}`) : undefined;
      if (!g || this.now() - g.at > 14 * 864e5) throw new AccountError('album.giftNotFound');
      await this.kv.delete(`gift:${code}`);
      if (a) a.album![g.id] = Math.min(99, (a.album![g.id] ?? 0) + 1);
      return { ...(await save()), id: g.id };
    }
    throw new AccountError('album.invalid');
  }

  async feedback(b: any, token: string | null) {
    const rating = Math.round(Number(b?.rating));
    if (!(rating >= 1 && rating <= 5)) throw new AccountError('feedback.invalid');
    const tags = Array.isArray(b?.tags) ? b.tags.filter((x: unknown) => typeof x === 'string' && FEEDBACK_TAGS.includes(x)).slice(0, 12) : [];
    const clean = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);
    const a = token ? await this.byToken(token) : null;
    const item: FeedbackItem = {
      id: `${this.now().toString(36)}${randomHex(3)}`, at: this.now(), rating, tags,
      comment: clean(b?.comment, 1000), game: clean(b?.game, 24), games: Math.min(9999, Math.max(0, Math.round(Number(b?.games) || 0))),
      lang: clean(b?.lang, 4), look: clean(b?.look, 8), device: clean(b?.device, 160), screen: clean(b?.screen, 16),
      pseudo: a?.pseudo, age: a?.age,
    };
    await this.kv.put(`fb:${item.id}`, item);
    // On garde les 3 000 derniers avis.
    const keys = (await this.kv.list('fb:')).sort();
    for (const k of keys.slice(0, -3000)) await this.kv.delete(k);
  }
  async adminFeedback() {
    const keys = await this.kv.list('fb:');
    const items: FeedbackItem[] = [];
    for (const k of keys) { const f = await this.kv.get<FeedbackItem>(k); if (f) items.push(f); }
    items.sort((x, y) => y.at - x.at);
    const tags: Record<string, number> = {};
    for (const f of items) for (const t of f.tags) tags[t] = (tags[t] ?? 0) + 1;
    const avg = items.length ? Math.round((items.reduce((s, f) => s + f.rating, 0) / items.length) * 10) / 10 : 0;
    return { count: items.length, avg, tags, items };
  }
  async adminFeedbackCsv() {
    const { items } = await this.adminFeedback();
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['date', 'note', 'tags', 'commentaire', 'jeu', 'parties', 'pseudo', 'tranche_age', 'langue', 'style', 'appareil', 'ecran'];
    const lines = items.map((f) => [new Date(f.at).toISOString().slice(0, 16).replace('T', ' '), f.rating, f.tags.join(' '), f.comment, f.game, f.games, f.pseudo ?? '', f.age ?? '', f.lang, f.look, f.device, f.screen].map(cell).join(','));
    return '\ufeff' + [head.join(','), ...lines].join('\r\n');
  }
  async adminFeedbackDelete(id: string) { await this.kv.delete(`fb:${id}`); }

  async adminUsers() {
    const keys = await this.kv.list('acct:');
    const users: Account[] = [];
    for (const k of keys) { const a = await this.kv.get<Account>(k); if (a) users.push(a); }
    const stats = (await this.kv.get<any>('stats')) ?? { users: 0, games: 0, cats: {}, days: {} };
    const week = this.now() - 7 * 86400000;
    return {
      stats: { ...stats, users: users.length, active7: users.filter((u) => u.lastSeen >= week).length, optin: users.filter((u) => u.optin).length },
      users: users
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((u) => ({ id: u.id, pseudo: u.pseudo, age: u.age, email: u.email ?? '', country: u.country ?? '', avatar: u.avatar, optin: u.optin, createdAt: u.createdAt, lastSeen: u.lastSeen, xp: u.xp, level: levelOf(u.xp).level, games: u.games })),
    };
  }
  async adminCsv() {
    const { users } = await this.adminUsers();
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['pseudo', 'email', 'accord_nouveautes', 'tranche_age', 'pays', 'niveau', 'xp', 'parties', 'inscription', 'derniere_visite'];
    const lines = users.map((u) => [u.pseudo, u.email, u.optin ? 'oui' : 'non', u.age, u.country, u.level, u.xp, u.games, new Date(u.createdAt).toISOString().slice(0, 10), new Date(u.lastSeen).toISOString().slice(0, 10)].map(cell).join(','));
    return '﻿' + [head.join(','), ...lines].join('\r\n');
  }
  /** Mot de passe oublié : l'admin en génère un provisoire à transmettre au joueur. */
  async adminReset(id: string) {
    const a = await this.get(id);
    if (!a) throw new AccountError('account.notFound');
    const temp = randomHex(4);
    const salt = randomHex(16);
    a.pass = { salt, hash: await hashPassword(temp, salt), iter: ITER };
    await this.save(a);
    return { password: temp };
  }
  async adminDelete(id: string) {
    const a = await this.get(id);
    if (a) await this.purge(a);
  }
}

// ------------------------------------------------------------------ routes HTTP (Node et Worker)
export interface Routed { status: number; json?: unknown; text?: string; type?: string; location?: string }

export async function accountRoute(
  svc: AccountService, method: string, path: string, query: URLSearchParams,
  body: () => Promise<any>, bearer: string, adminOk: boolean | null, origin = '',
): Promise<Routed | null> {
  try {
    if (path === '/api/auth/providers' && method === 'GET') return { status: 200, json: svc.providers() };
    const o = path.match(/^\/api\/auth\/(google|facebook)\/(start|callback)$/);
    if (o && method === 'GET') {
      const provider = o[1] as Provider;
      if (o[2] === 'start') {
        try { return { status: 302, location: await svc.oauthStart(provider, origin) }; }
        catch (e) { if (e instanceof AccountError) return { status: 302, location: `${origin}/#autherr=${e.message}` }; throw e; }
      }
      return { status: 302, location: await svc.oauthCallback(provider, query, origin) };
    }
    if (path === '/api/account/oauth' && method === 'GET') return { status: 200, json: await svc.oauthTicket(query.get('ticket') ?? '') };
    if (path === '/api/account/oauth' && method === 'POST') return { status: 200, json: await svc.oauthComplete(await body()) };
    if (path === '/api/account/register' && method === 'POST') return { status: 200, json: await svc.register(await body()) };
    if (path === '/api/account/login' && method === 'POST') return { status: 200, json: await svc.login(await body()) };
    if (path === '/api/leaderboard' && method === 'GET') {
      const c = query.get('country') ?? '';
      return { status: 200, json: await svc.leaderboard(bearer || null, /^[A-Z]{2}$/.test(c) ? c : undefined) };
    }
    const ch = path.match(/^\/api\/challenge\/([A-Z0-9]{6})$/);
    if (ch && method === 'GET') {
      const v = await svc.challengeView(ch[1]);
      return v ? { status: 200, json: v } : { status: 404, json: { error: 'challenge.notFound' } };
    }
    if (path === '/api/feedback' && method === 'POST') { await svc.feedback(await body(), bearer || null); return { status: 200, json: {} }; }
    if (path.startsWith('/api/admin/feedback')) {
      if (adminOk === null) return { status: 503, json: { error: 'admin.notConfigured' } };
      if (!adminOk) return { status: 401, json: { error: 'admin.denied' } };
      if (path === '/api/admin/feedback' && method === 'GET') return { status: 200, json: await svc.adminFeedback() };
      if (path === '/api/admin/feedback.csv' && method === 'GET') return { status: 200, text: await svc.adminFeedbackCsv(), type: 'text/csv; charset=utf-8' };
      const m = path.match(/^\/api\/admin\/feedback\/([0-9a-z]{6,20})$/);
      if (m && method === 'DELETE') { await svc.adminFeedbackDelete(m[1]); return { status: 200, json: {} }; }
      return null;
    }
    const pub = path.match(/^\/api\/class\/([A-Z0-9]{6})$/);
    if (pub && method === 'GET') {
      const v = await svc.classPublic(pub[1]);
      return v ? { status: 200, json: v } : { status: 404, json: { error: 'class.notFound' } };
    }
    if (path.startsWith('/api/classes')) {
      const a = await svc.byToken(bearer);
      if (!a) return { status: 401, json: { error: 'account.signedOut' } };
      if (path === '/api/classes' && method === 'GET') return { status: 200, json: await svc.myClasses(a) };
      if (path === '/api/classes' && method === 'POST') return { status: 200, json: await svc.createClass(a, await body()) };
      if (path === '/api/classes/join' && method === 'POST') return { status: 200, json: await svc.joinClass(a, String((await body())?.code ?? '').toUpperCase()) };
      const m = path.match(/^\/api\/classes\/([A-Z0-9]{6})(\.csv|\/leave|\/assign(?:\/([0-9a-f]{8}))?|\/students\/([0-9a-f]{16}))?$/);
      if (!m) return null;
      const [, code, sub, aid, sid] = m;
      if (!sub && method === 'GET') return { status: 200, json: await svc.classDetail(a, code) };
      if (!sub && method === 'DELETE') { await svc.deleteClass(a, code); return { status: 200, json: {} }; }
      if (sub === '.csv') return { status: 200, text: await svc.classCsv(a, code), type: 'text/csv; charset=utf-8' };
      if (sub === '/leave' && method === 'POST') { await svc.leaveClass(a, code); return { status: 200, json: {} }; }
      if (sub === '/assign' && method === 'POST') return { status: 200, json: await svc.assign(a, code, await body()) };
      if (aid && method === 'DELETE') { await svc.unassign(a, code, aid); return { status: 200, json: {} }; }
      if (sid && method === 'DELETE') { await svc.removeStudent(a, code, sid); return { status: 200, json: {} }; }
      return null;
    }
    if (path === '/api/league' && method === 'GET') {
      const v = bearer ? await svc.leagueView(bearer) : null;
      return v ? { status: 200, json: v } : { status: 401, json: { error: 'account.signedOut' } };
    }
    if (path === '/api/daily' && method === 'GET') return { status: 200, json: await svc.daily(bearer || null) };
    if (path === '/api/album' && method === 'POST') return { status: 200, json: await svc.album(bearer ? await svc.byToken(bearer) : null, await body()) };
    if (path.startsWith('/api/account')) {
      const a = await svc.byToken(bearer);
      if (!a) return { status: 401, json: { error: 'account.signedOut' } };
      if (path === '/api/account' && method === 'GET') return { status: 200, json: await svc.me(a) };
      if (path === '/api/account' && method === 'PUT') return { status: 200, json: await svc.update(a, await body()) };
      if (path === '/api/account/logout' && method === 'POST') { await svc.logout(bearer); return { status: 200, json: {} }; }
      if (path === '/api/account/delete' && method === 'POST') { await svc.remove(a, String((await body())?.password ?? '')); return { status: 200, json: {} }; }
      return null;
    }
    if (path.startsWith('/api/admin/users')) {
      if (adminOk === null) return { status: 503, json: { error: 'admin.notConfigured' } };
      if (!adminOk) return { status: 401, json: { error: 'admin.denied' } };
      if (path === '/api/admin/users' && method === 'GET') return { status: 200, json: await svc.adminUsers() };
      if (path === '/api/admin/users.csv' && method === 'GET') return { status: 200, text: await svc.adminCsv(), type: 'text/csv; charset=utf-8' };
      const m = path.match(/^\/api\/admin\/users\/([0-9a-f]{16})(\/reset)?$/);
      if (m && m[2] && method === 'POST') return { status: 200, json: await svc.adminReset(m[1]) };
      if (m && !m[2] && method === 'DELETE') { await svc.adminDelete(m[1]); return { status: 200, json: {} }; }
    }
    return null;
  } catch (e) {
    if (e instanceof AccountError) return { status: 400, json: { error: e.message } };
    if (e instanceof SyntaxError) return { status: 400, json: { error: 'account.invalid' } };
    throw e;
  }
}
