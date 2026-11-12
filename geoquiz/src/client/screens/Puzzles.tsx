// Énigmes du jour, jouées dans le navigateur : pays caché (chaud / froid), capitale du jour (façon
// Wordle) et silhouette boussole. Une énigme par jour, la même pour tous ; puis des parties libres.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapData } from '../../shared/protocol';
import { useApp } from '../state';
import { Confetti } from '../Celebrate';
import { sfx } from '../sound';
import {
  arrowOf, bearing, borderKm, famous, hash, km, letters, loadGeo, loadPuzzle, loadWorld, matchCountry, nameOf, pickDaily,
  savePuzzle, scoreWord, shareText, streakOf, suggest, today, type GeoCountry, type PuzzleSave,
} from '../geo';

let from: 'today' | 'home' = 'today';
/** D'où vient le joueur (accueil ou onglet « Aujourd'hui ») : le bouton retour y ramène. */
export const cameFrom = (f: 'today' | 'home') => { from = f; };
export function PuzzleBack({ to }: { to?: 'today' | 'home' }) {
  const { t, go } = useApp();
  to ??= from;
  return <button type="button" className="back-link" onClick={() => { history.replaceState(null, '', '/'); go(to); }}>‹ {t(to === 'today' ? 'nav.today' : 'setup.backHome')}</button>;
}

function useGeo() {
  const [geo, setGeo] = useState<GeoCountry[] | null>(null);
  const [world, setWorld] = useState<MapData | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    Promise.all([loadGeo(), loadWorld()]).then(([g, w]) => { setGeo(g); setWorld(w); }).catch(() => setErr(true));
  }, []);
  return { geo, world, err };
}

/** Champ de saisie d'un pays (ou d'une capitale) avec suggestions. */
export function CountryInput({ list, onPick, exclude, capitals = false, disabled, placeholder }: {
  list: GeoCountry[]; onPick: (c: GeoCountry) => void; exclude: Set<string>; capitals?: boolean; disabled?: boolean; placeholder: string;
}) {
  const { t, lang } = useApp();
  const [v, setV] = useState('');
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const sugg = useMemo(() => suggest(v, list, lang, new Set(), capitals), [v, list, lang, capitals]);
  const take = (c: GeoCountry | null) => {
    if (!c) { setMsg(t('pz.unknown')); sfx.bad(); return; }
    if (exclude.has(c.id)) { setMsg(t('pz.already')); setV(''); return; }
    setMsg(''); setV(''); onPick(c);
    ref.current?.focus();
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.trim()) return;
    const exact = matchCountry(v, list, capitals);
    take(exact ?? (sugg.length === 1 ? sugg[0] : null));
  };
  return (
    <form className="pz-input" onSubmit={submit}>
      <div className="pz-field">
        <input ref={ref} value={v} disabled={disabled} onChange={(e) => { setV(e.target.value); setMsg(''); }} placeholder={placeholder}
          autoComplete="off" autoCorrect="off" spellCheck={false} dir="auto" aria-label={placeholder} />
        <button className="btn primary" disabled={disabled || !v.trim()}>{t('play.validate')}</button>
      </div>
      {!!sugg.length && v.trim() && (
        <div className="pz-sugg" role="listbox">
          {sugg.map((c) => (
            <button type="button" key={c.id} role="option" aria-selected="false" className={exclude.has(c.id) ? 'used' : ''} onClick={() => take(c)}>
              <img src={`/api/flag/${c.id}.svg`} alt="" width="22" height="16" loading="lazy" />
              <span dir="auto">{capitals ? nameOf(c.cap, lang) : nameOf(c.n, lang)}</span>
            </button>
          ))}
        </div>
      )}
      {msg && <p className="pz-msg" role="alert">{msg}</p>}
    </form>
  );
}

