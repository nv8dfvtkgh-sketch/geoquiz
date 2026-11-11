// Quiz créés par les utilisateurs (« Crée ton quiz »), avec validation par l'administrateur.
//
// Cycle de vie : le créateur enregistre un brouillon → statut « pending » (en attente).
// L'admin valide → « approved » : la version validée (« live ») devient jouable par son code,
// en solo, en duel ou en salle. L'admin refuse → « rejected » avec un motif.
// Une modification d'un quiz validé repasse « pending », mais l'ancienne version validée
// reste jouable pendant la vérification. Avant validation, seul le créateur (qui possède le
// jeton de modification) peut tester son quiz, en solo.
//
// Le stockage est un simple magasin clé → valeur, fourni par la plateforme :
// fichiers sur disque (Node) ou stockage d'un Durable Object (Cloudflare).

export interface KV {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>; // clés
}

export interface QuizQuestion {
  text: string;
  image?: string; // identifiant d'image (stockée à part)
  answers: string[]; // 2 à 4 réponses
  correct: number; // index de la bonne réponse
}

export interface QuizContent {
  title: string;
  questions: QuizQuestion[];
}

export type QuizStatus = 'pending' | 'approved' | 'rejected';

export interface QuizRecord {
  id: string; // code du quiz (6 caractères)
  token: string; // jeton de modification (secret du créateur)
  draft: QuizContent; // dernière version envoyée
  live?: QuizContent; // version validée, jouable par tous
  status: QuizStatus;
  reason?: string; // motif de refus
  createdAt: number;
  updatedAt: number;
}

export const QUIZ_LIMITS = {
  minQuestions: 3,
  maxQuestions: 50,
  maxTitle: 80,
  maxText: 200,
  maxAnswer: 80,
  maxImageB64: 160_000, // ~120 Ko d'image JPEG ; le navigateur réduit les photos avant l'envoi
};

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function rand(len: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  const b = new Uint8Array(len);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => alphabet[x % alphabet.length]).join('');
}
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Photo envoyée par le navigateur : data URL JPEG/PNG/WebP déjà réduite. */
export interface IncomingImage { data: string } // "data:image/jpeg;base64,..."

export interface IncomingDraft {
  title: string;
  questions: { text: string; answers: string[]; correct: number; image?: string | IncomingImage | null }[];
}

export class QuizError extends Error {}

export class QuizService {
  constructor(private kv: KV) {}

  /** Vérifie et nettoie un brouillon ; enregistre les nouvelles photos. */
  private async sanitize(id: string, d: IncomingDraft, previous?: QuizContent): Promise<QuizContent> {
    if (!d || typeof d !== 'object') throw new QuizError('quiz.invalid');
    const title = clean(d.title, QUIZ_LIMITS.maxTitle);
    if (!title) throw new QuizError('quiz.noTitle');
    const qs = Array.isArray(d.questions) ? d.questions : [];
    if (qs.length < QUIZ_LIMITS.minQuestions) throw new QuizError('quiz.tooFew');
    if (qs.length > QUIZ_LIMITS.maxQuestions) throw new QuizError('quiz.tooMany');
    const knownImages = new Set((previous?.questions ?? []).map((q) => q.image).filter(Boolean) as string[]);
    const out: QuizQuestion[] = [];
    for (const q of qs) {
      const text = clean(q?.text, QUIZ_LIMITS.maxText);
      const answers = (Array.isArray(q?.answers) ? q.answers : []).map((a) => clean(a, QUIZ_LIMITS.maxAnswer)).filter(Boolean).slice(0, 4);
      const correct = Number(q?.correct);
      if (!text || answers.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= answers.length) throw new QuizError('quiz.incomplete');
      if (new Set(answers.map((a) => a.toLowerCase())).size !== answers.length) throw new QuizError('quiz.duplicateAnswers');
      let image: string | undefined;
      if (typeof q.image === 'string' && knownImages.has(q.image)) image = q.image; // photo déjà enregistrée
      else if (q.image && typeof q.image === 'object' && typeof q.image.data === 'string') {
        const m = q.image.data.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
        if (!m) throw new QuizError('quiz.badImage');
        if (m[2].length > QUIZ_LIMITS.maxImageB64) throw new QuizError('quiz.imageTooBig');
        image = rand(10);
        await this.kv.put(`img:${id}:${image}`, { type: `image/${m[1]}`, b64: m[2] });
      }
      out.push({ text, answers, correct, image });
    }
    return { title, questions: out };
  }

