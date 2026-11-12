// Compte joueur côté navigateur : jeton de session gardé sur l'appareil, appels à l'API.
import type { Me } from '../shared/protocol';

const KEY = 'gq.auth';
export function savedAuth(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function saveAuth(token: string | null) {
  try { if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY); } catch {}
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const r = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    let data: any = {};
    try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'net' } as any };
  }
}

export const fetchMe = (token: string) => api<Me>('/api/account', { token });

/** Étoiles d'un jeu : une par difficulté réussie (au moins 60 % de bonnes réponses). */
export function starsOf(me: Me | null, game: string): boolean[] | null {
  if (!me) return null;
  const b = me.cats[game]?.best ?? {};
  return (['easy', 'medium', 'hard'] as const).map((d) => (b[d] ?? 0) >= 60);
}
/** Difficulté verrouillée en solo tant que la précédente n'est pas réussie. */
export function lockedFor(me: Me | null, game: string, d: 'easy' | 'medium' | 'hard'): 'easy' | 'medium' | null {
  if (!me || d === 'easy') return null;
  const b = me.cats[game]?.best ?? {};
  if (d === 'medium') return (b.easy ?? 0) >= 60 ? null : 'easy';
  return (b.medium ?? 0) >= 60 ? null : 'medium';
}
