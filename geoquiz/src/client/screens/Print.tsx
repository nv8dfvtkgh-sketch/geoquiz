// Fiches à imprimer (A4) : carte muette numérotée, drapeaux à nommer, quiz à cocher, avec corrigé.
import { useEffect, useMemo, useState } from 'react';
import type { Difficulty, KitSpec, MapData, ZoneInfo } from '../../shared/protocol';
import { FAMILIES } from '../games';
import { Jersey } from '../GameExtras';
import { loadMap } from '../MapView';
import { RoadSign } from '../RoadSign';
import { useApp } from '../state';

/** Jeux qui ne s'impriment pas en quiz (carte cliquable, photo, son…) : même liste que le serveur. */
const NOT_PRINTABLE = new Set(['custom', 'daily', 'pin', 'chain', 'countries', 'regions', 'sounds', 'monuments', 'stadiums', 'brands', 'review', 'league', 'passport']);
export const printableGame = (id: string) => ['countries', 'regions', 'pin'].includes(id) || !NOT_PRINTABLE.has(id);

type Kind = 'map' | 'flags' | 'quiz';
interface Item { id: string; n: number; name: string }
interface Q {
  n: number; kind: 'mcq' | 'order'; promptKey: string; name?: string; params?: Record<string, string>;
  emoji?: string; sign?: string; kit?: KitSpec; shape?: { d: string; w: number; h: number }; flag?: string;
  options: { label?: string; flag?: string }[]; answer: string; answerLabel: string;
}
type Sheet = { kind: 'map'; map: string; view: [number, number, number, number]; active: string[]; items: Item[] } | { kind: 'flags'; items: Item[] } | { kind: 'quiz'; category: string; questions: Q[] };

/** Réglages de départ selon le jeu d'où l'on vient. */
function presetFor(game: string): { kind: Kind; zone: string; category: string } {
  if (game === 'regions') return { kind: 'map', zone: 'r:MA:groups', category: 'flags' };
  if (game === 'countries' || game === 'pin') return { kind: 'map', zone: 'world', category: 'capitals' };
  if (game === 'flags' || game === 'flagreveal') return { kind: 'flags', zone: 'world', category: 'flags' };
  if (game && !NOT_PRINTABLE.has(game)) return { kind: 'quiz', zone: 'world', category: game };
  return { kind: 'map', zone: 'world', category: 'capitals' };
}

export function PrintScreen() {
  const { t, s, go, lang, catalog } = useApp();
  const start = useMemo(() => presetFor(s.game), []);
  const [kind, setKind] = useState<Kind>(start.kind);
  const [zone, setZone] = useState(start.zone);
  const [category, setCategory] = useState(start.category);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [count, setCount] = useState(20);
  const [withKey, setWithKey] = useState(true);
  const [seed, setSeed] = useState(0);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetch('/api/print', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, zone, category, difficulty, count, lang }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setSheet(j))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [kind, zone, category, difficulty, count, lang, seed]);

  const zoneName = (z: ZoneInfo) => (z.kind === 'regions' ? `${t('print.regionsOf')} ${z.names?.[lang] ?? ''}` : t(`zone.${z.id.replace(':', '.')}`));
  const zones = (catalog?.zones ?? []).filter((z) => z.kind === 'world' || z.kind === 'continent' || (kind === 'map' && z.kind === 'regions' && z.level === 'groups'));
  const games = FAMILIES.flatMap((f) => f.games).filter((g) => !g.soon && !NOT_PRINTABLE.has(g.id));
  const title = kind === 'quiz' ? t(`cat.${category}`) : `${t(kind === 'map' ? 'print.mapTitle' : 'print.flagsTitle')} · ${zoneName(zones.find((z) => z.id === zone) ?? zones[0] ?? ({ id: 'world', kind: 'world' } as ZoneInfo))}`;
  const total = !sheet ? 0 : sheet.kind === 'quiz' ? sheet.questions.length : sheet.items.length;

  return (
    <div className="print-page">
      <div className="print-controls panel">
        <button type="button" className="back-link" onClick={() => { history.replaceState(null, '', '/'); go('home'); }}>‹ {t('setup.backHome')}</button>
        <h1>{t('print.title')}</h1>
        <p className="muted">{t('print.hint')}</p>
        <div className="seg">
          {(['map', 'flags', 'quiz'] as Kind[]).map((k) => (
            <button type="button" key={k} aria-pressed={kind === k} onClick={() => { setKind(k); if (k === 'flags' && zone.startsWith('r:')) setZone('world'); }}>{t(`print.kind.${k}`)}</button>
          ))}
        </div>
        <div className="row2">
          {kind === 'quiz' ? (
            <label className="field">
              <span>{t('print.game')}</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {FAMILIES.map((f) => {
                  const list = f.games.filter((g) => games.includes(g));
                  return list.length ? <optgroup key={f.id} label={t(`family.${f.id}`)}>{list.map((g) => <option key={g.id} value={g.id}>{t(`cat.${g.id}`)}</option>)}</optgroup> : null;
                })}
              </select>
            </label>
          ) : (
            <label className="field">
              <span>{t('setup.zone')}</span>
              <select value={zone} onChange={(e) => setZone(e.target.value)}>
                {zones.map((z) => <option key={z.id} value={z.id}>{zoneName(z)}</option>)}
              </select>
            </label>
          )}
          {!zone.startsWith('r:') || kind !== 'map' ? (
            <label className="field">
              <span>{t('setup.count')}</span>
              <select value={count} onChange={(e) => setCount(+e.target.value)}>
                {(kind === 'quiz' ? [10, 15, 20, 30] : [10, 20, 30, 40]).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ) : <span />}
        </div>
        {!(kind === 'map' && zone.startsWith('r:')) && (
          <div className="seg">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button type="button" key={d} aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}>{t(`diff.${d}`)}</button>
            ))}
          </div>
        )}
        <label className="toggle">
          <input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} />
          <span><strong>{t('print.withKey')}</strong><small>{t('print.withKeyHint')}</small></span>
        </label>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => setSeed((x) => x + 1)}>{t('print.another')}</button>
          <button type="button" className="btn primary" disabled={!sheet} onClick={() => window.print()}>🖨️ {t('print.print')}</button>
        </div>
        {error && <p className="error" role="alert">{t('print.error')}</p>}
      </div>

      {sheet && (
        <div className="sheets">
          <article className="ws-page">
            <SheetHead title={title} total={total} />
            {sheet.kind === 'map' && <MapSheet sheet={sheet} />}
            {sheet.kind === 'flags' && <FlagsSheet items={sheet.items} />}
            {sheet.kind === 'quiz' && <QuizSheet questions={sheet.questions} />}
          </article>
          {withKey && (
            <article className="ws-page key">
              <SheetHead title={`${t('print.key')} · ${title}`} />
              {sheet.kind === 'quiz'
                ? <ol className="key-list">{sheet.questions.map((q) => <li key={q.n}><strong>{q.answer}</strong> <span dir="auto">{q.answerLabel}</span></li>)}</ol>
                : <ol className="key-list cols">{sheet.items.slice().sort((a, b) => a.n - b.n).map((i) => <li key={i.id} dir="auto">{i.name}</li>)}</ol>}
            </article>
          )}
        </div>
      )}
    </div>
  );
}

