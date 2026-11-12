// Connexion temps réel : un WebSocket par partie (/ws/<CODE>), ou /ws/quick pour le jumelage.
// Reconnexion automatique et reprise de sa place grâce au jeton reçu à l'entrée dans la partie.
import type { ClientMsg, CreateRoomReq, Lang, ServerMsg } from '../shared/protocol';

type Listener = (msg: ServerMsg) => void;
const SESSION_KEY = 'gq.session';

export interface Session { code: string; token: string }

export function savedSession(): Session | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
}
export function saveSession(s: Session | null) {
  try { s ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESSION_KEY); } catch {}
}

export class Net {
  ws: WebSocket | null = null;
  target: string | null = null; // code de partie ou 'quick'
  listeners = new Set<Listener>();
  statusListeners = new Set<(online: boolean) => void>();
  queue: ClientMsg[] = [];
  retry = 0;
  lang: Lang = 'fr';
  online = true;

  /** Ouvre la connexion vers une partie (ou la file de partie rapide). */
  open(target: string) {
    this.close();
    this.target = target;
    this.connect();
  }

  close() {
    this.target = null;
    this.queue = [];
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.close(); }
    this.setOnline(true);
  }

  private connect() {
    const target = this.target;
    if (!target) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/${target}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setOnline(true);
      const s = savedSession();
      if (s && s.code === target) ws.send(JSON.stringify({ t: 'resume', token: s.token, lang: this.lang }));
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'joined') saveSession({ code: msg.room.code, token: msg.token });
      if (msg.t === 'kicked' || (msg.t === 'error' && (msg.code === 'room.expired' || msg.code === 'room.notFound'))) {
        saveSession(null);
        this.close();
      }
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.setOnline(false);
      const delay = Math.min(8000, 400 * 2 ** this.retry++);
      setTimeout(() => this.ws === ws && this.connect(), delay);
    };
  }

  setOnline(v: boolean) {
    if (this.online === v) return;
    this.online = v;
    for (const l of this.statusListeners) l(v);
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else if (msg.t !== 'answer' && msg.t !== 'ping') this.queue.push(msg);
  }

  on(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const net = new Net();
// Maintient la connexion éveillée derrière certains proxys.
setInterval(() => net.ws?.readyState === WebSocket.OPEN && net.send({ t: 'ping' }), 20_000);

/** Crée une partie sur le serveur puis la rejoint. */
/** Dernier jeu lancé (bouton « Continuer » de l'accueil). */
export function lastGame(): CreateRoomReq['settings'] | null {
  try { return JSON.parse(localStorage.getItem('gq.last') ?? 'null'); } catch { return null; }
}
export async function createGame(req: CreateRoomReq, name: string, lang: Lang): Promise<string | null> {
  if (!req.challenge && !req.assignment && !['custom', 'daily', 'review', 'event'].includes(req.settings.category)) {
    try { localStorage.setItem('gq.last', JSON.stringify(req.settings)); } catch { /* stockage indisponible */ }
  }
  try {
    const r = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    const j = await r.json();
    if (!r.ok || !j.code) return j.error ?? 'server';
    net.open(j.code);
    net.send({ t: 'join', name, lang });
    return null;
  } catch {
    return 'server';
  }
}

/** Rejoint une partie existante avec son code. */
export async function joinGame(code: string, name: string, lang: Lang): Promise<string | null> {
  try {
    const r = await fetch(`/api/room/${code}`);
    const j = await r.json();
    if (!j.exists) return 'room.notFound';
  } catch {
    return 'server';
  }
  saveSession(null);
  net.open(code);
  net.send({ t: 'join', name, lang });
  return null;
}