  async create(d: IncomingDraft): Promise<{ id: string; token: string }> {
    let id = '';
    for (let i = 0; i < 10 && !id; i++) {
      const c = rand(6, ALPHABET);
      if (!(await this.kv.get(`quiz:${c}`))) id = c;
    }
    if (!id) throw new QuizError('server');
    const draft = await this.sanitize(id, d);
    const now = Date.now();
    const rec: QuizRecord = { id, token: rand(24), draft, status: 'pending', createdAt: now, updatedAt: now };
    await this.kv.put(`quiz:${id}`, rec);
    return { id, token: rec.token };
  }

  async update(id: string, token: string, d: IncomingDraft): Promise<void> {
    const rec = await this.record(id);
    if (!rec || rec.token !== token) throw new QuizError('quiz.forbidden');
    rec.draft = await this.sanitize(id, d, rec.draft);
    rec.status = 'pending';
    rec.reason = undefined;
    rec.updatedAt = Date.now();
    await this.kv.put(`quiz:${id}`, rec);
    await this.cleanImages(rec);
  }

  async record(id: string): Promise<QuizRecord | undefined> {
    if (!/^[A-Z0-9]{6}$/.test(id)) return undefined;
    return this.kv.get<QuizRecord>(`quiz:${id}`);
  }

  /** Vue du créateur (avec son jeton) ou vue publique d'un quiz validé. */
  async view(id: string, token?: string) {
    const rec = await this.record(id);
    if (!rec) return null;
    const owner = !!token && token === rec.token;
    if (owner) return { id, owner: true, status: rec.status, reason: rec.reason, playable: !!rec.live, draft: rec.draft, title: rec.draft.title, count: rec.draft.questions.length };
    if (!rec.live) return null;
    return { id, owner: false, status: 'approved' as const, playable: true, title: rec.live.title, count: rec.live.questions.length };
  }

  /** Contenu à jouer : la version validée, ou le brouillon pour le créateur qui teste. */
  async playable(id: string, draftToken?: string): Promise<QuizContent | null> {
    const rec = await this.record(id);
    if (!rec) return null;
    if (draftToken && draftToken === rec.token) return rec.draft;
    return rec.live ?? null;
  }

  async image(id: string, img: string): Promise<{ type: string; b64: string } | undefined> {
    if (!/^[A-Za-z0-9]{10}$/.test(img)) return undefined;
    return this.kv.get(`img:${id}:${img}`);
  }

  // ------------------------------------------------------------ administration
  async adminList() {
    const keys = await this.kv.list('quiz:');
    const recs = (await Promise.all(keys.map((k) => this.kv.get<QuizRecord>(k)))).filter(Boolean) as QuizRecord[];
    return recs
      .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.updatedAt - a.updatedAt)
      .map((r) => ({ id: r.id, title: r.draft.title, status: r.status, count: r.draft.questions.length, updatedAt: r.updatedAt, hasLive: !!r.live, reason: r.reason }));
  }

  async adminGet(id: string) {
    const rec = await this.record(id);
    return rec ? { id: rec.id, status: rec.status, reason: rec.reason, draft: rec.draft, updatedAt: rec.updatedAt } : null;
  }

  async approve(id: string) {
    const rec = await this.record(id);
    if (!rec) throw new QuizError('quiz.notFound');
    rec.live = rec.draft;
    rec.status = 'approved';
    rec.reason = undefined;
    rec.updatedAt = Date.now();
    await this.kv.put(`quiz:${id}`, rec);
    await this.cleanImages(rec);
  }

  async reject(id: string, reason: string) {
    const rec = await this.record(id);
    if (!rec) throw new QuizError('quiz.notFound');
    rec.status = 'rejected';
    rec.reason = clean(reason, 300) || undefined;
    rec.updatedAt = Date.now();
    await this.kv.put(`quiz:${id}`, rec);
  }

  async remove(id: string) {
    const rec = await this.record(id);
    if (!rec) return;
    for (const k of await this.kv.list(`img:${id}:`)) await this.kv.delete(k);
    await this.kv.delete(`quiz:${id}`);
  }

  /** Supprime les photos qui ne servent plus ni au brouillon ni à la version validée. */
  private async cleanImages(rec: QuizRecord) {
    const used = new Set([...rec.draft.questions, ...(rec.live?.questions ?? [])].map((q) => q.image).filter(Boolean));
    for (const k of await this.kv.list(`img:${rec.id}:`)) if (!used.has(k.split(':')[2])) await this.kv.delete(k);
  }
}

