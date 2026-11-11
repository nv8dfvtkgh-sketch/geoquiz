// Version Cloudflare Workers.
//   - Le Worker sert l'API ; les pages et les données sont des « static assets » (dossier public/).
//   - Chaque partie est un Durable Object (RoomDO) identifié par son code : il garde l'état de la
//     partie en mémoire et gère les WebSockets de tous ses joueurs.
//   - La partie rapide passe par un Durable Object unique (QuickDO) qui associe les joueurs.
// Le moteur de jeu (src/server/rooms.ts, categories.ts, data.ts) est le même que la version Node.
import type { ClientMsg, ServerMsg, Settings } from '../shared/protocol';
import { categoryInfos } from '../server/categories';
import { catalog, dataReady, ensureRegion, initData, regionMap, worldJson } from '../server/data';
import { QuickQueue } from '../server/quick';
import { config, newCode, Room, validSettings, type Conn } from '../server/rooms';
import { QuizService, quizRoute, safeEqual, type KV } from '../server/quizzes';

// Types minimaux de la plateforme (pour ne pas dépendre de @cloudflare/workers-types).
interface Fetcher { fetch(input: Request | string, init?: RequestInit): Promise<Response> }
interface DOStub { fetch(input: Request | string, init?: RequestInit): Promise<Response> }
interface DONamespace { idFromName(name: string): unknown; get(id: unknown): DOStub }
interface DOStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(opts: { prefix: string }): Promise<Map<string, unknown>>;
}
interface DOState { id: unknown; storage: DOStorage }
interface CfWebSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message', l: (e: { data: unknown }) => void): void;
  addEventListener(type: 'close' | 'error', l: () => void): void;
  readyState: number;
}
declare const WebSocketPair: { new (): { 0: CfWebSocket; 1: CfWebSocket } };

export interface Env {
  ASSETS: Fetcher;
  ROOMS: DONamespace;
  QUICK: DONamespace;
  QUIZZES: DONamespace;
  MAX_PLAYERS?: string;
  ADMIN_PASSWORD?: string; // secret : Paramètres › Variables et secrets
}

/** Tous les quiz créés vivent dans un Durable Object unique (stockage SQLite). */
const quizStub = (env: Env) => env.QUIZZES.get(env.QUIZZES.idFromName('store'));
const quizCall = async <T>(env: Env, op: string, body: unknown): Promise<T | null> => {
  const r = await quizStub(env).fetch(`https://quiz/internal/${op}`, { method: 'POST', body: JSON.stringify(body) });
  return r.ok ? ((await r.json()) as T) : null;
};

const json = (body: unknown, status = 200, cache = 'no-store') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },
  });

/** Lit un fichier de données (public/data/…) par le binding ASSETS, invisible du public. */
async function asset(env: Env, file: string): Promise<Response> {
  return env.ASSETS.fetch(new Request(`https://assets.local/data/${file}`));
}

// Chargement des données une fois par instance (isolate) du Worker ou du Durable Object.
let loading: Promise<void> | null = null;
function ensureData(env: Env): Promise<void> {
  if (dataReady()) return Promise.resolve();
  loading ??= (async () => {
    const [w, c, l] = await Promise.all([asset(env, 'world.json'), asset(env, 'countries.json'), asset(env, 'languages.json')]);
    if (!w.ok || !c.ok) throw new Error('Données absentes : lancez « npm run build:cf » avant le déploiement.');
    initData(await w.json(), await c.json(), async (iso) => {
      const r = await asset(env, `regions/${iso}.json`);
      return r.ok ? r.json() : null;
    }, { languages: l.ok ? await l.json() : [] });
    config.maxPlayers = Number(env.MAX_PLAYERS ?? 50) || 50;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

const roomStub = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));

/** Crée une partie dans un nouveau Durable Object et renvoie son code. */
async function createRoom(env: Env, body: any): Promise<string | { error: string }> {
  const settings = validSettings(body?.settings);
  if (!settings) return { error: 'settings.invalid' };
  const kind = ['solo', 'duel', 'room'].includes(body.kind) ? body.kind : 'room';
  // Quiz créé : jouable par tous une fois validé ; avant, seulement par son créateur, en solo.
  let quizToken: string | undefined;
  if (settings.category === 'custom') {
    const st = await quizCall<{ exists: boolean; live: boolean; owner: boolean }>(env, 'check', { id: settings.quiz, token: body.quizToken });
    if (!st?.exists) return { error: 'quiz.notFound' };
    if (st.owner && kind === 'solo') quizToken = body.quizToken;
    else if (!st.live) return { error: 'quiz.notApproved' };
  }
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const res = await roomStub(env, code).fetch('https://room/init', {
      method: 'POST',
      body: JSON.stringify({ code, kind, settings, hostPlays: kind !== 'room' || body.hostPlays !== false, quizToken }),
    });
    if (res.ok) return code;
    if (res.status !== 409) return { error: 'server' }; // 409 : code déjà pris, on en tire un autre
  }
  return { error: 'server' };
}

