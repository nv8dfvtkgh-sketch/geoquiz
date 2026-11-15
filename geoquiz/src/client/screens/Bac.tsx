// Petit Bac : réglages (nombre de mots, catégories, manches, temps) puis partie en ligne, seul ou
// à plusieurs. Le serveur arbitre (src/server/bacplay.ts) ; l'écran suit la phase reçue.
import { useEffect, useRef, useState } from 'react';
import {
  ALPHABET, BAC_CATS, BAC_MAX, BAC_MIN, BAC_PRESETS, catLabel, cleanBac, customCat, DEFAULT_BAC, RARE, type BacConfig, type BacStatus, type BacView,
} from '../../shared/bac';
import { createGame } from '../net';
import { sfx } from '../sound';
import { useApp } from '../state';
import { PuzzleBack } from './Puzzles';

const KEY = 'gq.bac';
function loadCfg(): BacConfig {
  try { return cleanBac(JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? DEFAULT_BAC); } catch { return DEFAULT_BAC; }
}

// ======================================================================= réglages
export function BacSetup() {
  const { t, lang, name, fail } = useApp();
  const [cfg, setCfg] = useState<BacConfig>(loadCfg);
  const [preset, setPreset] = useState<string>('classic');
  const [custom, setCustom] = useState('');
  const save = (c: BacConfig) => { setCfg(c); try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignoré */ } };
  // Changer le nombre : on complète avec le préréglage choisi, ou on retire les dernières.
  const setCount = (n: number) => {
    n = Math.max(BAC_MIN, Math.min(BAC_MAX, n));
    let cats = cfg.cats.slice(0, n);
    for (const id of BAC_PRESETS[preset] ?? BAC_PRESETS.classic) if (cats.length < n && !cats.includes(id)) cats.push(id);
    for (const c of BAC_CATS) if (cats.length < n && !cats.includes(c.id)) cats.push(c.id);
    save({ ...cfg, cats });
  };
  const usePreset = (p: string) => {
    setPreset(p);
    const n = cfg.cats.length;
    const list = p === 'random' ? [...BAC_CATS.map((c) => c.id)].sort(() => Math.random() - 0.5) : BAC_PRESETS[p];
    save({ ...cfg, cats: list.slice(0, n) });
  };
  const toggle = (id: string) => {
    if (cfg.cats.includes(id)) { if (cfg.cats.length > BAC_MIN) save({ ...cfg, cats: cfg.cats.filter((x) => x !== id) }); }
    else if (cfg.cats.length < BAC_MAX) save({ ...cfg, cats: [...cfg.cats, id] });
  };
  const addCustom = () => {
    const v = custom.trim();
    if (!v || cfg.cats.length >= BAC_MAX) return;
    save(cleanBac({ ...cfg, cats: [...cfg.cats, customCat(v)] }));
    setCustom('');
  };
  const start = (kind: 'solo' | 'room') => {
    createGame({ kind, settings: { category: 'bac', zone: 'world', difficulty: 'easy', qtype: 'type', count: 10, timeLimit: 20, bac: cfg } as any }, name, lang).then(fail);
  };
  const customs = cfg.cats.filter((x) => x.startsWith('+'));
  return (
    <div className="bac-setup panel">
      <PuzzleBack to="home" />
      <div className="duel-head">
        <span className="bac-tile" aria-hidden="true">B</span>
        <div><h1>{t('cat.bac')}</h1><p className="muted">{t('bac.how')}</p></div>
      </div>

      <section className="bac-box">
        <div className="bac-count">
          <strong>{t('bac.count')}</strong>
          <div className="bac-step">
            <button type="button" aria-label={t('bac.less')} onClick={() => setCount(cfg.cats.length - 1)} disabled={cfg.cats.length <= BAC_MIN}>−</button>
            <b aria-live="polite">{cfg.cats.length}</b>
            <button type="button" aria-label={t('bac.more')} onClick={() => setCount(cfg.cats.length + 1)} disabled={cfg.cats.length >= BAC_MAX}>+</button>
          </div>
        </div>
        <p className="muted small">{t('bac.countHint', { min: BAC_MIN, max: BAC_MAX })}</p>
        <div className="seg" role="group" aria-label={t('bac.presets')}>
          {['classic', 'geo', 'kids', 'random'].map((p) => <button type="button" key={p} aria-pressed={preset === p} onClick={() => usePreset(p)}>{t(`bac.preset.${p}`)}</button>)}
        </div>
        <div className="bac-chips">
          {BAC_CATS.map((c) => (
            <button type="button" key={c.id} className={cfg.cats.includes(c.id) ? 'on' : ''} aria-pressed={cfg.cats.includes(c.id)} onClick={() => toggle(c.id)}>
              {c.n[lang]}{c.check && <small aria-label={t('bac.checked')} title={t('bac.checked')}> ✓</small>}
            </button>
          ))}
          {customs.map((id) => <button type="button" key={id} className="on custom" aria-pressed="true" onClick={() => toggle(id)}>{id.slice(1)} ✕</button>)}
        </div>
        <form className="bac-custom" onSubmit={(e) => { e.preventDefault(); addCustom(); }}>
          <label className="sr-only" htmlFor="bac-custom">{t('bac.custom')}</label>
          <input id="bac-custom" value={custom} maxLength={24} placeholder={t('bac.custom')} onChange={(e) => setCustom(e.target.value)} />
          <button type="submit" className="btn ghost" disabled={!custom.trim() || cfg.cats.length >= BAC_MAX}>{t('bac.add')}</button>
        </form>
        <p className="muted small">{t('bac.checkHint')}</p>
      </section>

      <section className="bac-box">
        <strong>{t('bac.rounds')}</strong>
        <div className="seg">{[1, 3, 5, 8].map((n) => <button type="button" key={n} aria-pressed={cfg.rounds === n} onClick={() => save({ ...cfg, rounds: n })}>{n}</button>)}</div>
        <strong>{t('bac.time')}</strong>
        <div className="seg">{[60, 90, 120, 180].map((n) => <button type="button" key={n} aria-pressed={cfg.time === n} onClick={() => save({ ...cfg, time: n })}>{t('setup.seconds', { n })}</button>)}</div>
        <label className="bac-rare"><input type="checkbox" checked={cfg.rare} onChange={(e) => save({ ...cfg, rare: e.target.checked })} /> {t('bac.rare', { letters: [...RARE].join(', ') })}</label>
      </section>

      <div className="bac-go">
        <button type="button" className="btn primary" onClick={() => start('room')}>{t('bac.room')}</button>
        <button type="button" className="btn ghost" onClick={() => start('solo')}>{t('bac.solo')}</button>
      </div>
    </div>
  );
}

