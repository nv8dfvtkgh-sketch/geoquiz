// Geo Masters : le concours de géographie, une saison par mois. Écran de la saison :
// division, qualification (50 QCM, 20 min, +2 / 0 / −1), direct au buzzer, finale, classements.
import { useEffect, useState } from 'react';
import { GM_DIVISIONS, GM_LIVE, GM_QUALIF, type GmDivision } from '../../shared/gm';
import { savedAuth } from '../account';
import { createGame, joinGame } from '../net';
import { useApp } from '../state';
import { PuzzleBack } from './Puzzles';

interface LiveStep { at: number; state: 'soon' | 'open' | 'live' | 'over'; code: string | null }
interface GmData {
  season: string; div: GmDivision; allowed: GmDivision[]; signedIn: boolean; played: GmDivision | null;
  cal: { qualifyEnd: number };
  players: number; spots: number;
  top: { rank: number; p: string; av: string; c?: string; pts: number; ok: number; n: number; me: boolean }[];
  me: { rank: number; pts: number; ok: number; n: number; semi: boolean } | null;
  finalist: boolean;
  semi: { name: string; score: number; me: boolean }[] | null;
  final: { name: string; score: number; me: boolean }[] | null;
  champions: Record<string, string | null>; prev: string;
  live: { semi: LiveStep; final: LiveStep };
}

const KEY = 'gq.gmdiv';

export function GeoMastersScreen() {
  const { t, lang, name, fail, go, s } = useApp();
  const [div, setDiv] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [d, setD] = useState<GmData | null>(null);
  const [err, setErr] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let alive = true;
    const load = () => {
      const tk = savedAuth();
      fetch(`/api/gm${div ? `?div=${div}` : ''}`, { headers: tk ? { Authorization: `Bearer ${tk}` } : {} })
        .then((r) => r.json()).then((j) => { if (alive) { setD(j); setErr(false); } }).catch(() => alive && setErr(true));
    };
    load();
    const a = setInterval(load, 30_000), b = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, [div]);
  if (err && !d) return <div className="panel"><PuzzleBack to="home" /><p className="error" role="alert">{t('err.server')}</p></div>;
  if (!d) return <div className="loading" />;

  const loc = lang === 'ar' ? 'ar-MA' : lang;
  const month = new Date(`${d.season}-15T12:00:00Z`).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const when = (ms: number) => new Date(ms).toLocaleString(loc, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const pick = (x: GmDivision) => { setDiv(x); try { localStorage.setItem(KEY, x); } catch { /* ignoré */ } };
  const qualifOpen = now < d.cal.qualifyEnd;
  const canQualify = d.signedIn && qualifOpen && !d.played && d.allowed.includes(d.div);
  const start = () => createGame({ kind: 'solo', settings: { category: 'gm', zone: 'world', difficulty: 'medium', qtype: 'mcq', count: GM_QUALIF.questions, timeLimit: 15, gm: { div: d.div, stage: 'qualif' } } as any }, name, lang).then(fail);
  const left = (ms: number) => {
    const x = Math.max(0, ms - now);
    const dd = Math.floor(x / 864e5), h = Math.floor(x / 36e5) % 24, m = Math.floor(x / 6e4) % 60;
    return dd ? t('gm.inDays', { d: dd, h }) : t('gm.inHours', { h, m });
  };

  return (
    <div className="gm panel">
      <PuzzleBack to="home" />
      <header className="gm-hero">
        <small>{t('gm.kicker', { month })}</small>
        <h1>Geo Masters</h1>
        <p>{t('gm.pitch')}</p>
      </header>

      <section className="bac-box">
        <strong>{t('gm.division')}</strong>
        <div className="gm-divs">
          {GM_DIVISIONS.map((x) => {
            const ok = d.allowed.includes(x) && (!d.played || d.played === x);
            return (
              <button type="button" key={x} className={d.div === x ? 'on' : ''} aria-pressed={d.div === x} onClick={() => pick(x)}>
                <strong>{t(`gm.div.${x}`)}</strong><small>{t(`gm.divHint.${x}`)}</small>
                {!ok && d.signedIn && <small className="gm-lock">{d.played ? t('gm.otherDiv') : t('gm.notYourAge')}</small>}
              </button>
            );
          })}
        </div>
      </section>

      <ol className="gm-steps">
        <li className={qualifOpen ? 'now' : 'done'}>
          <span className="gm-num" aria-hidden="true">1</span>
          <div>
            <strong>{t('gm.step1')}</strong>
            <p className="muted small">{t('gm.step1Hint', { n: GM_QUALIF.questions, min: GM_QUALIF.minutes, until: when(d.cal.qualifyEnd) })}</p>
            {d.me && <p className="gm-me">{t('gm.myScore', { pts: d.me.pts, rank: d.me.rank, players: d.players })} {d.me.semi ? t('gm.inSemi') : t('gm.notSemi', { spots: d.spots })}</p>}
            {!d.signedIn && <button type="button" className="btn primary" onClick={() => go('signin')}>{t('gm.needAccount')}</button>}
            {d.signedIn && !d.me && d.played && d.played !== d.div && <p className="muted small">{t('gm.playedIn', { div: t(`gm.div.${d.played}`) })}</p>}
            {canQualify && !confirm && <button type="button" className="btn primary" onClick={() => setConfirm(true)}>{t('gm.qualify')}</button>}
            {canQualify && confirm && (
              <div className="gm-confirm" role="alertdialog" aria-labelledby="gm-c">
                <p id="gm-c">{t('gm.confirm', { n: GM_QUALIF.questions, min: GM_QUALIF.minutes })}</p>
                <ul><li>{t('gm.rule.good')}</li><li>{t('gm.rule.pass')}</li><li>{t('gm.rule.bad')}</li></ul>
                <div className="gm-row"><button type="button" className="btn primary" onClick={start}>{t('gm.go')}</button><button type="button" className="btn ghost" onClick={() => setConfirm(false)}>{t('profile.cancel')}</button></div>
              </div>
            )}
            {d.signedIn && !d.allowed.includes(d.div) && <p className="muted small">{t('gm.notYourAge')}</p>}
            {s.error?.startsWith('gm.') && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}
          </div>
        </li>
        <Live step={d.live.semi} n={1} title={t('gm.step2')} hint={t('gm.step2Hint', { spots: d.spots, q: GM_LIVE.semi })} allowed={!!d.me?.semi} results={d.semi} when={when} left={left} onEnter={(c) => joinGame(c, name, lang).then(fail)} />
        <Live step={d.live.final} n={2} title={t('gm.step3')} hint={t('gm.step3Hint', { n: GM_LIVE.finalists, q: GM_LIVE.final })} allowed={d.finalist} results={d.final} when={when} left={left} onEnter={(c) => joinGame(c, name, lang).then(fail)} champion />
      </ol>

      <section className="bac-box">
        <div className="gm-row between"><strong>{t('gm.ranking', { div: t(`gm.div.${d.div}`) })}</strong><span className="muted small">{t('gm.players', { n: d.players })}</span></div>
        {d.top.length ? (
          <ol className="gm-rank">
            {d.top.map((r) => (
              <li key={r.rank} className={`${r.me ? 'me' : ''} ${r.rank <= d.spots ? 'in' : ''}`}>
                <span className="r">{r.rank}</span><span className="n" dir="auto">{r.p}</span><small className="muted">{r.ok}/{r.n}</small><strong>{t('gm.pts', { n: r.pts })}</strong>
              </li>
            ))}
          </ol>
        ) : <p className="muted">{t('gm.empty')}</p>}
        <p className="muted small">{t('gm.spotsHint', { spots: d.spots })}</p>
      </section>

      {Object.values(d.champions).some(Boolean) && (
        <section className="bac-box">
          <strong>{t('gm.hall', { month: new Date(`${d.prev}-15T12:00:00Z`).toLocaleDateString(loc, { month: 'long', year: 'numeric' }) })}</strong>
          <ul className="gm-hall">{GM_DIVISIONS.map((x) => d.champions[x] && <li key={x}><span>👑 {t(`gm.div.${x}`)}</span><strong dir="auto">{d.champions[x]}</strong></li>)}</ul>
        </section>
      )}
    </div>
  );
}

