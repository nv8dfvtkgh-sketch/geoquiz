// Jeux de grilles inspirés de Sporcle et JetPunk (formats seulement, contenus générés à partir de
// nos données) : Connexions 4×4, L'intrus, Champ de mines et Frontières.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang, MapData } from '../../shared/protocol';
import { useApp } from '../state';
import { Confetti } from '../Celebrate';
import { sfx } from '../sound';
import { famous, hash, loadGeo, loadPuzzle, loadWorld, matchCountry, nameOf, savePuzzle, shareText, streakOf, today, type GeoCountry } from '../geo';
import { criteria, makeConnex, makeIntrus, makeMines, seeded, shuffled, type ConnexGroup, type Intrus, type Mines } from '../geofacts';
import { PuzzleBack } from './Puzzles';

const finished = (game: string, score: number) => window.dispatchEvent(new CustomEvent('gq:finished', { detail: { game, score } }));
type Level = 'easy' | 'medium' | 'hard';
const POOL: Record<Level, number> = { easy: 70, medium: 120, hard: 400 };

function useGeoWorld() {
  const [geo, setGeo] = useState<GeoCountry[] | null>(null);
  const [world, setWorld] = useState<MapData | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { Promise.all([loadGeo(), loadWorld()]).then(([g, w]) => { setGeo(g); setWorld(w); }).catch(() => setErr(true)); }, []);
  return { geo, world, err };
}

function Shell({ game, children, back }: { game: string; children: React.ReactNode; back?: () => void }) {
  const { t } = useApp();
  return (
    <div className="pz panel">
      <div className="pz-head">
        {back ? <button type="button" className="back-link" onClick={back}>‹ {t(`cat.${game}`)}</button> : <PuzzleBack />}
        <h1>{t(`cat.${game}`)}</h1>
        <p className="muted">{t(`gx.${game}How`)}</p>
      </div>
      {children}
    </div>
  );
}

function LevelPick({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  const { t } = useApp();
  return (
    <div className="seg" role="group" aria-label={t('setup.difficulty')}>
      {(['easy', 'medium', 'hard'] as Level[]).map((l) => <button type="button" key={l} aria-pressed={value === l} onClick={() => onChange(l)}>{t(`diff.${l}`)}</button>)}
    </div>
  );
}

function Tile({ c, lang, cls = '', onClick, disabled }: { c: GeoCountry; lang: Lang; cls?: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`gx-tile ${cls}`} onClick={onClick} disabled={disabled} aria-pressed={cls.includes('sel')}>
      <img src={`/api/flag/${c.id}.svg`} alt="" width="36" height="27" loading="lazy" />
      <span dir="auto">{nameOf(c.n, lang)}</span>
    </button>
  );
}

function Loading({ err }: { err: boolean }) {
  const { t } = useApp();
  return err ? <div className="panel"><PuzzleBack /><p className="error">{t('pz.loadError')}</p></div> : <div className="loading" />;
}

// ======================================================================= Connexions 4×4
const COLORS = ['🟨', '🟩', '🟦', '🟪'];
const MAX_MISTAKES = 4;