// ======================================================================= partie
function useCountdown(ms: number, key: unknown) {
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    const end = performance.now() + ms;
    setLeft(ms);
    const id = setInterval(() => setLeft(Math.max(0, end - performance.now())), 250);
    return () => clearInterval(id);
  }, [key]);
  return left;
}
const fmt = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function BacOnline() {
  const { s } = useApp();
  const v = s.bac;
  useEffect(() => { if (v?.phase === 'end') { window.dispatchEvent(new CustomEvent('gq:finished', { detail: { game: 'bac' } })); sfx.end(); } }, [v?.phase]);
  if (!v) return <div className="loading" />;
  return (
    <div className="bac panel">
      {v.phase === 'spin' && <Spin v={v} />}
      {v.phase === 'write' && <Write v={v} />}
      {v.phase === 'vote' && <Vote v={v} />}
      {(v.phase === 'round' || v.phase === 'end') && <Results v={v} />}
    </div>
  );
}

function Head({ v, ms, keyed }: { v: BacView; ms?: number; keyed?: unknown }) {
  const { t } = useApp();
  const left = useCountdown(ms ?? 0, keyed);
  return (
    <header className="bac-head">
      <span className="bac-letter" aria-label={t('bac.letter', { l: v.letter })}>{v.letter}</span>
      <div><strong>{t('bac.roundOf', { n: v.round, total: v.rounds })}</strong><small className="muted">{t(`bac.phase.${v.phase}`)}</small></div>
      {ms !== undefined && <span className={`bac-clock ${left < 10_000 ? 'low' : ''}`} aria-live="off">{fmt(left)}</span>}
    </header>
  );
}

