// Éléments des nouveaux jeux : maillot dessiné, cri d'animal, drapeau mystère,
// frise à remettre dans l'ordre, piste de course des tables.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KitSpec, PublicPlayer, QuestionMsg, Reveal } from '../shared/protocol';
import { useApp } from './state';

// ------------------------------------------------------------------ maillot (couleurs seulement, aucun logo)
const BODY = 'M62 18 L82 10 Q100 22 118 10 L138 18 L184 48 L168 84 L150 74 L150 168 L50 168 L50 74 L32 84 L16 48 Z';
const LEFT_SLEEVE = 'M62 18 L16 48 L32 84 L50 74 L50 40 Z';
const RIGHT_SLEEVE = 'M138 18 L184 48 L168 84 L150 74 L150 40 Z';
const SHORTS = 'M54 172 L146 172 L152 214 L108 214 L100 196 L92 214 L48 214 Z';

export function Jersey({ kit }: { kit: KitSpec }) {
  const [a, b = a, c] = kit.c;
  const id = useMemo(() => `k${Math.random().toString(36).slice(2, 8)}`, []);
  const fill: JSX.Element[] = [];
  const rect = (k: string, x: number, y: number, w: number, h: number, color: string) => fill.push(<rect key={k} x={x} y={y} width={w} height={h} fill={color} />);
  rect('base', 0, 0, 200, 200, a);
  switch (kit.p) {
    case 'stripes': for (let i = 0, x = 2; x < 200; i++, x += 16) if (i % 2) rect(`s${i}`, x, 0, 16, 200, b); break;
    case 'hoops': for (let i = 0, y = 4; y < 200; i++, y += 18) if (i % 2) rect(`h${i}`, 0, y, 200, 18, b); break;
    case 'halves': rect('r', 100, 0, 100, 200, b); break;
    case 'band': if (c) rect('e', 74, 0, 52, 200, c); rect('b', 80, 0, 40, 200, b); break;
    case 'hband': rect('b', 0, 74, 200, 30, b); break;
    case 'hbands': rect('b1', 0, 62, 200, 9, b); rect('b2', 0, 78, 200, 9, b); break;
    case 'sash': fill.push(<path key="sash" d="M58 10 L92 10 L170 168 L136 168 Z" fill={b} />); break;
    case 'checks': for (let x = 0; x < 200; x += 20) for (let y = 0; y < 200; y += 20) if (((x + y) / 20) % 2) rect(`c${x}-${y}`, x, y, 20, 20, b); break;
  }
  const trim = kit.p === 'plain' && kit.c[1] ? kit.c[1] : kit.p === 'sleeves' ? a : b;
  return (
    <svg className="jersey" viewBox="0 0 200 220" role="img" aria-label="?">
      <defs><clipPath id={id}><path d={BODY} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>{fill}</g>
      {kit.p === 'sleeves' && <><path d={LEFT_SLEEVE} fill={b} /><path d={RIGHT_SLEEVE} fill={b} /></>}
      {/* Col et poignets */}
      <path d="M82 10 Q100 22 118 10 L112 9 Q100 30 88 9 Z" fill={trim} />
      <path d="M16 48 L32 84 L36 82 L20 46 Z M184 48 L168 84 L164 82 L180 46 Z" fill={trim} opacity={kit.p === 'plain' && !kit.c[1] ? 0 : 1} />
      <path d={BODY} fill="none" className="jersey-line" />
      <path d={SHORTS} fill={kit.sh} className="jersey-line" />
    </svg>
  );
}

// ------------------------------------------------------------------ cri d'animal
/** Le son est téléchargé puis lu depuis la mémoire (Safari reçoit la version MP3). */
export function SoundClip({ token, auto = true }: { token: string; auto?: boolean }) {
  const { t } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'playing' | 'error'>('loading');
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    let alive = true;
    let made = '';
    const ogg = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
    const load = (f: string) => fetch(`/api/img/${token}${f}`).then((r) => { if (!r.ok) throw new Error(); return r.blob(); });
    (ogg ? load('').catch(() => load('?f=mp3')) : load('?f=mp3').catch(() => load('')))
      .then((b) => { if (!alive) return; made = URL.createObjectURL(b); setUrl(made); setState('ready'); })
      .catch(() => alive && setState('error'));
    return () => { alive = false; audio.current?.pause(); if (made) URL.revokeObjectURL(made); };
  }, [token]);
  const play = () => {
    if (!url) return;
    audio.current?.pause();
    const a = new Audio(url);
    audio.current = a;
    a.onended = () => setState('ready');
    a.play().then(() => setState('playing')).catch(() => setState('ready'));
  };
  useEffect(() => { if (url && auto) play(); }, [url]); // lecture automatique quand le navigateur l'autorise
  return (
    <button type="button" className={`sound-btn ${state}`} onClick={play} disabled={state === 'loading' || state === 'error'}>
      <span className="sound-waves" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      {state === 'error' ? t('play.soundError') : state === 'loading' ? t('play.soundLoading') : t('play.listen')}
    </button>
  );
}

