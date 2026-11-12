// Comptes joueurs et progression (XP, niveaux, badges, étoiles, classement de la semaine).
// Indépendant de la plateforme : même stockage clé-valeur que les quiz créés (fichiers en
// Node, Durable Object « AccountsDO » sur Cloudflare). Tout ce qui rapporte des points est
// calculé ici, à partir des résultats que la salle envoie : le navigateur ne peut pas tricher.
import type { KV } from './quizzes';

// ------------------------------------------------------------------ types
import { AVATARS, BADGES, UNLOCK_AT, type AgeGroup, type CatStats, type Me, type Reward } from '../shared/protocol';
export { AVATARS, BADGES, UNLOCK_AT };
export type { AgeGroup, CatStats, Me, Reward };

export interface GameResult {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  kind: 'solo' | 'duel' | 'room';
  mode: 'classic' | 'battle' | 'teams';
  zone: string;
  lang: string;
  total: number;
  correct: number;
  accuracy: number; // 0-100, réponses en plusieurs essais comptées en partie
  rank: number; // 1 = premier
  players: number;
  teamWon?: boolean;
}

interface Account {
  id: string;
  pseudo: string;
  pass: { salt: string; hash: string; iter: number };
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
}

export class AccountError extends Error {}

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

const ALL_GAMES = ['countries', 'flags', 'capitals', 'regions', 'silhouettes', 'currencies', 'languages', 'food', 'animals', 'monuments', 'emoji', 'truefalse', 'calc'];

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
  constructor(private kv: KV, private now = () => Date.now()) {}

  private async get(id: string) { return this.kv.get<Account>(`acct:${id}`); }
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
    const t = this.now();
    const a: Account = {
      id: randomHex(8), pseudo, pass: { salt, hash: await hashPassword(password, salt), iter: ITER }, age,
      email: age === 'u13' ? undefined : email,
      country: /^[A-Z]{2}$/.test(body?.country ?? '') ? body.country : undefined,
      avatar: AVATARS.includes(body?.avatar) ? body.avatar : AVATARS[0],
      optin: age !== 'u13' && body?.optin === true,
      createdAt: t, lastSeen: t, xp: 0, games: 0, correct: 0, answered: 0, wins: 0, cats: {}, badges: {},
      days: { last: '', streak: 0, best: 0 }, langs: [],
    };
    await this.kv.put(`pseudo:${key}`, a.id);
    if (a.email) await this.kv.put(`email:${a.email}`, a.id);
    await this.save(a);
    await this.bump('users', 1);
    return { token: await this.session(a), me: await this.me(a) };
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
    const ok = !!a && sameString(await hashPassword(password, a.pass.salt, a.pass.iter), a.pass.hash);
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
    return {
      id: a.id, pseudo: a.pseudo, age: a.age, email: a.email, country: a.country, avatar: a.avatar, optin: a.optin, createdAt: a.createdAt,
      xp: a.xp, ...lv, title: titleOf(lv.level), games: a.games, correct: a.correct, answered: a.answered, wins: a.wins,
      cats: a.cats, badges: a.badges, days: { streak: a.days.streak, best: a.days.best }, weekXp: lb?.[a.id]?.xp ?? 0,
    };
  }

  async update(a: Account, body: any) {
    if (body?.avatar !== undefined && AVATARS.includes(body.avatar)) a.avatar = body.avatar;
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
      if (!sameString(await hashPassword(String(body?.password ?? ''), a.pass.salt, a.pass.iter), a.pass.hash)) throw new AccountError('account.wrong');
      if (np.length < 6 || np.length > 100) throw new AccountError('account.passwordShort');
      a.pass.salt = randomHex(16);
      a.pass.hash = await hashPassword(np, a.pass.salt);
      a.pass.iter = ITER;
    }
    await this.save(a);
    return this.me(a);
  }

  /** Suppression définitive (droit à l'effacement) : il faut le mot de passe. */
  async remove(a: Account, password: string) {
    if (!sameString(await hashPassword(password, a.pass.salt, a.pass.iter), a.pass.hash)) throw new AccountError('account.wrong');
    await this.purge(a);
  }
  private async purge(a: Account) {
    await this.kv.delete(`acct:${a.id}`);
    await this.kv.delete(`pseudo:${pseudoKey(a.pseudo)}`);
    if (a.email) await this.kv.delete(`email:${a.email}`);
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

    await this.save(a);
    // Classement de la semaine.
    const wk = `lb:${weekOf(this.now())}`;
    const lb = (await this.kv.get<Record<string, { xp: number; pseudo: string; avatar: string; country?: string }>>(wk)) ?? {};
    lb[a.id] = { xp: (lb[a.id]?.xp ?? 0) + xp, pseudo: a.pseudo, avatar: a.avatar, country: a.country };
    await this.kv.put(wk, lb);
    await this.bump('games', 1, r.category);

    const lv = levelOf(a.xp);
    return { xp, total: a.xp, ...lv, levelUp: lv.level > before, title: titleOf(lv.level), badges: got, best, unlocked };
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
    a.pass.salt = randomHex(16);
    a.pass.hash = await hashPassword(temp, a.pass.salt);
    a.pass.iter = ITER;
    await this.save(a);
    return { password: temp };
  }
  async adminDelete(id: string) {
    const a = await this.get(id);
    if (a) await this.purge(a);
  }
}

// ------------------------------------------------------------------ routes HTTP (Node et Worker)
export interface Routed { status: number; json?: unknown; text?: string; type?: string }

export async function accountRoute(
  svc: AccountService, method: string, path: string, query: URLSearchParams,
  body: () => Promise<any>, bearer: string, adminOk: boolean | null,
): Promise<Routed | null> {
  try {
    if (path === '/api/account/register' && method === 'POST') return { status: 200, json: await svc.register(await body()) };
    if (path === '/api/account/login' && method === 'POST') return { status: 200, json: await svc.login(await body()) };
    if (path === '/api/leaderboard' && method === 'GET') {
      const c = query.get('country') ?? '';
      return { status: 200, json: await svc.leaderboard(bearer || null, /^[A-Z]{2}$/.test(c) ? c : undefined) };
    }
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