/** Roulette : les lettres défilent puis s'arrêtent sur celle tirée par le serveur. */
function Spin({ v }: { v: BacView }) {
  const { t } = useApp();
  const [shown, setShown] = useState('?');
  useEffect(() => {
    const pool = ALPHABET;
    let i = 0, delay = 60, id: ReturnType<typeof setTimeout>;
    const step = () => {
      i++;
      if (delay > 320) { setShown(v.letter); sfx.good(); return; }
      setShown(pool[(i * 7) % pool.length]);
      sfx.tick();
      delay *= 1.13;
      id = setTimeout(step, delay);
    };
    id = setTimeout(step, delay);
    return () => clearTimeout(id);
  }, [v.round]);
  const done = shown === v.letter;
  return (
    <div className="bac-spin">
      <p className="muted">{t('bac.roundOf', { n: v.round, total: v.rounds })}</p>
      <div className={`bac-wheel ${done ? 'done' : ''}`} aria-live="polite"><span>{shown}</span></div>
      <p>{done ? t('bac.drawn', { l: v.letter }) : t('bac.spinning')}</p>
      {v.used.length > 1 && <p className="muted small">{t('bac.used', { list: v.used.slice(0, -1).join(' ') })}</p>}
    </div>
  );
}

function Write({ v }: { v: BacView }) {
  const { t, send, s, lang } = useApp();
  const [vals, setVals] = useState<string[]>(v.answers);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { setVals(v.answers); first.current?.focus(); }, [v.round]);
  const change = (i: number, x: string) => {
    const next = [...vals]; next[i] = x; setVals(next);
    clearTimeout(timers.current[i]);
    timers.current[i] = setTimeout(() => send({ t: 'bac', a: 'fill', i, v: x }), 250);
  };
  const flush = () => { vals.forEach((x, i) => { clearTimeout(timers.current[i]); send({ t: 'bac', a: 'fill', i, v: x }); }); };
  const full = vals.every((x) => x.trim());
  const others = (s.room?.players ?? []).filter((p) => p.id !== s.you);
  const startsOk = (x: string) => !x.trim() || x.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().startsWith(v.letter) || /^(l[ae']|le |les |the |el |los |las )/i.test(x.trim());
  return (
    <>
      <Head v={v} ms={v.ms} keyed={`${v.round}w`} />
      <form className="bac-grid" onSubmit={(e) => { e.preventDefault(); if (full) { flush(); send({ t: 'bac', a: 'stop' }); } }}>
        {v.cats.map((c, i) => (
          <label key={i} className={startsOk(vals[i] ?? '') ? '' : 'warn'}>
            <span>{catLabel(c, lang)}</span>
            <input ref={i === 0 ? first : undefined} value={vals[i] ?? ''} maxLength={40} autoComplete="off" autoCapitalize="words" spellCheck={false}
              placeholder={`${v.letter}…`} onChange={(e) => change(i, e.target.value)} />
            {!startsOk(vals[i] ?? '') && <small className="bac-warn">{t('bac.wrongLetter', { l: v.letter })}</small>}
          </label>
        ))}
        {others.length > 0 && (
          <p className="muted small bac-others">{others.map((p) => `${p.name} ${v.filled[p.id] ?? 0}/${v.cats.length}`).join(' · ')}</p>
        )}
        <button type="submit" className="btn bac-stop" disabled={!full}>{full ? t('bac.stop') : t('bac.stopHint', { n: vals.filter((x) => !x.trim()).length })}</button>
      </form>
    </>
  );
}

function Vote({ v }: { v: BacView }) {
  const { t, send, s, lang } = useApp();
  const me = s.you ?? '';
  const done = v.ready.includes(me);
  const players = s.room?.players.length ?? 1;
  return (
    <>
      <Head v={v} ms={v.ms} keyed={`${v.round}v`} />
      {v.stopBy && <p className="bac-stopby">{t('bac.stoppedBy', { name: v.stopBy })}</p>}
      <p className="muted">{t('bac.voteHint')}</p>
      <ul className="bac-votes">
        {v.votes?.map((x) => (
          <li key={x.key} className={x.voted ? 'no' : ''}>
            <div><small className="muted">{catLabel(v.cats[x.cat], lang)}</small><strong dir="auto">{x.word}</strong><small className="muted">{x.by.join(', ')}</small></div>
            {x.mine ? <em className="muted small">{t('bac.yours')}</em> : (
              <button type="button" className={`btn ${x.voted ? 'danger' : 'ghost'}`} aria-pressed={x.voted} onClick={() => send({ t: 'bac', a: 'veto', key: x.key })}>
                {x.voted ? t('bac.refused') : t('bac.refuse')}
              </button>
            )}
            {x.rejects > 0 && <span className="bac-rej">{t('bac.rejects', { n: x.rejects })}</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn primary" disabled={done} onClick={() => send({ t: 'bac', a: 'done' })}>
        {done ? t('bac.waitOthers', { n: v.ready.length, total: players }) : t('bac.voteDone')}
      </button>
    </>
  );
}

const ICON: Record<BacStatus, string> = { ok: '✓', known: '✓', unchecked: '~', vote: '?', bad: '✗', letter: '✗', empty: '–', rejected: '✗' };
function Results({ v }: { v: BacView }) {
  const { t, send, s, lang, leave } = useApp();
  const me = s.you ?? '';
  const mine = v.table?.find((r) => r.id === me);
  const end = v.phase === 'end';
  const ready = v.ready.includes(me);
  const players = s.room?.players.length ?? 1;
  const isHost = s.isHost;
  const room = s.room;
  return (
    <>
      <Head v={v} ms={end || v.solo ? undefined : v.ms} keyed={`${v.round}r`} />
      {v.stopBy && v.phase === 'round' && !v.solo && <p className="bac-stopby">{t('bac.stoppedBy', { name: v.stopBy })}</p>}
      {mine && (
        <section className="bac-box">
          <strong>{t('bac.myGrid')}</strong>
          <dl className="bac-table">
            {v.cats.map((c, i) => {
              const cell = mine.cells[i];
              return (
                <div key={i} className={`st-${cell.status}`}>
                  <dt>{catLabel(c, lang)}</dt>
                  <dd dir="auto">{cell.word || '—'} <small>{ICON[cell.status]} {t(`bac.st.${cell.status}`)}</small></dd>
                  <dd className="pts">{cell.points}</dd>
                </div>
              );
            })}
          </dl>
          <p className="bac-sum"><span>{t('bac.thisRound')}</span><strong>{t('bac.points', { n: mine.round })}</strong></p>
        </section>
      )}
      {!v.solo && (
        <section className="bac-box">
          <strong>{end ? t('bac.final') : t('bac.ranking')}</strong>
          <ol className="bac-rank">
            {v.table?.map((r) => <li key={r.id} className={r.id === me ? 'me' : ''}><span dir="auto">{r.name}</span><small className="muted">+{r.round}</small><strong>{r.total}</strong></li>)}
          </ol>
        </section>
      )}
      {v.solo && mine && <p className="bac-total">{t('bac.total', { n: mine.total })}</p>}
      {v.solo && mine?.cells.some((c) => c.status === 'unchecked') && <p className="muted small">{t('bac.soloHint')}</p>}
      {end ? (
        <div className="bac-go">
          {(room?.kind === 'solo' || isHost) && <button type="button" className="btn primary" onClick={() => send({ t: 'rematch' })}>{t('final.again')}</button>}
          {room?.kind !== 'solo' && !isHost && <p className="muted">{t('lobby.waitHost')}</p>}
          <button type="button" className="btn ghost" onClick={leave}>{t('bac.quit')}</button>
        </div>
      ) : (
        <button type="button" className="btn primary" disabled={ready} onClick={() => send({ t: 'bac', a: 'next' })}>
          {ready ? t('bac.waitOthers', { n: v.ready.length, total: players }) : t('bac.next')}
        </button>
      )}
    </>
  );
}
