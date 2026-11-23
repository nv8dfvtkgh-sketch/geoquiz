// Événements du moment (quiz spécial + badge) : liste chargée une fois.
import { useEffect, useState } from 'react';
import type { Names } from '../shared/protocol';

export interface EventInfo { id: string; emoji: string; names: Names; end?: string; minAge?: '13-17' | '18+'; album?: string }
/** Grand événement du moment (page « Événements »). */
export interface LiveInfo { id: string; emoji: string; names: Names; game: string; from: string; to: string; place?: Names; color?: string; count: number; minAge?: '13-17' | '18+' }
export interface Events { live?: LiveInfo[]; active: EventInfo | null; week?: EventInfo | null; weekKid?: EventInfo | null; month?: EventInfo | null; daily?: EventInfo | null; all: EventInfo[] }

/** Défi de la semaine visible pour ce joueur (certains thèmes sont réservés aux 13 ans et plus). */
export function weekFor(e: Events | null): EventInfo | null {
  const w = e?.week;
  if (!w) return null;
  let age = '';
  try { age = localStorage.getItem('gq.age') ?? ''; } catch { /* ignoré */ }
  // Thème réservé aux plus grands : le joueur garde le défi de la semaine habituel (s'il y en a un).
  if (w.minAge === '18+' && age !== '18+') return e?.weekKid ?? null;
  if (w.minAge === '13-17' && age !== '13-17' && age !== '18+') return e?.weekKid ?? null;
  return w;
}
/** Challenge du mois visible pour ce joueur (rien si le thème est réservé aux plus grands). */
export function monthFor(e: Events | null): EventInfo | null {
  const m = e?.month;
  if (!m) return null;
  let age = '';
  try { age = localStorage.getItem('gq.age') ?? ''; } catch { /* ignoré */ }
  if (m.minAge === '18+' && age !== '18+') return null;
  if (m.minAge === '13-17' && age !== '13-17' && age !== '18+') return null;
  return m;
}
/** Événements en direct visibles pour ce joueur (âge). */
export function liveFor(e: Events | null): LiveInfo[] {
  let age = '';
  try { age = localStorage.getItem('gq.age') ?? ''; } catch { /* ignoré */ }
  return (e?.live ?? []).filter((l) => !l.minAge || (l.minAge === '18+' ? age === '18+' : age === '13-17' || age === '18+'));
}
/** Compte à rebours d'un événement : avant, pendant, après. */
export function liveStatus(l: { from: string; to: string }, now = new Date()): { k: 'soon' | 'tomorrow' | 'today' | 'on' | 'last' | 'over'; n: number } {
  const day = now.toISOString().slice(0, 10);
  const diff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
  if (day < l.from) { const n = diff(l.from, day); return { k: n === 1 ? 'tomorrow' : 'soon', n }; }
  if (day > l.to) return { k: 'over', n: 0 };
  if (l.from === l.to) return { k: 'today', n: 0 };
  return { k: day === l.to ? 'last' : 'on', n: 0 };
}
let cache: Promise<Events> | null = null;
export const loadEvents = () => (cache ??= fetch('/api/events').then((r) => r.json()).catch(() => { cache = null; return { active: null, all: [] }; }));

export function useEvents(): Events | null {
  const [e, setE] = useState<Events | null>(null);
  useEffect(() => { loadEvents().then(setE); }, []);
  return e;
}