/** Bandeau commun : titre, énigme du jour ou partie libre, série. */
function Head({ game, free, onFree, onDaily }: { game: string; free: boolean; onFree: () => void; onDaily: () => void }) {
  const { t } = useApp();
  const streak = streakOf(game);
  return (
    <div className="pz-head">
      <PuzzleBack />
      <h1>{t(`cat.${game}`)}</h1>
      <p className="muted">{t(`pz.${game}How`)}</p>
      <div className="pz-modes">
        <div className="seg" role="group">
          <button type="button" aria-pressed={!free} onClick={onDaily}>{t('pz.daily')}</button>
          <button type="button" aria-pressed={free} onClick={onFree}>{t('pz.freeMode')}</button>
        </div>
        {streak > 0 && <span className="pz-streak">{t('pz.streak', { n: streak })}</span>}
      </div>
    </div>
  );
}

function ShareButton({ text }: { text: string }) {
  const { t } = useApp();
  const [done, setDone] = useState('');
  return <button type="button" className="btn primary" onClick={() => shareText(text).then((r) => setDone(r === 'copied' ? t('pz.copied') : ''))}>{done || t('pz.share')}</button>;
}

/** Fin d'énigme : réponse, partage, partie libre. */
function End({ won, target, n, share, onFree, free }: { won: boolean; target: GeoCountry; n: number; share: string; onFree: () => void; free: boolean }) {
  const { t, lang } = useApp();
  return (
    <div className={`pz-end ${won ? 'won' : 'lost'}`}>
      {won && <Confetti size="big" />}
      <img src={`/api/flag/${target.id}.svg`} alt="" width="64" height="48" />
      <div>
        <strong dir="auto">{won ? t('pz.found', { n }) : t('pz.lost', { name: nameOf(target.n, lang) })}</strong>
        {won && <small dir="auto">{nameOf(target.n, lang)}{target.cap ? ` · ${nameOf(target.cap, lang)}` : ''}</small>}
        {!free && <small>{t('pz.next')}</small>}
      </div>
      <div className="pz-end-actions">
        {!free && <ShareButton text={share} />}
        <button type="button" className="btn" onClick={onFree}>{t('pz.free')}</button>
      </div>
    </div>
  );
}

/** Énigme du jour ou partie libre : cible, sauvegarde, recommencer. */
function usePuzzle(game: string, pool: GeoCountry[] | null) {
  const day = today();
  const [free, setFree] = useState<string | null>(null); // graine de partie libre
  const [save, setSave] = useState<PuzzleSave>(() => loadPuzzle(game, day));
  const target = useMemo(() => {
    if (!pool?.length) return null;
    return free ? pool[hash(free) % pool.length] : pickDaily(pool, game, day);
  }, [pool, free, game, day]);
  const update = (s: PuzzleSave) => {
    setSave(s);
    if (!free) savePuzzle(game, day, s);
    if (s.done && !save.done) window.dispatchEvent(new CustomEvent('gq:finished', { detail: { game, score: s.won ? 1 : 0 } }));
  };
  const newFree = () => { setFree(`${game}:${Date.now()}`); setSave({ guesses: [], done: false, won: false }); window.scrollTo(0, 0); };
  const daily = () => { setFree(null); setSave(loadPuzzle(game, day)); };
  return { day, free: !!free, target, save, update, newFree, daily };
}

// ======================================================================= pays caché
const heat = (d: number) => {
  // 0 km : rouge foncé ; 6 000 km et plus : jaune très pâle.
  const x = Math.min(1, d / 6000) ** 0.6;
  const h = 0 + 48 * x, l = 32 + 58 * x, s = 85 - 15 * x;
  return `hsl(${h} ${s}% ${l}%)`;
};
const square = (d: number) => (d === 0 ? '🟥' : d < 1000 ? '🟧' : d < 3000 ? '🟨' : '⬜');

