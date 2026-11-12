// Jeux joués dans le navigateur : tout nommer, bataille de cartes, colorie le drapeau.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapData } from '../../shared/protocol';
import { useApp } from '../state';
import { Confetti } from '../Celebrate';
import { sfx } from '../sound';
import { famous, loadGeo, loadWorld, matchCountry, nameOf, shareText, type GeoCountry } from '../geo';
import { PuzzleBack } from './Puzzles';

/** Partie terminée : prévient le reste de l'appli (album d'autocollants). */
export const finished = (game: string, score: number) => window.dispatchEvent(new CustomEvent('gq:finished', { detail: { game, score } }));

function useGeoWorld() {
  const [geo, setGeo] = useState<GeoCountry[] | null>(null);
  const [world, setWorld] = useState<MapData | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { Promise.all([loadGeo(), loadWorld()]).then(([g, w]) => { setGeo(g); setWorld(w); }).catch(() => setErr(true)); }, []);
  return { geo, world, err };
}
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const best = (k: string) => { try { return Number(localStorage.getItem(`gq.best.${k}`)) || 0; } catch { return 0; } };
const setBest = (k: string, v: number) => { try { if (v > best(k)) localStorage.setItem(`gq.best.${k}`, String(v)); } catch { /* ignoré */ } };

// ======================================================================= tout nommer
const SETS = ['africa', 'europe', 'asia', 'north-america', 'south-america', 'oceania', 'world'];

