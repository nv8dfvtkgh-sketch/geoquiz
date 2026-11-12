// Espace classe (prof et élèves) et tournoi du vendredi soir.
import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/protocol';
import { api } from '../account';
import { FAMILIES } from '../games';
import { formatTime } from '../i18n';
import { createGame, joinGame } from '../net';
import { useApp } from '../state';

const NOT_ASSIGNABLE = new Set(['daily', 'review', 'custom', 'brands']);
const JOIN_KEY = 'gq.joinClass';
const later = (code: string | null) => { try { if (code) localStorage.setItem(JOIN_KEY, code); else localStorage.removeItem(JOIN_KEY); } catch { /* ignoré */ } };
const pending = () => { try { return localStorage.getItem(JOIN_KEY); } catch { return null; } };

interface Assign { id: string; settings: Settings; due?: string; mine?: { correct: number; total: number; best: number; tries: number } | null }
interface Joined { code: string; name: string; level: string; teacher: string; assignments: Assign[] }
interface Mine { teaching: { code: string; name: string; level: string; students: number; assignments: number }[]; joined: Joined[]; canTeach: boolean }

function Back({ to = 'home' }: { to?: 'home' | 'profile' }) {
  const { t, go } = useApp();
  return <button type="button" className="back-link" onClick={() => { history.replaceState(null, '', '/'); go(to); }}>‹ {to === 'home' ? t('setup.backHome') : t('profile.title')}</button>;
}

/** Nom court d'un devoir : jeu, et zone quand elle compte. */
function useAssignLabel() {
  const { t, catalog, lang } = useApp();
  return (s: Settings) => {
    const z = catalog?.zones.find((x) => x.id === s.zone);
    const zone = !z || z.id === 'world' || catalog?.categories.find((c) => c.id === s.category)?.noZone ? '' : ` · ${z.kind === 'regions' ? z.names?.[lang] ?? '' : t(`zone.${z.id.replace(':', '.')}`)}`;
    return `${t(`cat.${s.category}`)}${zone} · ${t(`diff.${s.difficulty}`)}`;
  };
}

export function ClassesScreen() {
  const { t, me, auth, go, s } = useApp();
  const [data, setData] = useState<Mine | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [err, setErr] = useState('');
  const load = () => api<Mine>('/api/classes', { token: auth }).then((r) => r.ok && setData(r.data));
  useEffect(() => { if (auth) load(); }, [auth]);
  if (!me) return (
    <div className="panel school"><Back /><h1>{t('class.title')}</h1><div className="review-box"><p>{t('class.signin')}</p><button type="button" className="btn primary" onClick={() => go('signin')}>{t('account.create')}</button></div></div>
  );
  if (open) return <ClassDetail code={open} onBack={() => { setOpen(null); load(); }} />;
  if (!data) return <div className="loading" />;
  const join = async () => {
    setErr('');
    const r = await api('/api/classes/join', { method: 'POST', token: auth, body: { code: code.trim().toUpperCase() } });
    if (r.ok) { setCode(''); load(); } else setErr(r.data?.error ?? 'server');
  };
  const create = async () => {
    setErr('');
    const r = await api('/api/classes', { method: 'POST', token: auth, body: { name, level } });
    if (r.ok) { setName(''); setLevel(''); setOpen(r.data.code); } else setErr(r.data?.error ?? 'server');
  };
  return (
    <div className="panel school">
      <Back />
      <h1>{t('class.title')}</h1>
      {data.joined.map((c) => <StudentClass key={c.code} c={c} onLeft={load} />)}
      <section className="school-card">
        <h2>{t('class.joinTitle')}</h2>
        <form className="join-row" onSubmit={(e) => { e.preventDefault(); join(); }}>
          <input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="ABC234" aria-label={t('class.code')} />
          <button className="btn primary" disabled={code.length !== 6}>{t('class.join')}</button>
        </form>
      </section>
      {data.canTeach && (
        <section className="school-card">
          <h2>{t('class.teachTitle')}</h2>
          <p className="muted">{t('class.teachHint')}</p>
          {data.teaching.length > 0 && (
            <ul className="class-list">
              {data.teaching.map((c) => (
                <li key={c.code}><button type="button" onClick={() => setOpen(c.code)}>
                  <strong>{c.name}</strong> <span className="muted">{c.level}</span>
                  <small>{t('class.counts', { s: c.students, a: c.assignments })}</small>
                </button></li>
              ))}
            </ul>
          )}
          <form className="row2 class-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <label className="field"><span>{t('class.name')}</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="CM2 B" /></label>
            <label className="field"><span>{t('class.level')}</span><input value={level} onChange={(e) => setLevel(e.target.value)} maxLength={12} placeholder="CE6" /></label>
            <button className="btn primary" disabled={name.trim().length < 2}>{t('class.create')}</button>
          </form>
        </section>
      )}
      {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}
      {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}
    </div>
  );
}

