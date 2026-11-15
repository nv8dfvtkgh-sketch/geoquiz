// Événements du moment (quiz spécial + badge) : liste chargée une fois.
import { useEffect, useState } from 'react';
import type { Names } from '../shared/protocol';

export interface EventInfo { id: string; emoji: string; names: Names; end?: string; minAge?: '13-17' | '18+' }
export interface Events { active: EventInfo | null; week?: EventInfo | null; daily?: EventInfo | null; all: EventInfo[] }

/** Défi de la semaine visible pour ce joueur (certains thèmes sont réservés aux 13 ans et plus). */
export function weekFor(e: Events | null): EventInfo | null {
  const w = e?.week;
  if (!w) return null;
  let age = '';
  try { age = localStorage.getItem('gq.age') ?? ''; } catch { /* ignoré */ }
  if (w.minAge === '18+' && age !== '18+') return null;
  if (w.minAge === '13-17' && age === 'u13') return null;
  return w;
}
let cache: Promise<Events> | null = null;
export const loadEvents = () => (cache ??= fetch('/api/events').then((r) => r.json()).catch(() => { cache = null; return { active: null, all: [] }; }));

export function useEvents(): Events | null {
  const [e, setE] = useState<Events | null>(null);
  useEffect(() => { loadEvents().then(setE); }, []);
  return e;
}