export function NameAllScreen() {
  const { t, lang, look } = useApp();
  const { geo, world, err } = useGeoWorld();
  const [set, setSet] = useState<string | null>(null);
  const [caps, setCaps] = useState(false);
  if (err) return <div className="panel"><PuzzleBack /><p className="error">{t('pz.loadError')}</p></div>;
  if (!geo || !world) return <div className="loading" />;
  if (!set) {
    return (
      <div className="pz panel">
        <div className="pz-head"><PuzzleBack /><h1>{t('cat.nameall')}</h1><p className="muted">{t('na.how')}</p></div>
        <div className="seg" role="group">
          <button type="button" aria-pressed={!caps} onClick={() => setCaps(false)}>{t('cat.countries')}</button>
          <button type="button" aria-pressed={caps} onClick={() => setCaps(true)}>{t('cat.capitals')}</button>
        </div>
        <div className="na-sets">
          {SETS.map((s) => {
            const n = geo.filter((c) => (s === 'world' || c.co === s) && (!caps || c.cap)).length;
            const k = `na.${caps ? 'cap' : 'c'}.${s}`;
            return (
              <button type="button" key={s} className="na-set" onClick={() => setSet(s)}>
                <strong>{s === 'world' ? t('zone.world') : t(`zone.c.${s}`)}</strong>
                <small>{t('na.count', { n })} · {t('na.time', { m: Math.ceil(timeFor(n, look === 'kids') / 60) })}</small>
                {best(k) > 0 && <small className="na-best">🏆 {best(k)} / {n}</small>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  return <NameAllGame key={`${set}${caps}`} set={set} caps={caps} geo={geo} world={world} onBack={() => setSet(null)} lang={lang} />;
}
const timeFor = (n: number, kids: boolean) => Math.min(20 * 60, Math.round((n * (kids ? 9 : 6)) / 30) * 30 + 60);

function NameAllGame({ set, caps, geo, world, onBack, lang }: { set: string; caps: boolean; geo: GeoCountry[]; world: MapData; onBack: () => void; lang: string }) {
  const { t, look } = useApp();
  const list = useMemo(() => geo.filter((c) => (set === 'world' || c.co === set) && (!caps || c.cap)), [geo, set, caps]);
  const total = timeFor(list.length, look === 'kids');
  const [found, setFound] = useState<string[]>([]);
  const [left, setLeft] = useState(total);
  const [over, setOver] = useState(false);
  const [v, setV] = useState('');
  const [flash, setFlash] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const k = `na.${caps ? 'cap' : 'c'}.${set}`;
  useEffect(() => {
    if (over) return;
    const id = setInterval(() => setLeft((l) => { if (l <= 1) { setOver(true); return 0; } return l - 1; }), 1000);
    return () => clearInterval(id);
  }, [over]);
  useEffect(() => { if (over) { setBest(k, found.length); finished('nameall', found.length / list.length); sfx.end(); } }, [over]);
  // On valide dès que le nom tapé est reconnu (pas besoin d'Entrée), comme sur Sporcle.
  const onChange = (x: string) => {
    setV(x);
    const c = matchCountry(x, list, caps);
    if (c && !found.includes(c.id) && x.trim().length >= 3) {
      const next = [...found, c.id];
      setFound(next); setV(''); setFlash(caps ? nameOf(c.cap, lang as never) : nameOf(c.n, lang as never)); sfx.good();
      if (next.length === list.length) setOver(true);
    }
  };
  // Cadrage sur le continent.
  const ids = new Set(list.map((c) => c.id));
  const feats = world.features.filter((f) => ids.has(f.id));
  const bx = feats.reduce((b, f) => [Math.min(b[0], f.b[0]), Math.min(b[1], f.b[1]), Math.max(b[2], f.b[2]), Math.max(b[3], f.b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const vb = set === 'world' || !feats.length ? `0 ${world.h * 0.04} ${world.w} ${world.h * 0.84}` : `${bx[0] - 8} ${bx[1] - 8} ${bx[2] - bx[0] + 16} ${bx[3] - bx[1] + 16}`;
  const fs = new Set(found);
  const mm = String(Math.floor(left / 60)), ss = String(left % 60).padStart(2, '0');
  const sorted = [...list].sort((a, b) => nameOf(caps ? a.cap : a.n, lang as never).localeCompare(nameOf(caps ? b.cap : b.n, lang as never), lang));
  const place = set === 'world' ? t('zone.world') : t(`zone.c.${set}`);
  const share = `${t('na.share', { place, n: found.length, total: list.length })}\n${location.origin}`;
  return (
    <div className="pz panel">
      <div className="pz-head">
        <button type="button" className="back-link" onClick={onBack}>‹ {t('cat.nameall')}</button>
        <div className="na-bar">
          <strong>{caps ? t('na.capsOf', { place }) : t('na.countriesOf', { place })}</strong>
          <span className={`na-clock ${left < 30 && !over ? 'low' : ''}`}>{mm}:{ss}</span>
        </div>
        <div className="na-progress" aria-hidden="true"><span style={{ width: `${(found.length / list.length) * 100}%` }} /></div>
        <p className="na-score"><b>{found.length}</b> / {list.length} {flash && !over && <span className="na-flash" key={flash}>✓ {flash}</span>}</p>
      </div>
      {!over ? (
        <div className="pz-field">
          <input ref={ref} autoFocus value={v} onChange={(e) => onChange(e.target.value)} placeholder={caps ? t('pz.capPlaceholder') : t('pz.placeholder')} autoComplete="off" autoCorrect="off" spellCheck={false} dir="auto" />
          <button type="button" className="btn" onClick={() => setOver(true)}>{t('na.stop')}</button>
        </div>
      ) : (
        <div className={`pz-end ${found.length === list.length ? 'won' : ''}`}>
          {found.length === list.length && <Confetti size="big" />}
          <span className="na-big">{found.length === list.length ? '🏆' : '⏱️'}</span>
          <div><strong>{t('na.result', { n: found.length, total: list.length })}</strong><small>{t('na.best', { n: Math.max(best(k), found.length) })}</small></div>
          <div className="pz-end-actions">
            <button type="button" className="btn primary" onClick={() => shareText(share)}>{t('pz.share')}</button>
            <button type="button" className="btn" onClick={onBack}>{t('na.again')}</button>
          </div>
        </div>
      )}
      <div className="pz-map" dir="ltr">
        <svg viewBox={vb} role="img">
          <rect className="ocean" x={-50} y={-50} width={world.w + 100} height={world.h + 100} />
          {world.features.map((f) => <path key={f.id} d={f.d} className={`pz-land ${!ids.has(f.id) ? 'na-off' : fs.has(f.id) ? 'na-ok' : over ? 'na-miss' : ''}`} />)}
        </svg>
      </div>
      <ul className="na-list">
        {sorted.map((c) => (
          <li key={c.id} className={fs.has(c.id) ? 'ok' : over ? 'miss' : ''} dir="auto">{fs.has(c.id) || over ? nameOf(caps ? c.cap : c.n, lang as never) : ' '}</li>
        ))}
      </ul>
    </div>
  );
}

// ======================================================================= bataille de cartes
type Stat = 'pop' | 'area' | 'nb' | 'dens';
const STATS: Stat[] = ['pop', 'area', 'nb', 'dens'];
const val = (c: GeoCountry, s: Stat) => (s === 'pop' ? c.pop : s === 'area' ? c.area : s === 'nb' ? c.nb.length : c.area ? c.pop / c.area : 0);
const ROUNDS = 15;

export function CardsScreen() {
  const { t, lang, look } = useApp();
  const { geo, err } = useGeoWorld();
  const [deal, setDeal] = useState(0);
  const game = useMemo(() => {
    if (!geo) return null;
    const pool = shuffle(famous(geo.filter((c) => c.pop && c.area), 120)).slice(0, 20);
    return { me: pool.slice(0, 10), bot: pool.slice(10) };
  }, [geo, deal]);
  const [me, setMe] = useState<GeoCountry[]>([]);
  const [bot, setBot] = useState<GeoCountry[]>([]);
  const [round, setRound] = useState(1);
  const [turn, setTurn] = useState<'me' | 'bot'>('me');
  const [shown, setShown] = useState<{ stat: Stat; win: 'me' | 'bot' | 'tie' } | null>(null);
  useEffect(() => { if (game) { setMe(game.me); setBot(game.bot); setRound(1); setTurn('me'); setShown(null); } }, [game]);
  // Rang de chaque pays pour chaque caractéristique (l'ordi choisit sa meilleure).
  const pct = useMemo(() => {
    const m = new Map<string, number>();
    if (!geo) return m;
    for (const s of STATS) {
      const sorted = [...geo].sort((a, b) => val(a, s) - val(b, s));
      sorted.forEach((c, i) => m.set(`${c.id}:${s}`, i / sorted.length));
    }
    return m;
  }, [geo]);
  const over = !!game && (me.length === 0 || bot.length === 0 || round > ROUNDS);
  useEffect(() => { if (over && game) { finished('cards', me.length / 20); if (me.length > bot.length) sfx.end(); } }, [over]);
  // Au tour de l'ordi : il choisit après un court instant.
  useEffect(() => {
    if (!game || over || shown || turn !== 'bot' || !bot.length) return;
    const c = bot[0];
    // L'ordi joue souvent sa meilleure caractéristique, mais pas toujours (sinon il gagne trop).
    const bestStat = STATS.reduce((a, b) => ((pct.get(`${c.id}:${b}`) ?? 0) > (pct.get(`${c.id}:${a}`) ?? 0) ? b : a));
    const s = Math.random() < (look === 'kids' ? 0.4 : 0.65) ? bestStat : STATS[Math.floor(Math.random() * STATS.length)];
    const id = setTimeout(() => play(s), 1200);
    return () => clearTimeout(id);
  }, [turn, shown, bot, over]);
  if (err) return <div className="panel"><PuzzleBack /><p className="error">{t('pz.loadError')}</p></div>;
  if (!geo || !game || (!me.length && !bot.length)) return <div className="loading" />;

  function play(stat: Stat) {
    const a = val(me[0], stat), b = val(bot[0], stat);
    const win = a > b ? 'me' : b > a ? 'bot' : 'tie';
    if (win === 'me') sfx.good(); else if (win === 'bot') sfx.bad();
    setShown({ stat, win });
  }
  const next = () => {
    if (!shown) return;
    const [m, ...mr] = me, [b, ...br] = bot;
    if (shown.win === 'me') { setMe([...mr, m, b]); setBot(br); setTurn('me'); }
    else if (shown.win === 'bot') { setMe(mr); setBot([...br, b, m]); setTurn('bot'); }
    else { setMe([...mr, m]); setBot([...br, b]); }
    setShown(null); setRound((r) => r + 1);
  };
  const fmt = (c: GeoCountry, s: Stat) => {
    const x = val(c, s);
    if (s === 'nb') return String(x);
    if (s === 'dens') return `${Math.round(x).toLocaleString(lang)} /km²`;
    if (s === 'area') return `${new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(x)} km²`;
    return new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(x);
  };
  const Card = ({ c, side, hidden }: { c: GeoCountry; side: 'me' | 'bot'; hidden?: boolean }) => (
    <div className={`tt-card ${side} ${hidden ? 'back' : ''}`}>
      {hidden ? <span className="tt-back" aria-hidden="true">🌍</span> : <>
        <div className="tt-top"><img src={`/api/flag/${c.id}.svg`} alt="" width="40" height="30" /><strong dir="auto">{nameOf(c.n, lang)}</strong></div>
        {STATS.map((s) => {
          const can = side === 'me' && turn === 'me' && !shown;
          const on = shown?.stat === s;
          return (
            <button type="button" key={s} className={`tt-stat ${on ? 'on' : ''}`} disabled={!can} onClick={() => can && play(s)}>
              <span>{t(`cards.${s}`)}</span><b>{fmt(c, s)}</b>
            </button>
          );
        })}
      </>}
    </div>
  );
  if (over) {
    const won = me.length > bot.length;
    return (
      <div className="pz panel">
        <div className="pz-head"><PuzzleBack to="home" /><h1>{t('cat.cards')}</h1></div>
        <div className={`pz-end ${won ? 'won' : ''}`}>
          {won && <Confetti size="big" />}
          <span className="na-big">{won ? '🏆' : me.length === bot.length ? '🤝' : '🤖'}</span>
          <div><strong>{won ? t('cards.won') : me.length === bot.length ? t('cards.tie') : t('cards.lost')}</strong><small>{t('cards.score', { me: me.length, bot: bot.length })}</small></div>
          <div className="pz-end-actions"><button type="button" className="btn primary" onClick={() => setDeal((d) => d + 1)}>{t('na.again')}</button></div>
        </div>
      </div>
    );
  }
  return (
    <div className="pz panel">
      <div className="pz-head">
        <PuzzleBack to="home" />
        <h1>{t('cat.cards')}</h1>
        <div className="tt-score"><span>🙂 {t('cards.you')} <b>{me.length}</b></span><span>{t('cards.round', { n: round, total: ROUNDS })}</span><span><b>{bot.length}</b> {t('cards.bot')} 🤖</span></div>
      </div>
      <p className="pz-hint">{shown ? (shown.win === 'me' ? `✅ ${t('cards.winRound')}` : shown.win === 'bot' ? `❌ ${t('cards.loseRound')}` : `🤝 ${t('cards.tieRound')}`) : turn === 'me' ? `👉 ${t('cards.yourTurn')}` : `🤖 ${t('cards.botTurn')}`}</p>
      <div className="tt-table">
        <Card c={me[0]} side="me" />
        <Card c={bot[0]} side="bot" hidden={!shown} />
      </div>
      {shown && <button type="button" className="btn primary" autoFocus onClick={next}>{t('cards.next')}</button>}
    </div>
  );
}

// ======================================================================= colorie le drapeau
type Layout = 'h2' | 'h3' | 'v3' | 'nordic' | 'nordic2' | 'circle' | 'v1h2' | 'plus';
const COLORS: Record<string, string> = { red: '#D52B1E', white: '#FFFFFF', blue: '#0039A6', green: '#009246', yellow: '#FCD116', black: '#1D1D1F', orange: '#FF8200', sky: '#75AADB' };
const FLAGS: [string, Layout, string[], number][] = [
  // [pays, dessin, couleurs, niveau 1 (simple) à 3]
  ['FR', 'v3', ['blue', 'white', 'red'], 1], ['IT', 'v3', ['green', 'white', 'red'], 1], ['DE', 'h3', ['black', 'red', 'yellow'], 1],
  ['UA', 'h2', ['blue', 'yellow'], 1], ['PL', 'h2', ['white', 'red'], 1], ['ID', 'h2', ['red', 'white'], 1], ['JP', 'circle', ['white', 'red'], 1],
  ['BE', 'v3', ['black', 'yellow', 'red'], 1], ['IE', 'v3', ['green', 'white', 'orange'], 1], ['NL', 'h3', ['red', 'white', 'blue'], 1],
  ['RU', 'h3', ['white', 'blue', 'red'], 2], ['AT', 'h3', ['red', 'white', 'red'], 1], ['NG', 'v3', ['green', 'white', 'green'], 1],
  ['CH', 'plus', ['red', 'white'], 1], ['DK', 'nordic', ['red', 'white'], 1], ['SE', 'nordic', ['blue', 'yellow'], 2], ['FI', 'nordic', ['white', 'blue'], 2],
  ['NO', 'nordic2', ['red', 'white', 'blue'], 3], ['IS', 'nordic2', ['blue', 'white', 'red'], 3], ['BD', 'circle', ['green', 'red'], 2], ['PW', 'circle', ['sky', 'yellow'], 3],
  ['RO', 'v3', ['blue', 'yellow', 'red'], 2], ['ML', 'v3', ['green', 'yellow', 'red'], 2], ['GN', 'v3', ['red', 'yellow', 'green'], 2], ['CI', 'v3', ['orange', 'white', 'green'], 2],
  ['PE', 'v3', ['red', 'white', 'red'], 2], ['HU', 'h3', ['red', 'white', 'green'], 2], ['BG', 'h3', ['white', 'green', 'red'], 2], ['EE', 'h3', ['blue', 'black', 'white'], 3],
  ['LT', 'h3', ['yellow', 'green', 'red'], 3], ['YE', 'h3', ['red', 'white', 'black'], 3], ['SL', 'h3', ['green', 'white', 'blue'], 3], ['GA', 'h3', ['green', 'yellow', 'blue'], 3],
  ['AM', 'h3', ['red', 'blue', 'orange'], 3], ['LU', 'h3', ['red', 'white', 'sky'], 3], ['BO', 'h3', ['red', 'yellow', 'green'], 3], ['MC', 'h2', ['red', 'white'], 2],
  ['BJ', 'v1h2', ['green', 'yellow', 'red'], 3], ['MG', 'v1h2', ['white', 'red', 'green'], 3], ['CO', 'h3', ['yellow', 'blue', 'red'], 2],
];
function zones(l: Layout): string[] {
  const W = 300, H = 200;
  const r = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;
  switch (l) {
    case 'h2': return [r(0, 0, W, H / 2), r(0, H / 2, W, H / 2)];
    case 'h3': return [r(0, 0, W, H / 3), r(0, H / 3, W, H / 3), r(0, (2 * H) / 3, W, H / 3)];
    case 'v3': return [r(0, 0, W / 3, H), r(W / 3, 0, W / 3, H), r((2 * W) / 3, 0, W / 3, H)];
    case 'v1h2': return [r(0, 0, W * 0.4, H), r(W * 0.4, 0, W * 0.6, H / 2), r(W * 0.4, H / 2, W * 0.6, H / 2)];
    case 'circle': return [r(0, 0, W, H), 'M150 40a60 60 0 1 0 0.01 0z'];
    case 'plus': return [r(0, 0, W, H), 'M135 45h30v40h40v30h-40v40h-30v-40h-40v-30h40z'];
    case 'nordic': return [r(0, 0, W, H), 'M85 0h30v85h185v30H115v85H85v-85H0V85h85z'];
    case 'nordic2': return [r(0, 0, W, H), 'M75 0h50v75h175v50H125v75H75v-75H0V75h75z', 'M87 0h26v87h187v26H113v87H87v-87H0V87h87z'];
  }
}

export function ColorFlagScreen() {
  const { t, lang, look } = useApp();
  const { geo, err } = useGeoWorld();
  const [seed, setSeed] = useState(0);
  const list = useMemo(() => {
    if (!geo) return [];
    const ok = FLAGS.filter(([id]) => geo.some((c) => c.id === id));
    const max = look === 'kids' ? 2 : 3;
    const easy = shuffle(ok.filter((f) => f[3] === 1)), rest = shuffle(ok.filter((f) => f[3] > 1 && f[3] <= max));
    return [...easy.slice(0, 4), ...rest.slice(0, 6)].slice(0, 10);
  }, [geo, seed, look]);
  const [i, setI] = useState(0);
  const [paint, setPaint] = useState<string[]>([]);
  const [brush, setBrush] = useState('');
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const cur = list[i];
  const palette = useMemo(() => {
    if (!cur) return [];
    const extra = shuffle(Object.keys(COLORS).filter((c) => !cur[2].includes(c))).slice(0, 2);
    return shuffle([...new Set(cur[2]), ...extra]);
  }, [cur]);
  useEffect(() => { if (cur) { setPaint(cur[2].map(() => '')); setChecked(false); setBrush(''); } }, [cur]);
  useEffect(() => { if (list.length && i >= list.length) finished('colorflag', score / list.length); }, [i]);
  if (err) return <div className="panel"><PuzzleBack /><p className="error">{t('pz.loadError')}</p></div>;
  if (!geo || !list.length) return <div className="loading" />;
  if (i >= list.length) {
    return (
      <div className="pz panel">
        <div className="pz-head"><PuzzleBack to="home" /><h1>{t('cat.colorflag')}</h1></div>
        <div className={`pz-end ${score >= list.length - 1 ? 'won' : ''}`}>
          {score === list.length && <Confetti size="big" />}
          <span className="na-big">🎨</span>
          <div><strong>{t('cf.result', { n: score, total: list.length })}</strong></div>
          <div className="pz-end-actions"><button type="button" className="btn primary" onClick={() => { setSeed((s) => s + 1); setI(0); setScore(0); }}>{t('na.again')}</button></div>
        </div>
      </div>
    );
  }
  const [id, layout, colors] = cur;
  const paths = zones(layout);
  const country = geo.find((c) => c.id === id)!;
  const ok = paint.map((p, k) => p === colors[k]);
  const full = paint.every(Boolean);
  const check = () => { setChecked(true); if (ok.every(Boolean)) { setScore((s) => s + 1); sfx.good(); } else sfx.bad(); };
  return (
    <div className="pz panel">
      <div className="pz-head">
        <PuzzleBack to="home" />
        <h1>{t('cat.colorflag')}</h1>
        <p className="muted">{t('cf.how')}</p>
      </div>
      <p className="cf-q"><span>{i + 1} / {list.length}</span><strong dir="auto">{nameOf(country.n, lang)}</strong></p>
      <svg className="cf-flag" viewBox="0 0 300 200" role="img" aria-label={nameOf(country.n, lang)}>
        {paths.map((d, k) => (
          <path key={k} d={d} fillRule="evenodd" className={`${checked ? (ok[k] ? 'ok' : 'bad') : ''} ${paint[k] ? '' : 'blank'}`} style={{ fill: paint[k] ? COLORS[paint[k]] : undefined }}
            onClick={() => { if (checked || !brush) return; const p = [...paint]; p[k] = brush; setPaint(p); sfx.tick(); }} />
        ))}
      </svg>
      {checked && <div className="cf-real"><span>{ok.every(Boolean) ? `✅ ${t('cf.right')}` : `❌ ${t('cf.wrong')}`}</span><img src={`/api/flag/${id}.svg`} alt="" width="72" height="48" /></div>}
      {!checked && (
        <div className="cf-palette" role="radiogroup" aria-label={t('cf.palette')}>
          {palette.map((c) => (
            <button type="button" key={c} role="radio" aria-checked={brush === c} aria-label={t(`color.${c}`)} title={t(`color.${c}`)} className={brush === c ? 'on' : ''} style={{ background: COLORS[c] }} onClick={() => setBrush(c)} />
          ))}
        </div>
      )}
      {!checked ? <button type="button" className="btn primary" disabled={!full} onClick={check}>{t('cf.check')}</button>
        : <button type="button" className="btn primary" autoFocus onClick={() => setI(i + 1)}>{i + 1 < list.length ? t('play.next') : t('play.finish')}</button>}
    </div>
  );
}