function StudentClass({ c, onLeft }: { c: Joined; onLeft: () => void }) {
  const { t, auth, name, lang, fail } = useApp();
  const label = useAssignLabel();
  const [confirm, setConfirm] = useState(false);
  const play = (a: Assign) => createGame({ kind: 'solo', settings: a.settings, assignment: `${c.code}:${a.id}` }, name, lang).then(fail);
  const leave = async () => { await api(`/api/classes/${c.code}/leave`, { method: 'POST', token: auth }); onLeft(); };
  return (
    <section className="school-card">
      <h2>{c.name} <span className="muted">{c.level}</span></h2>
      <p className="muted">{t('class.teacher', { name: c.teacher })}</p>
      {c.assignments.length === 0 ? <p className="muted">{t('class.noHomework')}</p> : (
        <ul className="hw-list">
          {c.assignments.map((a) => (
            <li key={a.id} className={a.mine ? 'done' : ''}>
              <div>
                <strong>{label(a.settings)}</strong>
                {a.due && <small>{t('class.due', { d: new Date(a.due).toLocaleDateString(lang, { day: 'numeric', month: 'long' }) })}</small>}
                {a.mine && <small className="good-txt">{t('class.myScore', { c: a.mine.correct, n: a.mine.total, b: a.mine.best })}</small>}
              </div>
              <button type="button" className={`btn ${a.mine ? 'ghost' : 'primary'}`} onClick={() => play(a)}>{a.mine ? t('class.replay') : t('class.play')}</button>
            </li>
          ))}
        </ul>
      )}
      {confirm ? (
        <div className="row-actions"><span>{t('class.leaveConfirm')}</span><button type="button" className="btn ghost" onClick={() => setConfirm(false)}>{t('class.cancel')}</button><button type="button" className="btn danger" onClick={leave}>{t('class.leave')}</button></div>
      ) : <button type="button" className="text-btn" onClick={() => setConfirm(true)}>{t('class.leave')}</button>}
    </section>
  );
}

interface Detail {
  code: string; name: string; level: string;
  students: Record<string, { pseudo: string; avatar: string }>;
  assignments: { id: string; settings: Settings; due?: string }[];
  results: Record<string, Record<string, { correct: number; total: number; best: number; tries: number; timeMs: number }>>;
}