// ------------------------------------------------------------------ drapeau mystère
/** Des cases cachent le drapeau et tombent une à une ; tout se dévoile à la réponse. */
export function MysteryFlag({ q, open, children }: { q: QuestionMsg; open: boolean; children: React.ReactNode }) {
  const { s } = useApp();
  const N = 12;
  const order = useMemo(() => {
    const a = Array.from({ length: N }, (_, i) => i);
    let x = q.index * 7919 + 13;
    for (let i = N - 1; i > 0; i--) { x = (x * 48271) % 2147483647; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }, [q.index]);
  const total = q.timeLimit ?? 14000;
  const step = total / (N + 2);
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const t0 = s.qAt - (q.timeLimit && q.remaining !== null ? q.timeLimit - q.remaining : 0);
    const id = setInterval(() => setShown(Math.min(N, 1 + Math.floor((performance.now() - t0) / step))), 150);
    return () => clearInterval(id);
  }, [q.index, s.qAt, step]);
  const gone = new Set(open ? order : order.slice(0, shown));
  return (
    <div className="mystery">
      {children}
      <div className="mystery-grid" aria-hidden="true">
        {Array.from({ length: N }, (_, i) => <span key={i} className={gone.has(i) ? 'off' : ''} />)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ frise : remettre dans l'ordre
export function OrderBoard({ q, locked, reveal, onSubmit }: { q: QuestionMsg; locked: boolean; reveal?: Reveal; onSubmit?: (v: string) => void }) {
  const { t } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [q.index]);
  const opts = q.options ?? [];
  const tap = (id: string) => {
    if (locked || !onSubmit) return;
    setPicked((p) => (p.includes(id) ? p.slice(0, p.indexOf(id)) : [...p, id]));
  };
  const right = reveal?.order;
  return (
    <div className="order-board">
      <p className="order-hint">{t('play.orderHint')}</p>
      <ol className="order-list">
        {opts.map((o, i) => {
          const pos = picked.indexOf(o.id);
          const good = right ? right.indexOf(o.id) : -1;
          const cls = right ? (pos === good ? 'good' : pos >= 0 ? 'bad' : '') : pos >= 0 ? 'chosen' : '';
          return (
            <li key={o.id} style={{ '--i': i } as React.CSSProperties}>
              <button type="button" className={`order-item ${cls}`} onClick={() => tap(o.id)} disabled={locked && !right}>
                <span className="order-rank">{right ? good + 1 : pos >= 0 ? pos + 1 : ''}</span>
                <span dir="auto">{o.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {!right && onSubmit && (
        <div className="order-actions">
          <button type="button" className="btn ghost" disabled={locked || !picked.length} onClick={() => setPicked([])}>{t('play.orderReset')}</button>
          <button type="button" className="btn primary" disabled={locked || picked.length !== opts.length} onClick={() => onSubmit(picked.join(','))}>{t('play.validate')}</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ course aux tables
export function RaceTrack({ players, you, total }: { players: PublicPlayer[]; you?: string; total: number }) {
  const lanes = players.slice().sort((a, b) => b.score - a.score).slice(0, 6);
  const max = Math.max(1, total * 1000);
  const cars = ['🏎️', '🚗', '🚙', '🚕', '🚓', '🚌'];
  return (
    <div className="race" aria-hidden="true">
      {lanes.map((p, i) => (
        <div key={p.id} className={`lane ${p.id === you ? 'me' : ''}`}>
          <span className="lane-name" dir="auto">{p.name}</span>
          <span className="lane-track">
            <span className="car" style={{ insetInlineStart: `${Math.min(100, (p.score / max) * 100)}%` }}>{cars[i % cars.length]}</span>
          </span>
          <span className="lane-flag">🏁</span>
        </div>
      ))}
    </div>
  );
}