export function GlobleScreen() {
  const { t, lang } = useApp();
  const { geo, world, err } = useGeo();
  const pool = useMemo(() => (geo ? famous(geo, 150) : null), [geo]);
  const pz = usePuzzle('globle', pool);
  const { target, save } = pz;
  const byId = useMemo(() => new Map(geo?.map((c) => [c.id, c]) ?? []), [geo]);
  const rows = useMemo(() => {
    if (!target || !world) return [];
    return save.guesses.map((id) => byId.get(id)).filter((c): c is GeoCountry => !!c).map((c) => ({ c, d: c.id === target.id ? -1 : borderKm(c, target, world) }));
  }, [save.guesses, target, world, byId]);
  if (err) return <div className="panel"><PuzzleBack /><p className="error">{t('pz.loadError')}</p></div>;
  if (!geo || !world || !target) return <div className="loading" />;
  const guess = (c: GeoCountry) => {
    const guesses = [...save.guesses, c.id];
    const won = c.id === target.id;
    if (won) sfx.good(); else sfx.tick();
    pz.update({ ...save, guesses, done: won, won });
  };
  const fills: Record<string, string> = {};
  for (const r of rows) fills[r.c.id] = r.d < 0 ? 'var(--good)' : heat(r.d);
  if (save.done && !save.won) fills[target.id] = 'var(--good)';
  const sorted = [...rows].sort((a, b) => a.d - b.d);
  const share = `${t('pz.shareGloble', { day: pz.day })}\n${rows.map((r) => (r.d < 0 ? '🟩' : square(r.d))).join('')}\n${save.won ? t('pz.found', { n: rows.length }) : '❌'}\n${location.origin}`;
  return (
    <div className="pz panel">
      <Head game="globle" free={pz.free} onFree={pz.newFree} onDaily={pz.daily} />
      <WorldHeat world={world} fills={fills} />
      {save.done ? (
        <End won={save.won} target={target} n={rows.length} share={share} onFree={pz.newFree} free={pz.free} />
      ) : (
        <>
          <CountryInput list={geo} onPick={guess} exclude={new Set(save.guesses)} placeholder={t('pz.placeholder')} />
          {rows.length >= 8 && <button type="button" className="text-btn" onClick={() => pz.update({ ...save, done: true, won: false })}>{t('pz.giveUp')}</button>}
        </>
      )}
      {!!rows.length && (
        <ol className="pz-list">
          {sorted.map((r, i) => (
            <li key={r.c.id} className={r.d < 0 ? 'win' : ''}>
              <i style={{ background: fills[r.c.id] }} aria-hidden="true" />
              <span dir="auto">{nameOf(r.c.n, lang)}</span>
              {i === 0 && r.d >= 0 && <small className="pz-tag">{t('pz.closest')}</small>}
              <b>{r.d < 0 ? '🎉' : r.d === 0 ? t('pz.border') : `${r.d.toLocaleString(lang)} km`}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function WorldHeat({ world, fills }: { world: MapData; fills: Record<string, string> }) {
  return (
    <div className="pz-map" dir="ltr">
      <svg viewBox={`0 ${world.h * 0.04} ${world.w} ${world.h * 0.84}`} role="img">
        <rect className="ocean" x={-50} y={-50} width={world.w + 100} height={world.h + 100} />
        {world.features.map((f) => <path key={f.id} d={f.d} className="pz-land" style={fills[f.id] ? { fill: fills[f.id] } : undefined} />)}
        {world.features.filter((f) => fills[f.id] && Math.max(f.b[2] - f.b[0], f.b[3] - f.b[1]) < 6).map((f) => (
          <circle key={`d${f.id}`} cx={f.c[0]} cy={f.c[1]} r={4} style={{ fill: fills[f.id] }} className="pz-dot" />
        ))}
      </svg>
    </div>
  );
}

// ======================================================================= silhouette boussole
const MAX_COMPASS = 6;
export function CompassScreen() {
  const { t, lang } = useApp();
  const { geo, world, err } = useGeo();
  const pool = useMemo(() => (geo && world ? famous(geo, 170).filter((c) => world.features.some((f) => f.id === c.id && f.a > 4)) : null), [geo, world]);
  const pz = usePuzzle('compass', pool);
  const { target, save } = pz;
  const byId = useMemo(() => new Map(geo?.map((c) => [c.id, c]) ?? []), [geo]);
  if (err) return <div className="panel"><PuzzleBack /><p className="error">{t('pz.loadError')}</p></div>;
  if (!geo || !world || !target) return <div className="loading" />;
  const f = world.features.find((x) => x.id === target.id)!;
  const [x0, y0, x1, y1] = f.b;
  const pad = Math.max(x1 - x0, y1 - y0) * 0.08;
  const rows = save.guesses.map((id) => byId.get(id)!).filter(Boolean).map((c) => {
    const d = c.id === target.id ? 0 : Math.round(km(c.ll, target.ll));
    return { c, d, pct: c.id === target.id ? 100 : Math.max(0, Math.round(100 - d / 200)), dir: arrowOf(bearing(c.ll, target.ll)) };
  });
  const guess = (c: GeoCountry) => {
    const guesses = [...save.guesses, c.id];
    const won = c.id === target.id;
    const done = won || guesses.length >= MAX_COMPASS;
    if (won) sfx.good(); else sfx.bad();
    pz.update({ ...save, guesses, done, won });
  };
  const bar = (pct: number) => Array.from({ length: 5 }, (_, i) => (pct >= (i + 1) * 20 ? '🟩' : pct > i * 20 ? '🟨' : '⬜')).join('');
  const share = `${t('pz.shareCompass', { day: pz.day })} ${save.won ? rows.length : 'X'}/${MAX_COMPASS}\n${rows.map((r) => `${bar(r.pct)}${r.d === 0 ? '🎉' : r.dir}`).join('\n')}\n${location.origin}`;
  const hint = rows.length >= 3 && !save.done;
  return (
    <div className="pz panel">
      <Head game="compass" free={pz.free} onFree={pz.newFree} onDaily={pz.daily} />
      <div className="pz-shape">
        <svg viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`} role="img" aria-label={t('pz.compassHow')}>
          <path d={f.d} className={save.done ? 'shown' : ''} />
        </svg>
      </div>
      {hint && <p className="pz-hint">💡 {t('pz.hintContinent', { continent: t(`zone.c.${target.co}`) })}</p>}
      <ol className="pz-rows">
        {Array.from({ length: MAX_COMPASS }, (_, i) => {
          const r = rows[i];
          return (
            <li key={i} className={r ? (r.d === 0 ? 'win' : '') : 'empty'}>
              {r ? <>
                <span dir="auto">{nameOf(r.c.n, lang)}</span>
                <b>{r.d.toLocaleString(lang)} km</b>
                <span className="pz-arrow" aria-hidden="true">{r.d === 0 ? '🎉' : r.dir}</span>
                <b>{r.pct} %</b>
              </> : <span>&nbsp;</span>}
            </li>
          );
        })}
      </ol>
      {save.done
        ? <End won={save.won} target={target} n={rows.length} share={share} onFree={pz.newFree} free={pz.free} />
        : <CountryInput list={geo} onPick={guess} exclude={new Set(save.guesses)} placeholder={t('pz.placeholder')} />}
    </div>
  );
}

// ======================================================================= capitale du jour
const MAX_WORD = 6;
const KEYS: Record<string, string[]> = {
  fr: ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'],
  en: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
  es: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
  ar: ['ضصثقفغعهخحج', 'شسيبلاتنمكط', 'ذءرزظدو'],
};

export function CapwordScreen() {
  const { t, lang, look } = useApp();
  const { geo, err } = useGeo();
  // Capitales connues, de 4 à 8 lettres dans la langue du joueur.
  const pool = useMemo(() => (geo ? famous(geo, 140).filter((c) => { const n = letters(nameOf(c.cap, lang)); return c.cap && n.length >= 4 && n.length <= 8; }) : null), [geo, lang]);
  const pz = usePuzzle(`capword-${lang}`, pool);
  const { target, save } = pz;
  const [cur, setCur] = useState('');
  const [msg, setMsg] = useState('');
  const word = target ? letters(nameOf(target.cap, lang)) : '';
  const len = [...word].length;
  const keyed = useRef<(k: string) => void>(() => {});
  keyed.current = (k: string) => {
    if (!target || save.done) return;
    setMsg('');
    if (k === 'Enter') {
      if ([...cur].length !== len) { setMsg(t('pz.letters', { n: len })); return; }
      const guesses = [...save.guesses, cur];
      const won = cur === word;
      const done = won || guesses.length >= MAX_WORD;
      if (won) sfx.good(); else sfx.tick();
      pz.update({ ...save, guesses, done, won });
      setCur('');
    } else if (k === 'Backspace') setCur((c) => [...c].slice(0, -1).join(''));
    else {
      const L = letters(k);
      // Seulement les lettres du clavier de la langue (pas de latin dans une capitale en arabe).
      if (L.length === 1 && letters((KEYS[lang] ?? KEYS.en).join('')).includes(L) && [...cur].length < len) setCur((c) => c + L);
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === 'Enter' || e.key === 'Backspace' || e.key.length === 1) { keyed.current(e.key); if (e.key === 'Backspace') e.preventDefault(); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  useEffect(() => { setCur(''); setMsg(''); }, [target?.id]);
  if (err) return <div className="panel"><PuzzleBack /><p className="error">{t('pz.loadError')}</p></div>;
  if (!geo || !target) return <div className="loading" />;

  const scored = save.guesses.map((g) => ({ g: [...g], s: scoreWord(g, word) }));
  const keyState: Record<string, 'g' | 'y' | 'x'> = {};
  for (const r of scored) r.g.forEach((c, i) => { const s = r.s[i]; if (s === 'g' || (s === 'y' && keyState[c] !== 'g') || (s === 'x' && !keyState[c])) keyState[c] = s; });
  const hintAt = look === 'kids' ? 2 : 3;
  const showHint = save.hint || save.done || save.guesses.length >= hintAt;
  const emoji = { g: '🟩', y: '🟨', x: '⬜' };
  const share = `${t('pz.shareCapword', { day: pz.day })} ${save.won ? scored.length : 'X'}/${MAX_WORD}\n${scored.map((r) => r.s.map((s) => emoji[s]).join('')).join('\n')}\n${location.origin}`;
  const rows = Array.from({ length: MAX_WORD }, (_, i) => {
    if (scored[i]) return scored[i].g.map((c, j) => ({ c, s: scored[i].s[j] as string }));
    const live = i === scored.length && !save.done ? [...cur] : [];
    return Array.from({ length: len }, (_, j) => ({ c: live[j] ?? '', s: live[j] ? 'typed' : '' }));
  });
  return (
    <div className="pz panel">
      <Head game="capword" free={pz.free} onFree={pz.newFree} onDaily={pz.daily} />
      <p className="pz-len">{t('pz.letters', { n: len })}</p>
      <div className="wd-grid" style={{ '--n': len } as React.CSSProperties}>
        {rows.map((r, i) => <div key={i} className="wd-row">{r.map((x, j) => <b key={j} className={x.s} style={{ '--j': j } as React.CSSProperties}>{x.c}</b>)}</div>)}
      </div>
      {showHint && !save.done && (
        <p className="pz-hint"><img src={`/api/flag/${target.id}.svg`} alt="" width="24" height="18" /> {t('pz.hintCountry', { country: nameOf(target.n, lang) })}</p>
      )}
      {!showHint && !save.done && <button type="button" className="text-btn" onClick={() => pz.update({ ...save, hint: true })}>💡 {t('pz.hint')}</button>}
      {msg && <p className="pz-msg" role="alert">{msg}</p>}
      {save.done ? (
        <End won={save.won} target={target} n={scored.length} share={share} onFree={() => { pz.newFree(); }} free={pz.free} />
      ) : (
        <div className="wd-keys" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {(KEYS[lang] ?? KEYS.en).map((row, i) => (
            <div key={i}>
              {i === 2 && <button type="button" className="wide" onClick={() => keyed.current('Enter')}>{t('pz.enter')}</button>}
              {[...row].map((k) => <button type="button" key={k} className={keyState[letters(k)] ?? ''} onClick={() => keyed.current(k)}>{k}</button>)}
              {i === 2 && <button type="button" className="wide" aria-label="⌫" onClick={() => keyed.current('Backspace')}>⌫</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
