// Album d'autocollants : un autocollant à chaque partie terminée. Sur l'appareil pour les
// invités ; sur le compte (et l'appareil) pour les joueurs connectés.
import { albumPageFor, ALBUM, STICKERS, STICKER_IDS, type Sticker } from '../shared/stickers';
import { loadEvents } from './events';
import { api, savedAuth } from './account';

const KEY = 'gq.album';
export type Album = Record<string, number>;

export function loadAlbum(): Album {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveAlbum(a: Album) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* ignoré */ }
  window.dispatchEvent(new CustomEvent('gq:album'));
}

/** Tirage dans la page du jeu (ou tout l'album) : les autocollants pas encore collés sortent
 *  deux fois plus souvent, les rares moins. */
function draw(have: Album, page?: string): Sticker {
  const list = ALBUM.find((p) => p.id === page)?.stickers ?? STICKERS;
  const w = list.map((x) => (have[x.id] ? 1 : 2) * (x.rare ? 0.3 : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[0];
}

/** Page d'album du jeu terminé ; défis du jour, de la semaine et événements : selon leur thème. */
async function pageFor(game?: string): Promise<string | undefined> {
  if (game === 'week' || game === 'daily' || game === 'event') {
    const ev = await loadEvents().catch(() => null);
    const e = game === 'week' ? ev?.week : game === 'daily' ? ev?.daily : ev?.active;
    return e?.album ?? (game === 'daily' ? 'travel' : undefined);
  }
  return albumPageFor(game);
}

let lastEarn = 0;
const seen = new Set<string>();
/** Partie terminée : un nouvel autocollant (une fois par fin de partie, même après une reconnexion). */
export async function earnSticker(key?: string, game?: string) {
  const now = Date.now();
  if (now - lastEarn < 1500 || (key && seen.has(key))) return;
  if (key) seen.add(key);
  lastEarn = now;
  const page = await pageFor(game);
  const a = loadAlbum();
  const st = draw(a, page);
  const isNew = !a[st.id];
  a[st.id] = Math.min(99, (a[st.id] ?? 0) + 1);
  saveAlbum(a);
  window.dispatchEvent(new CustomEvent('gq:sticker', { detail: { id: st.id, isNew } }));
  const tk = savedAuth();
  if (tk) void api('/api/album', { body: { op: 'add', id: st.id }, token: tk });
}

/** Connexion : l'album de l'appareil et celui du compte sont réunis (le plus grand nombre gagne). */
export async function syncAlbum(token: string, server: Album | undefined) {
  const local = loadAlbum();
  const merged: Album = { ...(server ?? {}) };
  let push = false;
  for (const [k, n] of Object.entries(local)) {
    if (!STICKER_IDS.has(k)) continue;
    if ((merged[k] ?? 0) < n) { merged[k] = n; push = true; }
  }
  saveAlbum(merged);
  if (push) await api('/api/album', { body: { op: 'merge', s: merged }, token });
}

/** Offrir un doublon : renvoie le code à donner à l'ami. */
export async function giftSticker(id: string): Promise<string | null> {
  const a = loadAlbum();
  if ((a[id] ?? 0) < 2) return null;
  const tk = savedAuth();
  const r = await api('/api/album', { body: { op: 'gift', id }, token: tk ?? undefined });
  if (!r.ok) return null;
  a[id]--;
  saveAlbum(r.data.album ?? a);
  return r.data.code;
}

/** Recevoir un autocollant avec un code. */
export async function claimSticker(code: string): Promise<{ id: string } | { error: string }> {
  const tk = savedAuth();
  const r = await api('/api/album', { body: { op: 'claim', code: code.trim().toUpperCase() }, token: tk ?? undefined });
  if (!r.ok) return { error: r.data?.error ?? 'album.giftNotFound' };
  const a = r.data.album ?? loadAlbum();
  if (!r.data.album) a[r.data.id] = Math.min(99, (a[r.data.id] ?? 0) + 1);
  saveAlbum(a);
  return { id: r.data.id };
}