// ------------------------------------------------------------------ Worker (point d'entrée HTTP)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      // Les fichiers de données ne sont lisibles que par le Worker (noms des lieux = réponses).
      if (p.startsWith('/data/')) return new Response('Not found', { status: 404 });

      let m = p.match(/^\/ws\/(quick|[A-Z0-9]{6})$/);
      if (m) {
        if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
        const stub = m[1] === 'quick' ? env.QUICK.get(env.QUICK.idFromName('global')) : roomStub(env, m[1]);
        return stub.fetch(request);
      }

      if (p.startsWith('/api/')) {
        await ensureData(env);
        if (p === '/api/catalog') return json(catalog(categoryInfos(), config.maxPlayers), 200, 'public, max-age=300');
        if (p === '/api/rooms' && request.method === 'POST') {
          const text = await request.text();
          if (text.length > 4096) return json({ error: 'settings.invalid' }, 400);
          let body: unknown = null;
          try { body = JSON.parse(text); } catch {}
          const code = await createRoom(env, body);
          return typeof code === 'string' ? json({ code }) : json(code, 400);
        }
        // Quiz créés et espace d'administration : traités par le Durable Object des quiz.
        if (p.startsWith('/api/quizzes') || p.startsWith('/api/admin/')) return quizStub(env).fetch(request);
        if (p === '/api/map/world') return json(worldJson, 200, 'public, max-age=86400');
        m = p.match(/^\/api\/map\/region\/([A-Z]{2})\/(groups|subs)$/);
        if (m) {
          await ensureRegion(m[1]);
          const rm = regionMap(m[1], m[2]);
          return rm ? json(rm.json, 200, 'public, max-age=86400') : json({}, 404);
        }
        m = p.match(/^\/api\/room\/([A-Z0-9]{6})$/);
        if (m) return roomStub(env, m[1]).fetch('https://room/exists');
        m = p.match(/^\/api\/img\/([A-Z0-9]{6})\.([\w-]{6,20})$/);
        if (m) return roomStub(env, m[1]).fetch(`https://room/img/${m[1]}.${m[2]}`);
        return json({}, 404);
      }
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return json({ error: 'server' }, 500);
    }
  },
};

// ------------------------------------------------------------------ WebSocket → Conn du moteur
function acceptSocket(onMsg: (conn: Conn, msg: ClientMsg) => void, onClose: (conn: Conn) => void): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  const conn: Conn = {
    send(msg: ServerMsg) {
      try { server.send(JSON.stringify(msg)); } catch { /* socket déjà fermée */ }
    },
  };
  let windowStart = Date.now();
  let count = 0;
  server.addEventListener('message', (e) => {
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; count = 0; }
    if (++count > 40) return; // 40 messages par seconde au maximum
    if (typeof e.data !== 'string' || e.data.length > 4096) return;
    let msg: ClientMsg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { onMsg(conn, msg); } catch (err) { console.error(err); conn.send({ t: 'error', code: 'server' }); }
  });
  let closed = false;
  const close = () => { if (!closed) { closed = true; onClose(conn); } };
  server.addEventListener('close', close);
  server.addEventListener('error', close);
  return new Response(null, { status: 101, webSocket: client } as ResponseInit);
}

// ------------------------------------------------------------------ une partie = un Durable Object
export class RoomDO {
  room: Room | null = null;