export function ConnexScreen() {
  const { t, lang } = useApp();
  const { geo, err } = useGeoWorld();
  const day = today();
  const [free, setFree] = useState<number | null>(null);
  const seed = free ?? hash(`connex:${day}`);
  const groups = useMemo(() => (geo ? makeConnex(famous(geo, 130), criteria(lang), seeded(seed)) : null), [geo, seed, lang]);
  const [guesses, setGuesses] = useState<string[][]>(() => loadPuzzle('connex', day).guesses.map((g) => g.split(',')));
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [order, setOrder] = useState(0);
  const [shake, setShake] = useState(false);
  const byId = useMemo(() => new Map((geo ?? []).map((c) => [c.id, c])), [geo]);
  if (!geo || !groups) return <Loading err={err || (!!geo && !groups)} />;

  const groupOf = (id: string) => groups.findIndex((g) => g.ids.includes(id));
  const solved = groups.filter((g) => guesses.some((gs) => gs.length === 4 && gs.every((id) => g.ids.includes(id))));
  const mistakes = guesses.filter((gs) => !groups.some((g) => gs.every((id) => g.ids.includes(id)))).length;
  const won = solved.length === 4;
  const lost = mistakes >= MAX_MISTAKES && !won;
  const done = won || lost;
  const left = groups.flatMap((g) => (solved.includes(g) ? [] : g.ids));
  const tiles = shuffled(left, seeded(seed + order)).map((id) => byId.get(id)!).filter(Boolean);
  const shown: ConnexGroup[] = done ? [...solved, ...groups.filter((g) => !solved.includes(g))] : solved;

  const save = (next: string[][]) => {
    setGuesses(next);
    if (free === null) {
      const w = groups.every((g) => next.some((gs) => gs.every((id) => g.ids.includes(id))));
      const m = next.filter((gs) => !groups.some((g) => gs.every((id) => g.ids.includes(id)))).length;
      const d = w || m >= MAX_MISTAKES;
      savePuzzle('connex', day, { guesses: next.map((g) => g.join(',')), done: d, won: w });
    }
  };
  const submit = () => {
    if (sel.length !== 4) return;
    const key = [...sel].sort().join(',');
    if (guesses.some((g) => [...g].sort().join(',') === key)) { setMsg(t('cx.already')); return; }
    const next = [...guesses, sel];
    const g = groups.find((x) => sel.every((id) => x.ids.includes(id)));
    if (g) { sfx.good(); setMsg(''); setSel([]); }
    else {
      sfx.bad(); setShake(true); setTimeout(() => setShake(false), 400);
      const best = Math.max(...groups.map((x) => sel.filter((id) => x.ids.includes(id)).length));
      setMsg(best === 3 ? t('cx.oneAway') : '');
    }
    save(next);
    const w = solved.length + (g ? 1 : 0) === 4;
    const l = !g && mistakes + 1 >= MAX_MISTAKES;
    if (w || l) { finished('connex', w ? 1 : solved.length / 4); sfx.end(); setSel([]); }
  };
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
  const grid = guesses.map((gs) => gs.map((id) => COLORS[groupOf(id)]).join('')).join('\n');
  const share = `${t('cx.shareTitle', { day })} ${won ? `${mistakes}/${MAX_MISTAKES}` : 'X'}\n${grid}\n${location.origin}`;
  const streak = streakOf('connex');
  return (
    <Shell game="connex">
      <div className="pz-modes">
        <div className="seg" role="group">
          <button type="button" aria-pressed={free === null} onClick={() => { setFree(null); setGuesses(loadPuzzle('connex', day).guesses.map((g) => g.split(','))); setSel([]); setMsg(''); }}>{t('pz.daily')}</button>
          <button type="button" aria-pressed={free !== null} onClick={() => { setFree(Date.now() >>> 0); setGuesses([]); setSel([]); setMsg(''); }}>{t('pz.freeMode')}</button>
        </div>
        {streak > 0 && <span className="pz-streak">{t('pz.streak', { n: streak })}</span>}
      </div>
      <div className="cx-solved">
        {shown.map((g) => (
          <div key={g.crit.id} className={`cx-group c${groups.indexOf(g)}`}>
            <strong dir="auto">{g.crit.label[lang]}</strong>
            <span dir="auto">{g.ids.map((id) => nameOf(byId.get(id)?.n, lang)).join(' · ')}</span>
          </div>
        ))}
      </div>
      {!done && (
        <>
          <div className={`gx-grid cx-grid ${shake ? 'shake' : ''}`}>
            {tiles.map((c) => <Tile key={c.id} c={c} lang={lang} cls={sel.includes(c.id) ? 'sel' : ''} onClick={() => toggle(c.id)} />)}
          </div>
          <p className="cx-lives" aria-label={t('cx.mistakesLeft', { n: MAX_MISTAKES - mistakes })}>
            {t('cx.mistakes')} {Array.from({ length: MAX_MISTAKES }, (_, i) => <span key={i} className={i < MAX_MISTAKES - mistakes ? 'on' : ''}>●</span>)}
          </p>
          {msg && <p className="pz-msg" role="status">{msg}</p>}
          <div className="cx-actions">
            <button type="button" className="btn" onClick={() => setOrder((o) => o + 1)}>{t('cx.shuffle')}</button>
            <button type="button" className="btn" disabled={!sel.length} onClick={() => setSel([])}>{t('cx.clear')}</button>
            <button type="button" className="btn primary" disabled={sel.length !== 4} onClick={submit}>{t('play.validate')}</button>
          </div>
        </>
      )}
      {done && (
        <div className={`pz-end ${won ? 'won' : 'lost'}`}>
          {won && <Confetti size="big" />}
          <span className="na-big">{won ? '🧩' : '💥'}</span>
          <div>
            <strong>{won ? t('cx.won', { n: mistakes }) : t('cx.lost')}</strong>
            {free === null && <small>{t('pz.next')}</small>}
          </div>
          <pre className="cx-share" aria-hidden="true">{grid}</pre>
          <div className="pz-end-actions">
            {free === null && <button type="button" className="btn primary" onClick={() => shareText(share)}>{t('pz.share')}</button>}
            <button type="button" className="btn" onClick={() => { setFree(Date.now() >>> 0); setGuesses([]); setSel([]); setMsg(''); window.scrollTo(0, 0); }}>{t('pz.free')}</button>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ======================================================================= L'intrus
const INTRUS_ROUNDS = 10;
export function IntrusScreen() {
  const { t, lang } = useApp();
  const { geo, err } = useGeoWorld();
  const [level, setLevel] = useState<Level | null>(null);
  const [seed, setSeed] = useState(() => Date.now() >>> 0);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const rounds = useMemo(() => {
    if (!geo || !level) return [] as Intrus[];
    const rnd = seeded(seed), pool = famous(geo, POOL[level]), crits = criteria(lang).filter((c) => level !== 'easy' || c.level < 3);
    const out: Intrus[] = [];
    const used = new Set<string>();
    for (let k = 0; out.length < INTRUS_ROUNDS && k < 60; k++) {
      const r = makeIntrus(pool, crits, rnd);
      if (r && !used.has(r.crit.id)) { used.add(r.crit.id); out.push(r); }
    }
    return out;
  }, [geo, level, seed, lang]);
  const byId = useMemo(() => new Map((geo ?? []).map((c) => [c.id, c])), [geo]);
  useEffect(() => { if (level && rounds.length && i >= rounds.length) { finished('intrus', score / rounds.length); sfx.end(); } }, [i]);
  if (!geo) return <Loading err={err} />;
  if (!level) {
    return (
      <Shell game="intrus">
        <LevelPick value="easy" onChange={(l) => { setLevel(l); setSeed(Date.now() >>> 0); setI(0); setScore(0); setPick(null); }} />
      </Shell>
    );
  }
  const back = () => { setLevel(null); };
  if (i >= rounds.length) {
    return (
      <Shell game="intrus" back={back}>
        <div className={`pz-end ${score >= rounds.length * 0.7 ? 'won' : ''}`}>
          {score === rounds.length && <Confetti size="big" />}
          <span className="na-big">🙅</span>
          <div><strong>{t('na.result', { n: score, total: rounds.length })}</strong></div>
          <div className="pz-end-actions">
            <button type="button" className="btn primary" onClick={() => shareText(`${t('gx.intrusShare', { n: score, total: rounds.length })}\n${location.origin}`)}>{t('pz.share')}</button>
            <button type="button" className="btn" onClick={() => { setSeed(Date.now() >>> 0); setI(0); setScore(0); setPick(null); }}>{t('na.again')}</button>
          </div>
        </div>
      </Shell>
    );
  }
  const r = rounds[i];
  const choose = (id: string) => {
    if (pick) return;
    setPick(id);
    if (id === r.odd) { setScore((s) => s + 1); sfx.good(); } else sfx.bad();
  };
  return (
    <Shell game="intrus" back={back}>
      <p className="na-score"><b>{i + 1}</b> / {rounds.length} · {t('gx.score', { n: score })}</p>
      <p className="gx-ask">{t('ix.ask')}</p>
      <div className="gx-grid ix-grid">
        {r.ids.map((id) => {
          const c = byId.get(id)!;
          const cls = pick ? (id === r.odd ? 'good' : id === pick ? 'bad' : 'dim') : '';
          return <Tile key={id} c={c} lang={lang} cls={cls} onClick={() => choose(id)} disabled={!!pick} />;
        })}
      </div>
      {pick && (
        <div className={`gx-explain ${pick === r.odd ? 'ok' : 'ko'}`} role="status">
          <strong>{pick === r.odd ? t('ix.right') : t('ix.wrong', { name: nameOf(byId.get(r.odd)!.n, lang) })}</strong>
          <span dir="auto">{t('ix.why', { what: r.crit.label[lang] })}</span>
          <button type="button" className="btn primary" onClick={() => { setPick(null); setI((x) => x + 1); }}>{t('gx.next')}</button>
        </div>
      )}
    </Shell>
  );
}

// ======================================================================= Champ de mines
const MINES_ROUNDS = 5;
const LIVES = 3;
export function MinesScreen() {
  const { t, lang } = useApp();
  const { geo, err } = useGeoWorld();
  const [level, setLevel] = useState<Level | null>(null);
  const [seed, setSeed] = useState(() => Date.now() >>> 0);
  const [i, setI] = useState(0);
  const [clicked, setClicked] = useState<string[]>([]);
  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);
  const rounds = useMemo(() => {
    if (!geo || !level) return [] as Mines[];
    const pool = famous(geo, POOL[level]);
    const rnd = seeded(seed), crits = criteria(lang, true, pool).filter((c) => level !== 'easy' || c.level < 3);
    const out: Mines[] = [];
    const used = new Set<string>();
    for (let k = 0; out.length < MINES_ROUNDS && k < 60; k++) {
      const r = makeMines(pool, crits, rnd);
      if (r && !used.has(r.crit.kind)) { used.add(r.crit.kind); out.push(r); }
    }
    return out;
  }, [geo, level, seed, lang]);
  const byId = useMemo(() => new Map((geo ?? []).map((c) => [c.id, c])), [geo]);
  const over = !!level && (lives <= 0 || i >= rounds.length);
  useEffect(() => { if (over && rounds.length) { finished('mines', Math.min(1, score / rounds.reduce((s, r) => s + r.good.length, 0))); sfx.end(); } }, [over]);
  if (!geo) return <Loading err={err} />;
  const restart = (l: Level) => { setLevel(l); setSeed(Date.now() >>> 0); setI(0); setClicked([]); setLives(LIVES); setScore(0); };
  if (!level) return <Shell game="mines"><LevelPick value="easy" onChange={restart} /></Shell>;
  const back = () => setLevel(null);
  if (over) {
    const total = rounds.reduce((s, r) => s + r.good.length, 0);
    return (
      <Shell game="mines" back={back}>
        <div className={`pz-end ${lives > 0 ? 'won' : 'lost'}`}>
          {lives > 0 && <Confetti size="big" />}
          <span className="na-big">{lives > 0 ? '🏆' : '💣'}</span>
          <div><strong>{t('mn.result', { n: score, total })}</strong>{lives <= 0 && <small>{t('mn.boom')}</small>}</div>
          <div className="pz-end-actions">
            <button type="button" className="btn primary" onClick={() => shareText(`${t('gx.minesShare', { n: score, total })}\n${location.origin}`)}>{t('pz.share')}</button>
            <button type="button" className="btn" onClick={() => restart(level)}>{t('na.again')}</button>
          </div>
        </div>
        {lives <= 0 && rounds[i] && (
          <>
            <p className="gx-ask" dir="auto">{t('mn.ask', { n: rounds[i].good.length })} <strong>{rounds[i].crit.label[lang]}</strong></p>
            <div className="gx-grid mn-grid">
              {rounds[i].ids.map((id) => <Tile key={id} c={byId.get(id)!} lang={lang} cls={rounds[i].good.includes(id) ? 'good' : clicked.includes(id) ? 'bad' : 'dim'} disabled />)}
            </div>
          </>
        )}
      </Shell>
    );
  }
  const r = rounds[i];
  const found = clicked.filter((id) => r.good.includes(id));
  const roundDone = found.length === r.good.length;
  const tap = (id: string) => {
    if (clicked.includes(id) || roundDone) return;
    setClicked((c) => [...c, id]);
    if (r.good.includes(id)) { setScore((s) => s + 1); sfx.good(); } else { setLives((l) => l - 1); sfx.bad(); }
  };
  return (
    <Shell game="mines" back={back}>
      <div className="na-bar">
        <span>{t('mn.round', { n: i + 1, total: rounds.length })}</span>
        <span className="mn-lives" aria-label={t('mn.lives', { n: lives })}>{Array.from({ length: LIVES }, (_, k) => <span key={k} className={k < lives ? 'on' : ''}>❤️</span>)}</span>
      </div>
      <p className="gx-ask" dir="auto">{t('mn.ask', { n: r.good.length })} <strong>{r.crit.label[lang]}</strong></p>
      <p className="na-score"><b>{found.length}</b> / {r.good.length}</p>
      <div className="gx-grid mn-grid">
        {r.ids.map((id) => {
          const c = byId.get(id)!;
          const hit = clicked.includes(id);
          const cls = hit ? (r.good.includes(id) ? 'good' : 'bad boom') : roundDone && r.good.includes(id) ? 'good' : '';
          return <Tile key={id} c={c} lang={lang} cls={cls} onClick={() => tap(id)} disabled={hit || roundDone} />;
        })}
      </div>
      {roundDone && <button type="button" className="btn primary" onClick={() => { setClicked([]); setI((x) => x + 1); }}>{t('gx.next')}</button>}
    </Shell>
  );
}

// ======================================================================= Frontières
export function BordersScreen() {
  const { t, lang } = useApp();
  const { geo, world, err } = useGeoWorld();
  const [level, setLevel] = useState<Level | null>(null);
  const [seed, setSeed] = useState(() => Date.now() >>> 0);
  const [n, setN] = useState(0); // numéro du pays dans la partie
  const [found, setFound] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [left, setLeft] = useState(0);
  const [v, setV] = useState('');
  const [flash, setFlash] = useState('');
  const [total, setTotal] = useState({ found: 0, all: 0 });
  const ref = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map((geo ?? []).map((c) => [c.id, c])), [geo]);
  const target = useMemo(() => {
    if (!geo || !level) return null;
    const pool = famous(geo, POOL[level]).filter((c) => c.nb.filter((x) => byId.has(x)).length >= (level === 'easy' ? 3 : 2));
    return shuffled(pool, seeded(seed))[n % pool.length] ?? null;
  }, [geo, level, seed, n, byId]);
  const nbs = useMemo(() => (target ? target.nb.filter((x) => byId.has(x)) : []), [target, byId]);
  useEffect(() => { if (target) { setLeft(20 + nbs.length * 10); setFound([]); setOver(false); setV(''); setFlash(''); } }, [target]);
  useEffect(() => {
    if (!target || over) return;
    const id = setInterval(() => setLeft((l) => { if (l <= 1) { setOver(true); return 0; } return l - 1; }), 1000);
    return () => clearInterval(id);
  }, [target, over]);
  useEffect(() => {
    if (over && target) { setTotal((x) => ({ found: x.found + found.length, all: x.all + nbs.length })); finished('borders', found.length / Math.max(1, nbs.length)); sfx.end(); }
  }, [over]);
  if (!geo || !world) return <Loading err={err} />;
  if (!level) return <Shell game="borders"><LevelPick value="easy" onChange={(l) => { setLevel(l); setSeed(Date.now() >>> 0); setN(0); setTotal({ found: 0, all: 0 }); }} /></Shell>;
  if (!target) return <Loading err />;
  const onChange = (x: string) => {
    setV(x);
    if (x.trim().length < 3) return;
    const c = matchCountry(x, geo);
    if (!c || c.id === target.id) return;
    if (nbs.includes(c.id) && !found.includes(c.id)) {
      const next = [...found, c.id];
      setFound(next); setV(''); setFlash(`✓ ${nameOf(c.n, lang)}`); sfx.good();
      if (next.length === nbs.length) setOver(true);
    } else if (!nbs.includes(c.id) && normalizeLen(x) >= normalizeLen(nameOf(c.n, lang))) {
      setFlash(t('bd.notNeighbour', { name: nameOf(c.n, lang) }));
    }
  };
  const ids = new Set([target.id, ...nbs]);
  const feats = world.features.filter((f) => ids.has(f.id));
  const bx = feats.reduce((b, f) => [Math.min(b[0], f.b[0]), Math.min(b[1], f.b[1]), Math.max(b[2], f.b[2]), Math.max(b[3], f.b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const pad = Math.max(10, (bx[2] - bx[0]) * 0.08);
  const vb = `${bx[0] - pad} ${bx[1] - pad} ${bx[2] - bx[0] + pad * 2} ${bx[3] - bx[1] + pad * 2}`;
  const fs = new Set(found);
  const mm = String(Math.floor(left / 60)), ss = String(left % 60).padStart(2, '0');
  const won = found.length === nbs.length;
  return (
    <Shell game="borders" back={() => setLevel(null)}>
      <div className="na-bar">
        <strong dir="auto">{t('bd.of', { name: nameOf(target.n, lang) })}</strong>
        <span className={`na-clock ${left < 15 && !over ? 'low' : ''}`}>{mm}:{ss}</span>
      </div>
      <p className="na-score"><b>{found.length}</b> / {nbs.length} {flash && !over && <span className={`na-flash ${flash.startsWith('✓') ? '' : 'no'}`} key={flash}>{flash}</span>}</p>
      {!over ? (
        <div className="pz-field">
          <input ref={ref} autoFocus value={v} onChange={(e) => onChange(e.target.value)} placeholder={t('pz.placeholder')} autoComplete="off" autoCorrect="off" spellCheck={false} dir="auto" />
          <button type="button" className="btn" onClick={() => setOver(true)}>{t('na.stop')}</button>
        </div>
      ) : (
        <div className={`pz-end ${won ? 'won' : ''}`}>
          {won && <Confetti size="big" />}
          <img src={`/api/flag/${target.id}.svg`} alt="" width="64" height="48" />
          <div><strong>{t('na.result', { n: found.length, total: nbs.length })}</strong><small>{t('bd.total', { n: total.found, total: total.all })}</small></div>
          <div className="pz-end-actions">
            <button type="button" className="btn primary" onClick={() => setN((x) => x + 1)}>{t('bd.nextCountry')}</button>
            <button type="button" className="btn" onClick={() => shareText(`${t('bd.share', { name: nameOf(target.n, lang), n: found.length, total: nbs.length })}\n${location.origin}`)}>{t('pz.share')}</button>
          </div>
        </div>
      )}
      <div className="pz-map" dir="ltr">
        <svg viewBox={vb} role="img" aria-label={t('bd.of', { name: nameOf(target.n, lang) })}>
          <rect className="ocean" x={-50} y={-50} width={world.w + 100} height={world.h + 100} />
          {world.features.map((f) => <path key={f.id} d={f.d} className={`pz-land ${f.id === target.id ? 'bd-target' : fs.has(f.id) ? 'na-ok' : over && nbs.includes(f.id) ? 'na-miss' : ids.has(f.id) ? '' : 'na-off'}`} />)}
        </svg>
      </div>
      <ul className="na-list">
        {[...nbs].sort((a, b) => nameOf(byId.get(a)!.n, lang).localeCompare(nameOf(byId.get(b)!.n, lang), lang)).map((id) => (
          <li key={id} className={fs.has(id) ? 'ok' : over ? 'miss' : ''} dir="auto">{fs.has(id) || over ? nameOf(byId.get(id)!.n, lang) : ' '}</li>
        ))}
      </ul>
    </Shell>
  );
}
const normalizeLen = (s: string) => s.trim().length;

// ======================================================================= Top 10
// Listes fixes (chiffres de l'ONU, World Population Prospects 2024, et superficies totales officielles).
type TopKind = 'pop' | 'area' | 'small';
interface TopList { id: string; e: string; kind: TopKind; n: Record<Lang, string>; ids: string[]; v: number[] }
const N4 = (fr: string, en: string, es: string, ar: string) => ({ fr, en, es, ar });
export const TOP_LISTS: TopList[] = [
  { id: 'pop-world', e: '👥', kind: 'pop', n: N4('Les 10 pays les plus peuplés du monde', 'The 10 most populous countries in the world', 'Los 10 países más poblados del mundo', 'أكثر 10 بلدان سكاناً في العالم'),
    ids: ['IN', 'CN', 'US', 'ID', 'PK', 'NG', 'BR', 'BD', 'RU', 'ET'], v: [1451, 1419, 345, 283, 251, 233, 212, 174, 145, 132] },
  { id: 'area-world', e: '🌍', kind: 'area', n: N4('Les 10 plus grands pays du monde', 'The 10 largest countries in the world', 'Los 10 países más grandes del mundo', 'أكبر 10 بلدان مساحةً في العالم'),
    ids: ['RU', 'CA', 'US', 'CN', 'BR', 'AU', 'IN', 'AR', 'KZ', 'DZ'], v: [17098, 9985, 9834, 9597, 8516, 7741, 3287, 2780, 2725, 2382] },
  { id: 'pop-africa', e: '🌍', kind: 'pop', n: N4("Les 10 pays les plus peuplés d'Afrique", 'The 10 most populous countries in Africa', 'Los 10 países más poblados de África', 'أكثر 10 بلدان سكاناً في إفريقيا'),
    ids: ['NG', 'ET', 'EG', 'CD', 'TZ', 'ZA', 'KE', 'SD', 'UG', 'DZ'], v: [233, 132, 116, 109, 69, 64, 56, 50, 50, 47] },
  { id: 'area-africa', e: '🐪', kind: 'area', n: N4("Les 10 plus grands pays d'Afrique", 'The 10 largest countries in Africa', 'Los 10 países más grandes de África', 'أكبر 10 بلدان مساحةً في إفريقيا'),
    ids: ['DZ', 'CD', 'SD', 'LY', 'TD', 'NE', 'AO', 'ML', 'ZA', 'ET'], v: [2382, 2345, 1886, 1760, 1284, 1267, 1247, 1240, 1221, 1104] },
  { id: 'pop-arab', e: '🌙', kind: 'pop', n: N4('Les 10 pays arabes les plus peuplés', 'The 10 most populous Arab countries', 'Los 10 países árabes más poblados', 'أكثر 10 بلدان عربية سكاناً'),
    ids: ['EG', 'SD', 'DZ', 'IQ', 'YE', 'MA', 'SA', 'SY', 'SO', 'TN'], v: [116, 50, 47, 46, 41, 38, 34, 25, 19, 12] },
  { id: 'pop-europe', e: '🇪🇺', kind: 'pop', n: N4("Les 10 pays les plus peuplés d'Europe", 'The 10 most populous countries in Europe', 'Los 10 países más poblados de Europa', 'أكثر 10 بلدان سكاناً في أوروبا'),
    ids: ['RU', 'DE', 'GB', 'FR', 'IT', 'ES', 'PL', 'UA', 'RO', 'NL'], v: [145, 84, 69, 66, 59, 48, 39, 38, 19, 18] },
  { id: 'pop-asia', e: '🏯', kind: 'pop', n: N4("Les 10 pays les plus peuplés d'Asie", 'The 10 most populous countries in Asia', 'Los 10 países más poblados de Asia', 'أكثر 10 بلدان سكاناً في آسيا'),
    ids: ['IN', 'CN', 'ID', 'PK', 'BD', 'JP', 'PH', 'VN', 'IR', 'TR'], v: [1451, 1419, 283, 251, 174, 124, 116, 101, 92, 87] },
  { id: 'area-americas', e: '🌎', kind: 'area', n: N4('Les 10 plus grands pays des Amériques', 'The 10 largest countries in the Americas', 'Los 10 países más grandes de América', 'أكبر 10 بلدان مساحةً في الأمريكتين'),
    ids: ['CA', 'US', 'BR', 'AR', 'MX', 'PE', 'CO', 'BO', 'VE', 'CL'], v: [9985, 9834, 8516, 2780, 1964, 1285, 1142, 1099, 916, 756] },
  { id: 'small-world', e: '🔎', kind: 'small', n: N4('Les 10 plus petits pays du monde', 'The 10 smallest countries in the world', 'Los 10 países más pequeños del mundo', 'أصغر 10 بلدان في العالم'),
    ids: ['VA', 'MC', 'NR', 'TV', 'SM', 'LI', 'MH', 'KN', 'MV', 'MT'], v: [0.44, 2, 21, 26, 61, 160, 181, 261, 298, 316] },
];
const TOP_TIME = 180;

function topValue(l: TopList, i: number, lang: Lang, t: (k: string, p?: Record<string, string | number>) => string) {
  const v = l.v[i];
  const num = (x: number, d = 0) => x.toLocaleString(lang === 'ar' ? 'ar-MA' : lang, { maximumFractionDigits: d });
  if (l.kind === 'pop') return t('top.millions', { n: num(v) });
  if (l.kind === 'area') return t('top.km2', { n: v >= 1000 ? `${num(v / 1000, 1)} ${t('top.million')}` : num(v * 1000) });
  return t('top.km2', { n: num(v, 2) });
}

export function TopTenScreen() {
  const { t, lang } = useApp();
  const { geo, err } = useGeoWorld();
  const [list, setList] = useState<TopList | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [left, setLeft] = useState(TOP_TIME);
  const [over, setOver] = useState(false);
  const [v, setV] = useState('');
  const [flash, setFlash] = useState('');
  const byId = useMemo(() => new Map((geo ?? []).map((c) => [c.id, c])), [geo]);
  const best = (id: string) => { try { return Number(localStorage.getItem(`gq.top.${id}`)) || 0; } catch { return 0; } };
  useEffect(() => {
    if (!list || over) return;
    const id = setInterval(() => setLeft((l) => { if (l <= 1) { setOver(true); return 0; } return l - 1; }), 1000);
    return () => clearInterval(id);
  }, [list, over]);
  useEffect(() => {
    if (!over || !list) return;
    try { if (found.length > best(list.id)) localStorage.setItem(`gq.top.${list.id}`, String(found.length)); } catch { /* ignoré */ }
    finished('topten', found.length / 10); sfx.end();
  }, [over]);
  if (!geo) return <Loading err={err} />;
  if (!list) {
    return (
      <Shell game="topten">
        <div className="top-lists">
          {TOP_LISTS.map((l) => (
            <button type="button" key={l.id} className="top-card" onClick={() => { setList(l); setFound([]); setLeft(TOP_TIME); setOver(false); setV(''); setFlash(''); }}>
              <span className="top-e" aria-hidden="true">{l.e}</span>
              <span dir="auto">{l.n[lang]}</span>
              <small>{best(l.id) ? `${best(l.id)}/10` : ''}</small>
            </button>
          ))}
        </div>
        <p className="muted small">{t('top.source')}</p>
      </Shell>
    );
  }
  const onChange = (x: string) => {
    setV(x);
    if (x.trim().length < 3) return;
    const c = matchCountry(x, geo);
    if (!c) return;
    if (list.ids.includes(c.id) && !found.includes(c.id)) {
      const next = [...found, c.id];
      setFound(next); setV(''); setFlash(`✓ ${nameOf(c.n, lang)}`); sfx.good();
      if (next.length === 10) setOver(true);
    } else if (!list.ids.includes(c.id) && x.trim().length >= nameOf(c.n, lang).length) setFlash(t('top.notIn', { name: nameOf(c.n, lang) }));
  };
  const mm = String(Math.floor(left / 60)), ss = String(left % 60).padStart(2, '0');
  return (
    <Shell game="topten" back={() => setList(null)}>
      <div className="na-bar">
        <strong dir="auto">{list.e} {list.n[lang]}</strong>
        <span className={`na-clock ${left < 20 && !over ? 'low' : ''}`}>{mm}:{ss}</span>
      </div>
      <p className="na-score"><b>{found.length}</b> / 10 {flash && !over && <span className={`na-flash ${flash.startsWith('✓') ? '' : 'no'}`} key={flash}>{flash}</span>}</p>
      {!over ? (
        <div className="pz-field">
          <input autoFocus value={v} onChange={(e) => onChange(e.target.value)} placeholder={t('pz.placeholder')} autoComplete="off" autoCorrect="off" spellCheck={false} dir="auto" />
          <button type="button" className="btn" onClick={() => setOver(true)}>{t('na.stop')}</button>
        </div>
      ) : (
        <div className={`pz-end ${found.length === 10 ? 'won' : ''}`}>
          {found.length === 10 && <Confetti size="big" />}
          <span className="na-big">🔟</span>
          <div><strong>{t('na.result', { n: found.length, total: 10 })}</strong></div>
          <div className="pz-end-actions">
            <button type="button" className="btn primary" onClick={() => shareText(`${t('top.share', { list: list.n[lang], n: found.length })}\n${location.origin}`)}>{t('pz.share')}</button>
            <button type="button" className="btn" onClick={() => setList(null)}>{t('top.other')}</button>
          </div>
        </div>
      )}
      <ol className="top-ranks">
        {list.ids.map((id, i) => {
          const ok = found.includes(id);
          return (
            <li key={id} className={ok ? 'ok' : over ? 'miss' : ''}>
              <b>{i + 1}</b>
              {ok || over ? <><img src={`/api/flag/${id}.svg`} alt="" width="24" height="18" /><span dir="auto">{nameOf(byId.get(id)?.n, lang)}</span><small>{topValue(list, i, lang, t)}</small></> : <span className="top-blank" />}
            </li>
          );
        })}
      </ol>
    </Shell>
  );
}
