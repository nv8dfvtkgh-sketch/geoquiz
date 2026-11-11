// « Crée ton quiz » : mes quiz, éditeur, fiche d'un quiz à jouer, et espace de validation (admin).
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type RoomKind, type Settings } from '../../shared/protocol';
import { createGame } from '../net';
import { useApp } from '../state';

// ------------------------------------------------------------------ outils
interface MyQuiz { id: string; token: string; title: string }
const MINE = 'gq.myQuizzes';
export function myQuizzes(): MyQuiz[] {
  try { return JSON.parse(localStorage.getItem(MINE) ?? '[]'); } catch { return []; }
}
function saveMine(list: MyQuiz[]) {
  try { localStorage.setItem(MINE, JSON.stringify(list)); } catch {}
}
const tokenFor = (id: string) => myQuizzes().find((q) => q.id === id)?.token;

async function api<T = any>(path: string, opts: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) } });
  let data: any = {};
  try { data = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, data };
}

const MAX_B64 = 150_000;
/** Réduit une photo dans le navigateur (800 px max, JPEG) pour qu'elle reste légère. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    for (const [side, quality] of [[800, 0.82], [800, 0.7], [640, 0.65], [480, 0.6], [360, 0.55]] as const) {
      const k = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', quality);
      if (data.length - 23 <= MAX_B64) return data;
    }
    throw new Error('too big');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="back-link" onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useApp();
  return <span className={`badge st-${status}`}>{t(`quiz.status.${status}`)}</span>;
}

// ------------------------------------------------------------------ mes quiz
export function MyQuizzes() {
  const { t, go, openQuiz } = useApp();
  const [code, setCode] = useState('');
  const [list, setList] = useState<(MyQuiz & { status?: string; reason?: string; playable?: boolean; gone?: boolean })[]>(myQuizzes);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    Promise.all(myQuizzes().map(async (q) => {
      const r = await api(`/api/quizzes/${q.id}?token=${encodeURIComponent(q.token)}`).catch(() => null);
      return r?.ok ? { ...q, title: r.data.title, status: r.data.status, reason: r.data.reason, playable: r.data.playable } : { ...q, gone: r?.status === 404 };
    })).then(setList);
  }, []);

  const copy = async (id: string) => {
    const link = `${location.origin}/quiz/${id}`;
    try { await navigator.clipboard.writeText(link); } catch {}
    setCopied(id);
    setTimeout(() => setCopied(''), 1800);
  };

  return (
    <div className="quizzes panel">
      <BackLink onClick={() => go('home')} label={t('setup.backHome')} />
      <h1>{t('quiz.mine')}</h1>

      <form className="join" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) openQuiz('quizsheet', { id: code, token: tokenFor(code) }); }}>
        <h2>{t('quiz.playCode')}</h2>
        <div className="join-row">
          <label htmlFor="quiz-code" className="sr">{t('quiz.code')}</label>
          <input id="quiz-code" className="code-input" value={code} placeholder="QZ4K7P" autoComplete="off" spellCheck={false}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} />
          <button className="btn primary" disabled={code.length !== 6}>{t('quiz.open')}</button>
        </div>
      </form>

      <button type="button" className="btn primary wide" onClick={() => openQuiz('editor')}>{t('quiz.new')}</button>

      {list.length > 0 && (
        <ul className="quiz-list">
          {list.map((q) => (
            <li key={q.id}>
              <div className="quiz-head">
                <strong dir="auto">{q.title}</strong>
                {q.gone ? <span className="badge st-rejected">{t('quiz.gone')}</span> : q.status && <StatusBadge status={q.status} />}
              </div>
              <p className="muted">{t('quiz.codeIs', { code: q.id })}{q.playable && q.status === 'pending' ? ` · ${t('quiz.oldLive')}` : ''}</p>
              {q.status === 'rejected' && q.reason && <p className="reason">{t('quiz.reason', { reason: q.reason })}</p>}
              {!q.gone && (
                <div className="row-actions">
                  <button type="button" className="btn ghost" onClick={() => openQuiz('quizsheet', { id: q.id, token: q.token })}>{q.playable ? t('quiz.play') : t('quiz.test')}</button>
                  <button type="button" className="btn ghost" onClick={() => openQuiz('editor', { id: q.id, token: q.token })}>{t('quiz.edit')}</button>
                  {q.playable && <button type="button" className="text-btn" onClick={() => copy(q.id)}>{copied === q.id ? t('lobby.copied') : t('lobby.copy')}</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">{t('quiz.reviewNote')}</p>
    </div>
  );
}

// ------------------------------------------------------------------ éditeur
interface EditQ { text: string; answers: string[]; correct: number; image?: string | { data: string } | null; preview?: string }
const emptyQ = (): EditQ => ({ text: '', answers: ['', '', '', ''], correct: 0, image: null });

export function QuizEditor() {
  const { t, s, openQuiz } = useApp();
  const editing = s.quiz?.token ? s.quiz : undefined;
  const [title, setTitle] = useState('');
  const [qs, setQs] = useState<EditQ[]>(() => [emptyQ(), emptyQ(), emptyQ()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(!!editing);

  useEffect(() => {
    if (!editing) return;
    api(`/api/quizzes/${editing.id}?token=${encodeURIComponent(editing.token!)}`).then((r) => {
      if (r.ok) {
        setTitle(r.data.draft.title);
        setQs(r.data.draft.questions.map((q: any) => ({
          text: q.text, correct: q.correct, image: q.image ?? null,
          answers: [...q.answers, '', '', ''].slice(0, 4),
          preview: q.image ? `/api/quizzes/${editing.id}/img/${q.image}?token=${encodeURIComponent(editing.token!)}` : undefined,
        })));
      }
      setLoading(false);
    });
  }, [editing?.id]);

  const patch = (i: number, p: Partial<EditQ>) => setQs((l) => l.map((q, k) => (k === i ? { ...q, ...p } : q)));
  const pickImage = async (i: number, file?: File) => {
    if (!file) return;
    try {
      const data = await shrinkImage(file);
      patch(i, { image: { data }, preview: data });
      setErr('');
    } catch { setErr('quiz.imageTooBig'); }
  };

  const save = async () => {
    setErr('');
    const draft = {
      title,
      questions: qs.map((q) => {
        const answers = q.answers.map((a) => a.trim());
        const kept = answers.map((a, i) => ({ a, i })).filter((x) => x.a);
        return { text: q.text, image: q.image ?? null, answers: kept.map((x) => x.a), correct: kept.findIndex((x) => x.i === q.correct) };
      }),
    };
    if (!title.trim()) return setErr('quiz.noTitle');
    if (draft.questions.some((q) => !q.text.trim() || q.answers.length < 2 || q.correct < 0)) return setErr('quiz.incomplete');
    setBusy(true);
    const r = editing
      ? await api(`/api/quizzes/${editing.id}`, { method: 'PUT', body: JSON.stringify({ token: editing.token, draft }) })
      : await api('/api/quizzes', { method: 'POST', body: JSON.stringify({ draft }) });
    setBusy(false);
    if (!r.ok) return setErr(r.data?.error ?? 'server');
    const id = editing?.id ?? r.data.id;
    const token = editing?.token ?? r.data.token;
    saveMine([{ id, token, title: title.trim() }, ...myQuizzes().filter((q) => q.id !== id)]);
    openQuiz('myquizzes');
  };

  if (loading) return <div className="loading" />;

  return (
    <div className="quizzes editor panel">
      <BackLink onClick={() => openQuiz('myquizzes')} label={t('quiz.mine')} />
      <h1>{editing ? t('quiz.editTitle') : t('quiz.new')}</h1>

      <label className="field">
        <span>{t('quiz.title')}</span>
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} dir="auto" />
      </label>

      {qs.map((q, i) => (
        <fieldset key={i} className="q-card">
          <div className="q-card-head">
            <legend>{t('quiz.question', { n: i + 1 })}</legend>
            {qs.length > 3 && (
              <button type="button" className="text-btn" onClick={() => setQs((l) => l.filter((_, k) => k !== i))}>{t('quiz.removeQ')}</button>
            )}
          </div>
          <label className="sr" htmlFor={`qt-${i}`}>{t('quiz.questionText')}</label>
          <input id={`qt-${i}`} value={q.text} maxLength={200} placeholder={t('quiz.questionText')} onChange={(e) => patch(i, { text: e.target.value })} dir="auto" />
          {q.preview ? (
            <div className="q-photo">
              <img src={q.preview} alt="" />
              <button type="button" className="text-btn" onClick={() => patch(i, { image: null, preview: undefined })}>{t('quiz.removeImage')}</button>
            </div>
          ) : (
            <label className="q-upload">
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr" onChange={(e) => pickImage(i, e.target.files?.[0])} />
              <span>{t('quiz.addImage')}</span>
              <small>{t('quiz.imageHint')}</small>
            </label>
          )}
          <span className="small muted">{t('quiz.answersHint')}</span>
          {q.answers.map((a, k) => (
            <label key={k} className={`q-answer ${q.correct === k ? 'on' : ''}`}>
              <input type="radio" name={`c-${i}`} checked={q.correct === k} onChange={() => patch(i, { correct: k })} aria-label={t('quiz.markCorrect')} />
              <input value={a} maxLength={80} placeholder={t('quiz.answer', { n: k + 1 })} dir="auto"
                onChange={(e) => patch(i, { answers: q.answers.map((x, j) => (j === k ? e.target.value : x)) })} />
            </label>
          ))}
        </fieldset>
      ))}

      {qs.length < 50 && <button type="button" className="btn ghost wide" onClick={() => setQs((l) => [...l, emptyQ()])}>{t('quiz.addQ')}</button>}

      <p className="notice">{t('quiz.rights')}</p>
      {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}
      <div className="actions">
        <button type="button" className="btn primary" disabled={busy} onClick={save}>{t('quiz.send')}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ fiche : jouer un quiz
export function QuizSheet() {
  const { t, s, go, name, setName, lang, fail, setSettings, settings } = useApp();
  const id = s.quiz!.id;
  const token = s.quiz?.token ?? tokenFor(id);
  const [info, setInfo] = useState<any>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api(`/api/quizzes/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`).then((r) => (r.ok ? setInfo(r.data) : setMissing(true)));
  }, [id]);

  const cfg: Settings = { ...DEFAULT_SETTINGS, timeLimit: settings.timeLimit, soloMode: settings.soloMode, category: 'custom', zone: 'world', quiz: id, qtype: 'mcq', count: 50 };
  const play = (kind: RoomKind) => {
    if (!name.trim()) return;
    setSettings({ ...settings });
    createGame({ kind, settings: cfg, quizToken: !info?.playable && token ? token : undefined }, name, lang).then(fail);
  };

  if (missing) {
    return (
      <div className="quizzes panel">
        <BackLink onClick={() => go('home')} label={t('setup.backHome')} />
        <p className="error">{t('err.quiz.notFound')}</p>
      </div>
    );
  }
  if (!info) return <div className="loading" />;

  return (
    <div className="quizzes panel">
      <BackLink onClick={() => go('home')} label={t('setup.backHome')} />
      <h1 dir="auto">{info.title}</h1>
      <p className="muted">{t('quiz.count', { n: info.count })} · {t('quiz.codeIs', { code: id })}</p>
      {info.owner && <p><StatusBadge status={info.status} /></p>}
      {!info.playable && <p className="notice">{t('quiz.testOnly')}</p>}
      {!name.trim() && (
        <label className="field">
          <span>{t('home.name')}</span>
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </label>
      )}
      {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}
      <div className="how">
        <h2>{t('setup.howToPlay')}</h2>
        <button type="button" className="how-btn primary" disabled={!name.trim()} onClick={() => play('solo')}>
          {info.playable ? t('setup.soloBtn') : t('quiz.test')}<small>{t('solo.training')}</small>
        </button>
        {info.playable && info.owner && info.status === 'pending' && token && (
          <button type="button" className="how-btn" disabled={!name.trim()} onClick={() => createGame({ kind: 'solo', settings: cfg, quizToken: token }, name, lang).then(fail)}>
            {t('quiz.testNew')}<small>{t('quiz.testNewHint')}</small>
          </button>
        )}
        {info.playable && (
          <>
            <button type="button" className="how-btn" disabled={!name.trim()} onClick={() => play('duel')}>{t('setup.duelBtn')}<small>{t('setup.duelHint')}</small></button>
            <button type="button" className="how-btn" disabled={!name.trim()} onClick={() => play('room')}>{t('setup.roomBtn')}<small>{t('mode.title')}</small></button>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ espace de validation (admin)
export function Admin() {
  const { t, go } = useApp();
  const [pwd, setPwd] = useState(() => { try { return sessionStorage.getItem('gq.admin') ?? ''; } catch { return ''; } });
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [open, setOpen] = useState<any>(null);
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const auth = { Authorization: `Bearer ${pwd}` };

  const load = async () => {
    const r = await api('/api/admin/quizzes', { headers: auth });
    if (!r.ok) { setList(null); setErr(r.data?.error ?? 'server'); return; }
    setErr('');
    try { sessionStorage.setItem('gq.admin', pwd); } catch {}
    setList(r.data);
  };
  useEffect(() => { if (pwd) load(); }, []);

  const view = async (id: string) => {
    const r = await api(`/api/admin/quizzes/${id}`, { headers: auth });
    if (!r.ok) return;
    setOpen(r.data);
    setReason('');
    // Photos chargées avec le mot de passe (une balise <img> ne peut pas l'envoyer).
    const out: Record<string, string> = {};
    for (const q of r.data.draft.questions) {
      if (!q.image) continue;
      const res = await fetch(`/api/admin/quizzes/${id}/img/${q.image}`, { headers: auth });
      if (res.ok) out[q.image] = URL.createObjectURL(await res.blob());
    }
    setImgs(out);
    window.scrollTo(0, 0);
  };
  const act = async (action: 'approve' | 'reject' | 'delete') => {
    if (action === 'delete' && !confirm(t('admin.confirmDelete'))) return;
    const path = `/api/admin/quizzes/${open.id}${action === 'delete' ? '' : `/${action}`}`;
    await api(path, { method: action === 'delete' ? 'DELETE' : 'POST', headers: auth, body: action === 'reject' ? JSON.stringify({ reason }) : undefined });
    setOpen(null);
    load();
  };

  if (!list) {
    return (
      <form className="quizzes panel" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <BackLink onClick={() => { history.replaceState(null, '', '/'); go('home'); }} label={t('setup.backHome')} />
        <h1>{t('admin.title')}</h1>
        <label className="field">
          <span>{t('admin.password')}</span>
          <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}
        <div className="actions"><button className="btn primary" disabled={!pwd}>{t('admin.login')}</button></div>
      </form>
    );
  }

  if (open) {
    return (
      <div className="quizzes panel admin-view">
        <BackLink onClick={() => setOpen(null)} label={t('admin.title')} />
        <h1 dir="auto">{open.draft.title}</h1>
        <p><StatusBadge status={open.status} /> <span className="muted">{t('quiz.codeIs', { code: open.id })}</span></p>
        <ol className="admin-questions">
          {open.draft.questions.map((q: any, i: number) => (
            <li key={i}>
              <strong dir="auto">{q.text}</strong>
              {q.image && (imgs[q.image] ? <img src={imgs[q.image]} alt="" /> : <div className="loading" />)}
              <ul>
                {q.answers.map((a: string, k: number) => <li key={k} className={k === q.correct ? 'good-txt' : ''} dir="auto">{k === q.correct ? '✓ ' : ''}{a}</li>)}
              </ul>
            </li>
          ))}
        </ol>
        <label className="field">
          <span>{t('admin.reason')}</span>
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={t('admin.reasonHint')} />
        </label>
        <div className="actions">
          <button type="button" className="text-btn danger" onClick={() => act('delete')}>{t('admin.delete')}</button>
          <button type="button" className="btn ghost" disabled={!reason.trim()} onClick={() => act('reject')}>{t('admin.reject')}</button>
          <button type="button" className="btn primary" onClick={() => act('approve')}>{t('admin.approve')}</button>
        </div>
      </div>
    );
  }

  const shown = list.filter((q) => q.status === filter);
  return (
    <div className="quizzes panel">
      <BackLink onClick={() => { history.replaceState(null, '', '/'); go('home'); }} label={t('setup.backHome')} />
      <h1>{t('admin.title')}</h1>
      <div className="seg">
        {(['pending', 'approved', 'rejected'] as const).map((f) => (
          <button type="button" key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`quiz.status.${f}`)} ({list.filter((q) => q.status === f).length})
          </button>
        ))}
      </div>
      {shown.length === 0 ? <p className="muted">{t('admin.empty')}</p> : (
        <ul className="quiz-list">
          {shown.map((q) => (
            <li key={q.id}>
              <div className="quiz-head"><strong dir="auto">{q.title}</strong><StatusBadge status={q.status} /></div>
              <p className="muted">{t('quiz.count', { n: q.count })} · {t('quiz.codeIs', { code: q.id })} · {new Date(q.updatedAt).toLocaleString()}</p>
              <div className="row-actions"><button type="button" className="btn ghost" onClick={() => view(q.id)}>{t('admin.review')}</button></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