/**
 * Routes HTTP communes aux deux plateformes. `adminOk` dit si la requête porte le bon mot de
 * passe administrateur. Renvoie null si la route n'est pas une route de quiz.
 */
export async function quizRoute(
  svc: QuizService,
  method: string,
  path: string,
  query: URLSearchParams,
  body: () => Promise<any>,
  adminOk: boolean | null, // null : aucun mot de passe configuré
): Promise<{ status: number; json?: unknown; image?: { type: string; b64: string } } | null> {
  try {
    if (path === '/api/quizzes' && method === 'POST') {
      const b = await body();
      return { status: 200, json: await svc.create(b?.draft) };
    }
    let m = path.match(/^\/api\/quizzes\/([A-Z0-9]{6})$/);
    if (m && method === 'GET') {
      const v = await svc.view(m[1], query.get('token') ?? undefined);
      return v ? { status: 200, json: v } : { status: 404, json: { error: 'quiz.notFound' } };
    }
    if (m && method === 'PUT') {
      const b = await body();
      await svc.update(m[1], String(b?.token ?? ''), b?.draft);
      return { status: 200, json: { ok: true } };
    }
    m = path.match(/^\/api\/quizzes\/([A-Z0-9]{6})\/img\/([A-Za-z0-9]{10})$/);
    if (m && method === 'GET') {
      // Photo d'un brouillon, pour son créateur (aperçu dans l'éditeur).
      const rec = await svc.record(m[1]);
      if (!rec || rec.token !== query.get('token')) return { status: 404 };
      const img = await svc.image(m[1], m[2]);
      return img ? { status: 200, image: img } : { status: 404 };
    }

    if (path.startsWith('/api/admin/')) {
      if (adminOk === null) return { status: 503, json: { error: 'admin.notConfigured' } };
      if (!adminOk) return { status: 401, json: { error: 'admin.denied' } };
      if (path === '/api/admin/quizzes' && method === 'GET') return { status: 200, json: await svc.adminList() };
      m = path.match(/^\/api\/admin\/quizzes\/([A-Z0-9]{6})$/);
      if (m && method === 'GET') {
        const r = await svc.adminGet(m[1]);
        return r ? { status: 200, json: r } : { status: 404, json: { error: 'quiz.notFound' } };
      }
      if (m && method === 'DELETE') { await svc.remove(m[1]); return { status: 200, json: { ok: true } }; }
      m = path.match(/^\/api\/admin\/quizzes\/([A-Z0-9]{6})\/(approve|reject)$/);
      if (m && method === 'POST') {
        if (m[2] === 'approve') await svc.approve(m[1]);
        else await svc.reject(m[1], (await body())?.reason ?? '');
        return { status: 200, json: { ok: true } };
      }
      m = path.match(/^\/api\/admin\/quizzes\/([A-Z0-9]{6})\/img\/([A-Za-z0-9]{10})$/);
      if (m && method === 'GET') {
        const img = await svc.image(m[1], m[2]);
        return img ? { status: 200, image: img } : { status: 404 };
      }
      return { status: 404, json: {} };
    }
    return null;
  } catch (e) {
    if (e instanceof QuizError) return { status: 400, json: { error: e.message } };
    throw e;
  }
}

/** Comparaison en temps constant (mot de passe administrateur). */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