function ClassDetail({ code, onBack }: { code: string; onBack: () => void }) {
  const { t, auth, catalog, lang } = useApp();
  const label = useAssignLabel();
  const [d, setD] = useState<Detail | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [form, setForm] = useState<{ category: string; zone: string; difficulty: Settings['difficulty']; count: number; due: string }>({ category: 'regions', zone: 'r:MA:groups', difficulty: 'easy', count: 10, due: '' });
  const load = () => api<Detail>(`/api/classes/${code}`, { token: auth }).then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); }, [code]);
  if (!d) return <div className="loading" />;
  const link = `${location.origin}/classe/${code}`;
  const games = FAMILIES.flatMap((f) => f.games).filter((g) => !g.soon && !g.screen && !NOT_ASSIGNABLE.has(g.id));
  const cat = catalog?.categories.find((c) => c.id === form.category);
  const zones = (catalog?.zones ?? []).filter((z) => z.categories.includes(form.category) && (z.kind !== 'subregion') && (z.kind !== 'regions' || z.level === 'groups'));
  const setCat = (category: string) => {
    const zs = (catalog?.zones ?? []).filter((z) => z.categories.includes(category));
    setForm((f) => ({ ...f, category, zone: zs.find((z) => z.id === 'r:MA:groups')?.id ?? zs.find((z) => z.id === 'world')?.id ?? zs[0]?.id ?? 'world' }));
  };
  const assign = async () => {
    const r = await api(`/api/classes/${code}/assign`, { method: 'POST', token: auth, body: { settings: { category: form.category, zone: form.zone, difficulty: form.difficulty, count: form.count }, due: form.due || undefined } });
    if (r.ok) load();
  };
  const unassign = async (id: string) => { await api(`/api/classes/${code}/assign/${id}`, { method: 'DELETE', token: auth }); load(); };
  const remove = async (sid: string) => { await api(`/api/classes/${code}/students/${sid}`, { method: 'DELETE', token: auth }); load(); };
  const del = async () => { await api(`/api/classes/${code}`, { method: 'DELETE', token: auth }); onBack(); };
  const csv = async () => {
    const r = await fetch(`/api/classes/${code}.csv`, { headers: { Authorization: `Bearer ${auth}` } });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url; a.download = `quizellige-${d.name.replace(/\s+/g, '-')}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* refusé */ } };
  const students = Object.entries(d.students).sort((a, b) => a[1].pseudo.localeCompare(b[1].pseudo, lang));
  return (
    <div className="panel school">
      <button type="button" className="back-link" onClick={onBack}>‹ {t('class.title')}</button>
      <h1>{d.name} <span className="muted">{d.level}</span></h1>
      <section className="school-card class-code">
        <p className="label">{t('class.codeForStudents')}</p>
        <p className="code">{code.split('').map((c, i) => <span key={i}>{c}</span>)}</p>
        <p className="link">{link.replace(/^https?:\/\//, '')}</p>
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={copy}>{copied ? t('lobby.copied') : t('lobby.copy')}</button>
          <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(`${t('class.waText', { name: d.name })}\n${link}`)}`} target="_blank" rel="noopener">WhatsApp</a>
        </div>
        <p className="hint">{t('class.codeHint')}</p>
      </section>

      <section className="school-card">
        <h2>{t('class.newHomework')}</h2>
        <form className="hw-form" onSubmit={(e) => { e.preventDefault(); assign(); }}>
          <label className="field"><span>{t('print.game')}</span>
            <select value={form.category} onChange={(e) => setCat(e.target.value)}>
              {FAMILIES.map((f) => {
                const list = f.games.filter((g) => games.includes(g));
                return list.length ? <optgroup key={f.id} label={t(`family.${f.id}`)}>{list.map((g) => <option key={g.id} value={g.id}>{t(`cat.${g.id}`)}</option>)}</optgroup> : null;
              })}
            </select>
          </label>
          {!cat?.noZone && zones.length > 1 && (
            <label className="field"><span>{t('setup.zone')}</span>
              <select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.kind === 'regions' ? `${t('print.regionsOf')} ${z.names?.[lang] ?? ''}` : t(`zone.${z.id.replace(':', '.')}`)}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>{t('setup.difficulty')}</span>
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Settings['difficulty'] })}>
              {(['easy', 'medium', 'hard'] as const).map((x) => <option key={x} value={x}>{t(`diff.${x}`)}</option>)}
            </select>
          </label>
          <label className="field"><span>{t('setup.count')}</span>
            <select value={form.count} onChange={(e) => setForm({ ...form, count: +e.target.value })}>
              {[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field"><span>{t('class.dueDate')}</span><input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></label>
          <button className="btn primary">{t('class.give')}</button>
        </form>
      </section>

      <section className="school-card">
        <div className="row-actions" style={{ justifyContent: 'space-between' }}>
          <h2>{t('class.results', { n: students.length })}</h2>
          {students.length > 0 && <button type="button" className="btn ghost" onClick={csv}>{t('admin.exportCsv')}</button>}
        </div>
        {students.length === 0 ? <p className="muted">{t('class.noStudents')}</p> : (
          <div className="table-wrap">
            <table className="admin-table class-table">
              <thead><tr><th>{t('class.student')}</th>{d.assignments.map((a) => (
                <th key={a.id}>{label(a.settings)}{a.due && <small> · {new Date(a.due).toLocaleDateString(lang, { day: 'numeric', month: 'short' })}</small>}
                  <button type="button" className="text-btn danger" aria-label={t('admin.delete')} onClick={() => unassign(a.id)}>×</button></th>
              ))}<th /></tr></thead>
              <tbody>
                {students.map(([id, st]) => (
                  <tr key={id}>
                    <td dir="auto">{st.avatar} {st.pseudo}</td>
                    {d.assignments.map((a) => {
                      const r = d.results[a.id]?.[id];
                      return <td key={a.id}>{r ? <><span className="pill ok">{r.correct}/{r.total}</span>{r.tries > 1 && <small className="muted"> · {t('class.best', { b: r.best })}</small>}<small className="muted"> · {formatTime(r.timeMs)}</small></> : <span className="pill wait">{t('class.todo')}</span>}</td>;
                    })}
                    <td><button type="button" className="text-btn danger" onClick={() => remove(id)}>{t('class.remove')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {confirm ? (
        <div className="row-actions"><span>{t('class.deleteConfirm')}</span><button type="button" className="btn ghost" onClick={() => setConfirm(false)}>{t('class.cancel')}</button><button type="button" className="btn danger" onClick={del}>{t('class.delete')}</button></div>
      ) : <button type="button" className="text-btn danger" onClick={() => setConfirm(true)}>{t('class.delete')}</button>}
    </div>
  );
}

/** Lien /classe/CODE : rejoindre la classe (après connexion si besoin). */
export function ClassJoinScreen() {
  const { t, s, me, auth, go } = useApp();
  const code = s.classCode ?? '';
  const [info, setInfo] = useState<{ name: string; teacher: string; level: string } | null>(null);
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  useEffect(() => { fetch(`/api/class/${code}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setInfo).catch(() => setState('error')); }, [code]);
  const join = async () => {
    const r = await api('/api/classes/join', { method: 'POST', token: auth, body: { code } });
    if (r.ok) { later(null); setState('done'); } else { setErr(r.data?.error ?? 'server'); }
  };
  if (state === 'error') return <div className="panel school"><Back /><h1>{t('err.class.notFound')}</h1></div>;
  if (!info) return <div className="loading" />;
  return (
    <div className="panel school challenge-page">
      <p className="ch-swords" aria-hidden="true">🏫</p>
      <h1>{info.name} <span className="muted">{info.level}</span></h1>
      <p className="ch-game">{t('class.teacher', { name: info.teacher })}</p>
      {state === 'done' ? (
        <><p className="record">{t('class.joined')}</p><button type="button" className="btn primary" onClick={() => go('classes')}>{t('class.seeHomework')}</button></>
      ) : me ? (
        <button type="button" className="btn primary big" onClick={join}>{t('class.joinAs', { name: me.pseudo })}</button>
      ) : (
        <><p>{t('class.needAccount')}</p><button type="button" className="btn primary big" onClick={() => { later(code); go('signin'); }}>{t('account.create')}</button></>
      )}
      {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}
    </div>
  );
}

/** Accueil : devoirs à faire, et inscription en attente après création du compte. */
export function HomeworkCard() {
  const { t, me, auth, go } = useApp();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!me || !auth) return;
    const code = pending();
    const after = code ? api('/api/classes/join', { method: 'POST', token: auth, body: { code } }).then(() => later(null)) : Promise.resolve();
    after.then(() => api<Mine>('/api/classes', { token: auth })).then((r) => {
      if (r.ok) setN(r.data.joined.reduce((s, c) => s + c.assignments.filter((a) => !a.mine).length, 0));
    });
  }, [me?.id, auth]);
  if (!n) return null;
  return (
    <button type="button" className="homework-card" onClick={() => { go('classes'); window.scrollTo(0, 0); }}>
      <span aria-hidden="true">📚</span>
      <span><strong>{t('class.homeworkCount', { n })}</strong><small>{t('class.homeworkHint')}</small></span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

// ------------------------------------------------------------------ tournoi du vendredi
interface Tn { startsAt: number; opensAt: number; state: 'soon' | 'open' | 'live' | 'over'; category: string; code: string | null }

export function TournamentScreen() {
  const { t, name, lang, fail, s } = useApp();
  const [tn, setTn] = useState<Tn | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const load = () => fetch('/api/tournament').then((r) => r.json()).then(setTn).catch(() => {});
    load();
    const a = setInterval(load, 20000), b = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  if (!tn) return <div className="loading" />;
  const left = Math.max(0, tn.startsAt - now);
  const parts = [Math.floor(left / 864e5), Math.floor(left / 36e5) % 24, Math.floor(left / 6e4) % 60, Math.floor(left / 1000) % 60];
  const when = new Date(tn.startsAt).toLocaleString(lang === 'ar' ? 'ar-MA' : lang, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="panel tournament">
      <Back />
      <p className="ch-swords" aria-hidden="true">🏟️</p>
      <h1>{t('tn.title')}</h1>
      <p className="tn-theme">{t('tn.theme', { game: t(`cat.${tn.category}`) })}</p>
      <p className="muted">{t('tn.when', { when })}</p>
      {tn.state === 'soon' && (
        <div className="countdown big">
          {parts.map((v, i) => <div key={i}><b>{String(v).padStart(2, '0')}</b><small>{t(`tn.unit${i}`)}</small></div>)}
        </div>
      )}
      {(tn.state === 'open' || tn.state === 'live') && tn.code && (
        <>
          <p className="record">{tn.state === 'open' ? t('tn.openNow') : t('tn.liveNow')}</p>
          <button type="button" className="btn primary big" onClick={() => joinGame(tn.code!, name, lang).then(fail)}>{t('tn.enter')}</button>
        </>
      )}
      {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}
      <ul className="tn-rules">
        <li>{t('tn.rule1')}</li><li>{t('tn.rule2')}</li><li>{t('tn.rule3')}</li>
      </ul>
    </div>
  );
}
