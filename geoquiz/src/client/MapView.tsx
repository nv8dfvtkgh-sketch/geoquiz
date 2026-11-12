// Carte SVG zoomable (pincement, molette, glisser) et cliquable au doigt.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { MapData, MapSpec } from '../shared/protocol';
import type { T } from './i18n';

export type Mark = 'bad' | 'good' | 'reveal' | 'picked';

const cache = new Map<string, Promise<MapData>>();
export function loadMap(id: string): Promise<MapData> {
  if (!cache.has(id)) {
    const [kind, iso, level] = id.split(':');
    const url = kind === 'region' ? `/api/map/region/${iso}/${level}` : '/api/map/world';
    cache.set(id, fetch(url).then((r) => { if (!r.ok) throw new Error('map'); return r.json(); }).catch((e) => { cache.delete(id); throw e; }));
  }
  return cache.get(id)!;
}

function useMap(id: string) {
  const [data, setData] = useState<MapData | null>(null);
  useEffect(() => {
    let alive = true;
    loadMap(id).then((d) => alive && setData(d)).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return data;
}

type View = [number, number, number, number];

interface Props {
  spec: MapSpec;
  highlight?: string;
  marks?: Record<string, Mark>;
  onPick?: (id: string) => void;
  /** « Où est-ce ? » : un toucher n'importe où pose l'épingle. */
  onPin?: (p: [number, number]) => void;
  pins?: { mine?: [number, number]; target?: [number, number] };
  t: T;
}

const SMALL_PX = 9; // en dessous, un pays reçoit une cible ronde
const DOT_PX = 5; // rond discret à l'écran
const DOT_FOCUS_PX = 9; // rond mis en avant (réponse, erreur, pays surligné)
const HIT_PX = 14; // zone tactile invisible, plus large que le rond

export function MapView({ spec, highlight, marks = {}, onPick, onPin, pins, t }: Props) {
  const data = useMap(spec.map);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const initial = useMemo<View>(() => frame(spec, data, highlight), [spec, data, highlight]);
  const [view, setView] = useState<View>(initial);
  useEffect(() => setView(initial), [initial]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const upp = Math.max(view[2] / size.w, view[3] / size.h); // unités SVG par pixel
  const minW = Math.max(spec.view[2] / 20, 8);
  const maxW = (data?.w ?? 1000) * 1.2;

  const zoomAt = (factor: number, px: number, py: number) => {
    setView((v) => {
      const u = Math.max(v[2] / size.w, v[3] / size.h);
      const ox = (size.w - v[2] / u) / 2;
      const oy = (size.h - v[3] / u) / 2;
      const ux = v[0] + (px - ox) * u;
      const uy = v[1] + (py - oy) * u;
      const nw = Math.min(maxW, Math.max(minW, v[2] * factor));
      const f = nw / v[2];
      return [ux - (ux - v[0]) * f, uy - (uy - v[1]) * f, v[2] * f, v[3] * f];
    });
  };

  // Molette (écouteur non passif pour empêcher le défilement de la page).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // Glisser / pincer / toucher.
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, target: '' as string, multi: false, dist: 0 });
  const onDown = (e: React.PointerEvent) => {
    const el = e.target as Element;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) gesture.current = { moved: 0, target: el.closest('[data-id]')?.getAttribute('data-id') ?? '', multi: false, dist: 0 };
    else {
      gesture.current.multi = true;
      const [a, b] = [...ptrs.current.values()];
      gesture.current.dist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    ptrs.current.set(e.pointerId, cur);
    const r = svgRef.current!.getBoundingClientRect();
    if (ptrs.current.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      if (gesture.current.moved > 6) setView((v) => {
        const u = Math.max(v[2] / size.w, v[3] / size.h);
        return [v[0] - dx * u, v[1] - dy * u, v[2], v[3]];
      });
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.dist > 0) zoomAt(gesture.current.dist / d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      gesture.current.dist = d;
    }
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    const g = gesture.current;
    if (ptrs.current.size === 0 && !g.multi && g.moved <= 6 && onPin) {
      const svg = svgRef.current!;
      const m = svg.getScreenCTM();
      if (m) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(m.inverse());
        onPin([Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
      }
      return;
    }
    if (ptrs.current.size === 0 && !g.multi && g.moved <= 6 && g.target && onPick) onPick(g.target);
  };

  const active = useMemo(() => new Set(spec.active), [spec.active]);
  const capitals = spec.layer === 'capitals';
  const interactive = !!onPick;
  const pinLayer = pins && (
    <g className="pins">
      {pins.mine && pins.target && <line className="pin-line" x1={pins.mine[0]} y1={pins.mine[1]} x2={pins.target[0]} y2={pins.target[1]} strokeWidth={upp * 2} strokeDasharray={`${upp * 6} ${upp * 4}`} />}
      {pins.target && <circle className="pin-target" cx={pins.target[0]} cy={pins.target[1]} r={upp * 8} strokeWidth={upp * 3} />}
      {pins.mine && <circle className="pin-mine" cx={pins.mine[0]} cy={pins.mine[1]} r={upp * 7} strokeWidth={upp * 2.5} />}
    </g>
  );

  const land = useMemo(() => {
    if (!data) return null;
    return data.features.map((f) => {
      const on = active.has(f.id);
      const cls = ['f', on ? '' : 'off', f.id === highlight ? 'hl' : '', !capitals ? marks[f.id] ?? '' : '', f.line ? 'line' : ''].join(' ');
      const hit = interactive && on && !capitals;
      return (
        <g key={f.id}>
          <path className={cls} d={f.d} data-id={hit ? f.id : undefined} />
          {f.line && hit && <path className="line-hit" d={f.d} data-id={f.id} />}
        </g>
      );
    });
  }, [data, active, highlight, marks, capitals, interactive]);

  // Cibles rondes pour les petits pays et points des capitales, à taille constante à l'écran.
  const dots = useMemo(() => {
    if (!data) return null;
    const out: JSX.Element[] = [];
    for (const f of data.features) {
      if (!active.has(f.id)) continue;
      if (capitals) {
        if (!f.k) continue;
        out.push(<circle key={f.id} className={`cap ${marks[f.id] ?? ''}`} cx={f.k[0]} cy={f.k[1]} r={upp * 6} data-id={interactive ? f.id : undefined} />);
        if (interactive) out.push(<circle key={`${f.id}-hit`} className="hit" cx={f.k[0]} cy={f.k[1]} r={upp * 16} data-id={f.id} />);
        continue;
      }
      if (f.line) continue;
      const px = Math.max(f.b[2] - f.b[0], f.b[3] - f.b[1]) / upp;
      if (px >= SMALL_PX) continue;
      const show = interactive || f.id === highlight || marks[f.id];
      if (!show) continue;
      const focus = f.id === highlight || !!marks[f.id];
      out.push(
        <circle key={f.id} className={`dot ${f.id === highlight ? 'hl' : ''} ${marks[f.id] ?? ''}`} cx={f.c[0]} cy={f.c[1]} r={upp * (focus ? DOT_FOCUS_PX : DOT_PX)} />,
      );
      if (interactive) out.push(<circle key={`${f.id}-hit`} className="hit" cx={f.c[0]} cy={f.c[1]} r={upp * HIT_PX} data-id={f.id} />);
    }
    return out;
  }, [data, active, capitals, marks, upp, interactive, highlight]);

  return (
    <div className={`mapbox ${interactive || onPin ? 'interactive' : ''}`} dir="ltr">
      <svg
        ref={svgRef}
        className="map"
        viewBox={view.join(' ')}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
      >
        <rect className="ocean" x={-5000} y={-5000} width={12000} height={12000} />
        <g className={capitals ? 'land muted' : 'land'}>{land}</g>
        <g>{dots}</g>
        {pinLayer}
      </svg>
      {!data && <div className="map-loading" />}
      <div className="zoom">
        <button type="button" aria-label={t('play.zoomIn')} onClick={() => zoomAt(1 / 1.5, size.w / 2, size.h / 2)}>+</button>
        <button type="button" aria-label={t('play.zoomOut')} onClick={() => zoomAt(1.5, size.w / 2, size.h / 2)}>−</button>
        <button type="button" aria-label={t('play.zoomReset')} onClick={() => setView(initial)}>⤢</button>
      </div>
    </div>
  );
}

/** Cadrage initial : la zone, ou un gros plan si l'entité surlignée est minuscule. */
function frame(spec: MapSpec, data: MapData | null, highlight?: string): View {
  const v = spec.view as View;
  if (!data || !highlight) return v;
  const f = data.features.find((x) => x.id === highlight);
  if (!f) return v;
  const fw = f.b[2] - f.b[0], fh = f.b[3] - f.b[1];
  if (Math.max(fw, fh) > Math.max(v[2], v[3]) * 0.12) return v;
  const s = Math.max(fw * 5, fh * 5, v[2] * 0.25);
  const h = (s * v[3]) / v[2];
  return [f.c[0] - s / 2, f.c[1] - h / 2, s, h];
}

export const MemoMap = memo(MapView);
