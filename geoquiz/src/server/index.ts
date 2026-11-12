// Version Node.js : un seul processus (fichiers statiques + API + WebSocket), parties en mémoire.
// Pour Cloudflare Workers, voir src/worker/index.ts.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { categoryInfos } from './categories';
import { fetchPhoto } from './photos';
import { catalog, ensureRegion, EXTRA_FILES, initData, regionMap, worldJson } from './data';
import { QuickQueue } from './quick';
import { config, newCode, Room, validSettings, type Conn } from './rooms';
import { QuizService, quizRoute, safeEqual, type KV } from './quizzes';

// ------------------------------------------------------------------ données
function findRoot(dir: string): string {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'package.json'))) return d;
    if (path.dirname(d) === d) return process.cwd();
  }
}
const ROOT = findRoot(__dirname);
const BUILD = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data/build');
const PUBLIC = path.join(ROOT, 'public');
const readJson = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));

if (!fs.existsSync(path.join(BUILD, 'world.json'))) {
  console.error(`\nDonnées introuvables dans ${BUILD}.\nLancez d'abord « npm run data » (ou « npm run data:demo » hors ligne).\n`);
  process.exit(1);
}
initData(readJson(path.join(BUILD, 'world.json')), readJson(path.join(BUILD, 'countries.json')), (iso) => {
  const f = path.join(BUILD, 'regions', `${iso}.json`);
  return fs.existsSync(f) ? readJson(f) : null;
}, Object.fromEntries(EXTRA_FILES.map((k) => [k, fs.existsSync(path.join(BUILD, `${k}.json`)) ? readJson(path.join(BUILD, `${k}.json`)) : []])));
config.maxPlayers = Number(process.env.MAX_PLAYERS ?? 50);
const catalogJson = JSON.stringify(catalog(categoryInfos(), config.maxPlayers));

// ------------------------------------------------------------------ quiz créés (stockés en fichiers)
const STORE = process.env.STORE_DIR ? path.resolve(process.env.STORE_DIR) : path.join(ROOT, 'data/store');
fs.mkdirSync(STORE, { recursive: true });
const fileOf = (key: string) => path.join(STORE, key.replace(/:/g, '__') + '.json');
const fileKV: KV = {
  async get(key) { const f = fileOf(key); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : undefined; },
  async put(key, value) { fs.writeFileSync(fileOf(key), JSON.stringify(value)); },
  async delete(key) { fs.rmSync(fileOf(key), { force: true }); },
  async list(prefix) {
    const p = prefix.replace(/:/g, '__');
    return fs.readdirSync(STORE).filter((f) => f.startsWith(p) && f.endsWith('.json')).map((f) => f.slice(0, -5).replace(/__/g, ':'));
  },
};
const quizzes = new QuizService(fileKV);
config.loadQuiz = (id, token) => quizzes.playable(id, token);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

// ------------------------------------------------------------------ salles
const rooms = new Map<string, Room>();
const emptySince = new Map<string, number>();
async function createRoom(body: any): Promise<string | { error: string }> {
  const settings = validSettings(body?.settings);
  if (!settings) return { error: 'settings.invalid' };
  const kind = ['solo', 'duel', 'room'].includes(body.kind) ? body.kind : 'room';
  // Quiz créé : jouable par tous une fois validé ; avant, seulement par son créateur, en solo.
  let quizToken: string | undefined;
  if (settings.category === 'custom') {
    const rec = await quizzes.record(settings.quiz!);
    if (!rec) return { error: 'quiz.notFound' };
    const owner = typeof body.quizToken === 'string' && body.quizToken === rec.token;
    if (owner && kind === 'solo') quizToken = body.quizToken;
    else if (!rec.live) return { error: 'quiz.notApproved' };
  }
  const code = newCode((c) => rooms.has(c));
  const room = new Room(code, kind, settings, kind !== 'room' || body.hostPlays !== false, () => rooms.delete(code));
  room.quizToken = quizToken;
  rooms.set(code, room);
  return code;
}
const quick = new QuickQueue(async (settings) => (await createRoom({ kind: 'duel', settings })) as string);

// Ménage : salles créées mais jamais rejointes, ou abandonnées depuis 15 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.connected()) { emptySince.delete(code); continue; }
    if (!emptySince.has(code)) emptySince.set(code, now);
    else if (now - emptySince.get(code)! > 15 * 60_000) { room.destroy(); emptySince.delete(code); }
  }
}, 60_000).unref();

