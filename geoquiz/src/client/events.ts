// Événements du moment (quiz spécial + badge) : liste chargée une fois.
import { useEffect, useState } from 'react';
import type { Names } from '../shared/protocol';

export interface EventInfo { id: string; emoji: string; names: Names; end?: string }
export interface Events { active: EventInfo | null; all: EventInfo[] }
let cache: Promise<Events> | null = null;
export const loadEvents = () => (cache ??= fetch('/api/events').then((r) => r.json()).catch(() => { cache = null; return { active: null, all: [] }; }));

export function useEvents(): Events | null {
  const [e, setE] = useState<Events | null>(null);
  useEffect(() => { loadEvents().then(setE); }, []);
  return e;
}