  constructor(private state: DOState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    await ensureData(this.env);
    config.loadQuiz = (id, token) => quizCall(this.env, 'content', { id, token });
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      return acceptSocket(
        (conn, msg) => {
          if (msg.t === 'ping') return conn.send({ t: 'pong' });
          if (!this.room) return conn.send({ t: 'error', code: msg.t === 'resume' ? 'room.expired' : 'room.notFound' });
          this.room.connect(conn, msg);
        },
        (conn) => conn.room?.detach(conn),
      );
    }

    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.room) return new Response('exists', { status: 409 });
      const b = (await request.json()) as { code: string; kind: Room['kind']; settings: Settings; hostPlays: boolean; quizToken?: string };
      const settings = validSettings(b.settings);
      if (!settings) return new Response('invalid', { status: 400 });
      this.room = new Room(b.code, b.kind, settings, b.hostPlays, () => { this.room = null; });
      this.room.quizToken = b.quizToken;
      return new Response('ok');
    }

    if (url.pathname === '/exists') return json({ exists: !!this.room && this.room.kind !== 'solo' });

    const img = url.pathname.match(/^\/img\/(.+)$/);
    if (img) {
      const iso = this.room?.resolveImage(img[1]);
      if (!iso) return new Response('', { status: 404 });
      if (iso.startsWith('quiz:')) {
        const [, id, imgId] = iso.split(':');
        const im = await quizCall<{ type: string; b64: string }>(this.env, 'image', { id, img: imgId });
        if (!im) return new Response('', { status: 404 });
        const bin = Uint8Array.from(atob(im.b64), (c) => c.charCodeAt(0));
        return new Response(bin, { headers: { 'Content-Type': im.type, 'Cache-Control': 'private, max-age=3600' } });
      }
      const f = await asset(this.env, `flags/${iso}.svg`);
      return new Response(f.body, { status: f.status, headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=3600' } });
    }
    return new Response('', { status: 404 });
  }
}

// ------------------------------------------------------------------ partie rapide (instance unique)
export class QuickDO {
  queue: QuickQueue;

  constructor(private state: DOState, private env: Env) {
    this.queue = new QuickQueue(async (settings) => (await createRoom(this.env, { kind: 'duel', settings })) as string);
  }

  async fetch(request: Request): Promise<Response> {
    await ensureData(this.env);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('', { status: 426 });
    return acceptSocket(
      (conn, msg) => void this.queue.handle(conn, msg),
      (conn) => this.queue.remove(conn),
    );
  }
}

// ------------------------------------------------------------------ quiz créés (instance unique)
export class QuizDO {
  svc: QuizService;

  constructor(private state: DOState, private env: Env) {
    const st = state.storage;
    const kv: KV = {
      get: (k) => st.get(k),
      put: (k, v) => st.put(k, v),
      delete: async (k) => { await st.delete(k); },
      list: async (prefix) => [...(await st.list({ prefix })).keys()],
    };
    this.svc = new QuizService(kv);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Appels internes (salles, Worker) : jamais exposés au public, l'URL vient du Worker.
    const internal = url.pathname.match(/^\/internal\/(check|content|image)$/);
    if (internal && url.hostname === 'quiz') {
      const b = (await request.json()) as { id: string; token?: string; img?: string };
      if (internal[1] === 'check') {
        const rec = await this.svc.record(b.id);
        return json({ exists: !!rec, live: !!rec?.live, owner: !!rec && !!b.token && b.token === rec.token });
      }
      if (internal[1] === 'content') {
        const c = await this.svc.playable(b.id, b.token);
        return c ? json(c) : json({}, 404);
      }
      const im = await this.svc.image(b.id, b.img ?? '');
      return im ? json(im) : json({}, 404);
    }
    const pwd = this.env.ADMIN_PASSWORD ?? '';
    const auth = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const r = await quizRoute(this.svc, request.method, url.pathname, url.searchParams, async () => {
      const text = await request.text();
      if (text.length > 12_000_000) throw new Error('too large');
      return JSON.parse(text);
    }, pwd ? safeEqual(auth, pwd) : null);
    if (!r) return json({}, 404);
    if (r.image) {
      const bin = Uint8Array.from(atob(r.image.b64), (c) => c.charCodeAt(0));
      return new Response(bin, { headers: { 'Content-Type': r.image.type, 'Cache-Control': 'private, max-age=3600' } });
    }
    return json(r.json ?? {}, r.status);
  }
}