// ------------------------------------------------------------------ HTTP
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};
function send(res: http.ServerResponse, status: number, body: string | Buffer, type = 'application/json', cache = 'no-store') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
function readBody(req: http.IncomingMessage, max = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > max) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/healthz') return send(res, 200, JSON.stringify({ ok: true, rooms: rooms.size }));
    if (p === '/api/catalog') return send(res, 200, catalogJson, 'application/json', 'public, max-age=300');
    if (p === '/api/rooms' && req.method === 'POST') {
      let body: any = null;
      try { body = JSON.parse(await readBody(req)); } catch {}
      const code = await createRoom(body);
      return typeof code === 'string' ? send(res, 200, JSON.stringify({ code })) : send(res, 400, JSON.stringify(code));
    }
    if (p.startsWith('/api/quizzes') || p.startsWith('/api/admin/')) {
      const auth = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const r = await quizRoute(quizzes, req.method ?? 'GET', p, url.searchParams,
        async () => JSON.parse(await readBody(req, 12_000_000)), ADMIN_PASSWORD ? safeEqual(auth, ADMIN_PASSWORD) : null);
      if (r) {
        if (r.image) return send(res, 200, Buffer.from(r.image.b64, 'base64'), r.image.type, 'private, max-age=3600');
        return send(res, r.status, JSON.stringify(r.json ?? {}));
      }
    }
    if (p === '/api/map/world') return send(res, 200, worldJson, 'application/json', 'public, max-age=86400');
    let m = p.match(/^\/api\/map\/region\/([A-Z]{2})\/(groups|subs)$/);
    if (m) {
      await ensureRegion(m[1]);
      const rm = regionMap(m[1], m[2]);
      return rm ? send(res, 200, rm.json, 'application/json', 'public, max-age=86400') : send(res, 404, '{}');
    }
    m = p.match(/^\/api\/img\/([A-Z0-9]{6})\.([\w-]{6,20})$/);
    if (m) {
      const iso = rooms.get(m[1])?.resolveImage(`${m[1]}.${m[2]}`);
      if (iso?.startsWith('wiki:')) {
        const r = await fetchPhoto(iso.slice(5)).catch(() => null);
        return r ? send(res, 200, Buffer.from(await r.arrayBuffer()), r.headers.get('content-type') ?? 'image/jpeg', 'private, max-age=3600') : send(res, 404, '');
      }
      if (iso?.startsWith('quiz:')) {
        const [, qid, img] = iso.split(':');
        const im = await quizzes.image(qid, img);
        return im ? send(res, 200, Buffer.from(im.b64, 'base64'), im.type, 'private, max-age=3600') : send(res, 404, '');
      }
      const f = iso && path.join(BUILD, 'flags', `${iso}.svg`);
      return f && fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), 'image/svg+xml', 'private, max-age=3600') : send(res, 404, '');
    }
    m = p.match(/^\/api\/room\/([A-Z0-9]{6})$/);
    if (m) return send(res, 200, JSON.stringify({ exists: rooms.has(m[1]) && rooms.get(m[1])!.kind !== 'solo' }));
    if (p.startsWith('/api/')) return send(res, 404, '{}');

    // Fichiers statiques, sinon l'application (routes /join/CODE, etc.).
    const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (file.startsWith(PUBLIC) && !file.startsWith(path.join(PUBLIC, 'data')) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const long = /\.(js|css)$/.test(file) && url.searchParams.has('v');
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] ?? 'application/octet-stream', long ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
    return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'index.html')), TYPES['.html'], 'no-cache');
  } catch (e) {
    console.error(e);
    send(res, 500, '{}');
  }
});

// ------------------------------------------------------------------ WebSocket : /ws/<CODE> ou /ws/quick
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  const m = (req.url ?? '').match(/^\/ws\/(quick|[A-Z0-9]{6})(\?|$)/);
  if (!m) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => onSocket(ws as WebSocket & { alive?: boolean }, m[1]));
});

function onSocket(ws: WebSocket & { alive?: boolean }, target: string) {
  ws.alive = true;
  const conn: Conn = {
    send(msg: ServerMsg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  let windowStart = Date.now();
  let count = 0;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (data) => {
    ws.alive = true;
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; count = 0; }
    if (++count > 40) return; // 40 messages par seconde au maximum
    let msg: ClientMsg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try {
      if (target === 'quick') return void quick.handle(conn, msg);
      if (msg.t === 'ping') return conn.send({ t: 'pong' });
      const room = rooms.get(target);
      if (!room) return conn.send({ t: 'error', code: msg.t === 'resume' ? 'room.expired' : 'room.notFound' });
      room.connect(conn, msg);
    } catch (e) {
      console.error(e);
      conn.send({ t: 'error', code: 'server' });
    }
  });
  ws.on('close', () => {
    quick.remove(conn);
    conn.room?.detach(conn);
  });
}
const heartbeat = setInterval(() => {
  for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 25_000);
wss.on('close', () => clearInterval(heartbeat));

const PORT = Number(process.env.PORT ?? 3000);
server.listen(PORT, () => console.log(`• Quizellige prêt sur http://localhost:${PORT}`));