function SheetHead({ title, total }: { title: string; total?: number }) {
  const { t } = useApp();
  return (
    <header className="ws-head">
      <div className="ws-brand"><img src="/logo.svg" alt="" width={28} height={28} /> Quizellige</div>
      <h2>{title}</h2>
      {total !== undefined && (
        <div className="ws-fields">
          <span>{t('print.name')} <i /></span>
          <span>{t('print.date')} <i className="short" /></span>
          <span>{t('print.score')} <i className="short" /> / {total}</span>
        </div>
      )}
    </header>
  );
}

function MapSheet({ sheet }: { sheet: Extract<Sheet, { kind: 'map' }> }) {
  const [data, setData] = useState<MapData | null>(null);
  useEffect(() => { loadMap(sheet.map).then(setData).catch(() => {}); }, [sheet.map]);
  const nums = new Map(sheet.items.map((i) => [i.id, i.n]));
  const active = new Set(sheet.active);
  let [x, y, w, h] = sheet.view;
  const pad = Math.max(w, h) * 0.03;
  x -= pad; y -= pad; w += pad * 2; h += pad * 2;
  const r = Math.max(w, h) * 0.013;
  return (
    <>
      <svg className="print-map" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        {data?.features.map((f) => <path key={f.id} d={f.d} className={active.has(f.id) ? (nums.has(f.id) ? 'on' : 'in') : 'off'} />)}
        {data?.features.filter((f) => nums.has(f.id)).map((f) => (
          <g key={`n${f.id}`}>
            <circle cx={f.c[0]} cy={f.c[1]} r={r} />
            <text x={f.c[0]} y={f.c[1]} fontSize={r * 1.15} dy=".36em">{nums.get(f.id)}</text>
          </g>
        ))}
      </svg>
      <ol className="answer-lines">{sheet.items.map((i) => <li key={i.id}><span>{i.n}.</span><i /></li>)}</ol>
    </>
  );
}

function FlagsSheet({ items }: { items: Item[] }) {
  return (
    <ol className="flag-grid">
      {items.map((i) => (
        <li key={i.id}>
          <span className="n">{i.n}</span>
          <img src={`/api/flag/${i.id}.svg`} alt="" />
          <i />
        </li>
      ))}
    </ol>
  );
}

function QuizSheet({ questions }: { questions: Q[] }) {
  const { t } = useApp();
  return (
    <ol className="print-quiz">
      {questions.map((q) => {
        const label = t(q.promptKey, { ...(q.params ?? {}), ...(q.name ? { name: q.name } : {}) });
        return (
          <li key={q.n}>
            <div className="pq-head">
              <span className="n">{q.n}</span>
              <div dir="auto">
                {q.name && !label.includes(q.name) ? <><small>{label}</small><strong>{q.name}</strong></> : <strong>{label}</strong>}
              </div>
              {q.emoji && <span className="pq-emoji">{q.emoji}</span>}
            </div>
            {(q.sign || q.kit || q.flag || q.shape) && (
              <div className="pq-media">
                {q.sign && <RoadSign id={q.sign} />}
                {q.kit && <Jersey kit={q.kit} />}
                {q.flag && <img className="pq-flag" src={`/api/flag/${q.flag}.svg`} alt="" />}
                {q.shape && <svg className="pq-shape" viewBox={`0 0 ${q.shape.w} ${q.shape.h}`}><path d={q.shape.d} /></svg>}
              </div>
            )}
            {q.kind === 'order' && <p className="pq-hint">{t('print.orderHint')}</p>}
            <ul className={`pq-options ${q.options.some((o) => o.flag) ? 'flags' : ''}`}>
              {q.options.map((o, k) => (
                <li key={k}>
                  <span className="box">{q.kind === 'order' ? '' : 'ABCD'[k]}</span>
                  {q.kind === 'order' && <b>{'ABCD'[k]}</b>}
                  {o.flag && <img src={`/api/flag/${o.flag}.svg`} alt="" />}
                  {o.label && <span dir="auto">{o.label}</span>}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