function Live({ step, n, title, hint, allowed, results, when, left, onEnter, champion }: {
  step: LiveStep; n: number; title: string; hint: string; allowed: boolean; results: { name: string; score: number; me: boolean }[] | null;
  when: (ms: number) => string; left: (ms: number) => string; onEnter: (code: string) => void; champion?: boolean;
}) {
  const { t } = useApp();
  return (
    <li className={step.state === 'open' || step.state === 'live' ? 'now' : step.state === 'over' || results ? 'done' : ''}>
      <span className="gm-num" aria-hidden="true">{n + 1}</span>
      <div>
        <strong>{title}</strong>
        <p className="muted small">{hint}</p>
        <p className="small">{when(step.at)}{step.state === 'soon' && <span className="muted"> · {left(step.at)}</span>}</p>
        {allowed && !results && <p className="gm-me">{t('gm.youreIn')}</p>}
        {step.code && <button type="button" className="btn primary" onClick={() => onEnter(step.code!)}>{step.state === 'live' ? t('gm.enterLive') : t('gm.enter')}</button>}
        {results && (
          <ol className="gm-rank small">
            {results.slice(0, champion ? 8 : 10).map((r, i) => <li key={i} className={r.me ? 'me' : ''}><span className="r">{i === 0 && champion ? '👑' : i + 1}</span><span className="n" dir="auto">{r.name}</span><strong>{r.score}</strong></li>)}
          </ol>
        )}
      </div>
    </li>
  );
}

/** Pendant la qualification : chrono de l'épreuve et bouton « Passer ». */
export function GmBar({ endsIn, qAt, onPass, locked }: { endsIn: number; qAt: number; onPass: () => void; locked: boolean }) {
  const { t } = useApp();
  const [now, setNow] = useState(performance.now());
  useEffect(() => { const id = setInterval(() => setNow(performance.now()), 500); return () => clearInterval(id); }, []);
  const ms = Math.max(0, endsIn - (now - qAt));
  const m = Math.floor(ms / 60000), sec = Math.floor(ms / 1000) % 60;
  return (
    <div className="gm-bar">
      <span className={ms < 60_000 ? 'low' : ''}>⏱ {m}:{String(sec).padStart(2, '0')}</span>
      <small className="muted">{t('gm.scale')}</small>
      <button type="button" className="btn ghost" disabled={locked} onClick={onPass}>{t('gm.pass')}</button>
    </div>
  );
}
