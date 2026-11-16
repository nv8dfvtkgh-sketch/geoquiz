// « Crée ton quiz » : mes quiz, éditeur, fiche d'un quiz à jouer, et espace de validation (admin).
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type RoomKind, type Settings } from '../../shared/protocol';
import { createGame } from '../net';
import { useApp } from '../state';
import { download, fileSafe, photoKey, quizToRows, readQuizHtml, readDelimited, readTableFile, rowsToQuiz, writeXlsx, type SheetLabels, type SheetQuestion } from '../sheet';

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
interface EditQ { text: string; answers: string[]; correct: number; image?: string | { data: string } | null; preview?: string; wantPhoto?: string }
const emptyQ = (): EditQ => ({ text: '', answers: ['', '', '', ''], correct: 0, image: null });

/** Libellés du modèle Excel, dans la langue du joueur. */
function sheetLabels(t: (k: string, p?: Record<string, string | number>) => string): SheetLabels {
  return {
    title: t('sheet.titleCell'), question: t('sheet.question'), good: t('sheet.good'), bad: t('sheet.bad'), photo: t('sheet.photo'),
    example: [[t('sheet.ex1q'), t('sheet.ex1a'), t('sheet.ex1b'), t('sheet.ex1c'), t('sheet.ex1d'), ''], [t('sheet.ex3q'), t('sheet.ex3a'), t('sheet.ex3b'), t('sheet.ex3c'), '', t('sheet.ex3photo')], [t('sheet.ex2q'), t('sheet.ex2a'), t('sheet.ex2b'), t('sheet.ex2c'), '', '']],
    help: [t('sheet.help1'), t('sheet.help2'), t('sheet.help3'), t('sheet.help5'), t('sheet.help4')],
  };
}
/** Classeur : feuille « Quiz » (à remplir) et feuille « Mode d'emploi ». */
function quizWorkbook(t: (k: string, p?: Record<string, string | number>) => string, title: string, qs: SheetQuestion[]) {
  const l = sheetLabels(t);
  const rows = quizToRows(l, title, qs);
  if (!qs.length) rows.push(...l.example);
  return writeXlsx([
    { name: 'Quiz', rows, widths: [60, 28, 28, 28, 28, 26], bold: [0, 2] },
    { name: t('sheet.helpSheet'), rows: l.help.map((h) => [h]), widths: [110] },
  ]);
}

/** Import et export Excel / CSV / HTML / copier-coller dans l'éditeur. */
function SheetTools({ title, qs, onImport, onPhotos }: { title: string; qs: EditQ[]; onImport: (title: string, qs: SheetQuestion[]) => void | Promise<void>; onPhotos: (files: File[]) => Promise<{ matched: number; added: number; failed: number }> }) {
  const { t, lang } = useApp();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [paste, setPaste] = useState('');
  const apply = (rows: string[][], images?: Map<number, Blob>, ready?: ReturnType<typeof rowsToQuiz>) => {
    const r = ready ?? rowsToQuiz(rows, 50, images);
    if (!r.questions.length) return setMsg({ ok: false, text: t('sheet.none') });
    void onImport(r.title, r.questions);
    const ph = r.questions.filter((q) => q.image).length;
    setMsg({ ok: true, text: t('sheet.done', { n: r.questions.length }) + (ph ? ` ${t('sheet.withPhotos', { n: ph })}` : '') + (r.skipped ? ` ${t('sheet.skipped', { n: r.skipped })}` : '') });
  };
  const pick = async (f?: File) => {
    if (!f) return;
    try {
      // Modèle HTML de Quizellige : les questions et les photos sont dans le fichier.
      if (/\.html?$/i.test(f.name)) { const h = readQuizHtml(await f.text()); if (h) return apply([], undefined, h); }
      const tb = await readTableFile(f); apply(tb.rows, tb.images);
    }
    catch (e) { setMsg({ ok: false, text: t((e as Error).message === 'oldFormat' ? 'sheet.oldFormat' : 'sheet.unreadable') }); }
  };
  const waiting = qs.filter((q) => q.wantPhoto && !q.preview).map((q) => q.wantPhoto!);
  const filled = qs.filter((q) => q.text.trim()).map((q) => {
    const kept = q.answers.map((a, i) => ({ a: a.trim(), i })).filter((x) => x.a);
    return { text: q.text.trim(), answers: kept.map((x) => x.a), correct: Math.max(0, kept.findIndex((x) => x.i === q.correct)) };
  });
  return (
    <details className="sheet-tools">
      <summary>📊 {t('sheet.summary')}</summary>
      <p className="muted small">{t('sheet.intro')}</p>
      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={() => download(quizWorkbook(t, '', []), 'quizellige-modele.xlsx')}>⬇️ {t('sheet.template')}</button>
        <button type="button" className="btn ghost" onClick={async () => {
          // Modèle HTML, dans la langue du joueur.
          const r = await fetch('/quizellige-modele.html');
          if (!r.ok) return;
          const html = (await r.text()).replace('{"v":1,"title":"","lang":"","questions":[]}', JSON.stringify({ v: 1, title: '', lang, questions: [] }));
          download(new Blob([html], { type: 'text/html' }), 'quizellige-modele.html');
        }}>⬇️ {t('sheet.templateHtml')}</button>
        <label className="btn primary sheet-file">
          <input type="file" className="sr" accept=".xlsx,.csv,.txt,.html,.htm" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          ⬆️ {t('sheet.import')}
        </label>
        {filled.length > 0 && <button type="button" className="btn ghost" onClick={() => download(quizWorkbook(t, title, filled), `${fileSafe(title)}.xlsx`)}>{t('sheet.export')}</button>}
      </div>
      <label className="field">
        <span>{t('sheet.paste')}</span>
        <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t('sheet.pasteHint')} dir="auto" />
      </label>
      <button type="button" className="btn ghost" disabled={!paste.trim()} onClick={() => { apply(readDelimited(paste)); setPaste(''); }}>{t('sheet.pasteBtn')}</button>
      <div className="sheet-photos">
        <strong>📷 {t('sheet.photosTitle')}</strong>
        <p className="muted small">{waiting.length ? t('sheet.photosWaiting', { n: waiting.length, names: waiting.slice(0, 4).join(', ') + (waiting.length > 4 ? '…' : '') }) : t('sheet.photosHint')}</p>
        <label className="btn ghost sheet-file">
          <input type="file" className="sr" multiple accept="image/jpeg,image/png,image/webp" onChange={async (e) => {
            const files = Array.from(e.target.files ?? []); e.target.value = '';
            if (!files.length) return;
            const r = await onPhotos(files);
            setMsg({ ok: r.failed === 0, text: t('sheet.photosDone', { n: r.matched, m: r.added }) + (r.failed ? ` ${t('sheet.photosFailed', { n: r.failed })}` : '') });
          }} />
          {t('sheet.photosBtn')}
        </label>
      </div>
      {msg && <p className={msg.ok ? 'record' : 'error'} role="status">{msg.text}</p>}
    </details>
  );
}

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

      <SheetTools title={title} qs={qs} onPhotos={async (files) => {
        // Chaque photo va à la question qui porte son nom (colonne « Photo » du fichier) ;
        // les autres créent une nouvelle question avec la photo, à compléter.
        let next = [...qs];
        let matched = 0, added = 0, failed = 0;
        for (const f of files) {
          let data: string;
          try { data = await shrinkImage(f); } catch { failed++; continue; }
          const k = photoKey(f.name);
          const i = next.findIndex((q) => q.wantPhoto && photoKey(q.wantPhoto) === k && !q.preview);
          if (i >= 0) { next[i] = { ...next[i], image: { data }, preview: data }; matched++; continue; }
          const blank = next.findIndex((q) => !q.text.trim() && !q.preview);
          const q: EditQ = { ...emptyQ(), image: { data }, preview: data };
          if (blank >= 0) next[blank] = q; else if (next.length < 50) next.push(q); else { failed++; continue; }
          added++;
        }
        setQs(next);
        return { matched, added, failed };
      }} onImport={async (tt, list) => {
        if (tt && !title.trim()) setTitle(tt);
        const mine = qs.filter((q) => q.text.trim());
        const added: EditQ[] = [];
        for (const q of list) {
          let image: EditQ['image'] = null, preview: string | undefined;
          // Photo collée dans le fichier Excel, sur la ligne de la question.
          if (q.image) { try { const data = await shrinkImage(new File([q.image], 'photo', { type: q.image.type })); image = { data }; preview = data; } catch { /* trop grande ou illisible */ } }
          added.push({ text: q.text, answers: [...q.answers, '', '', ''].slice(0, 4), correct: q.correct, image, preview, wantPhoto: preview ? undefined : q.photo });
        }
        setQs([...mine, ...added].slice(0, 50).concat(Array.from({ length: Math.max(0, 3 - mine.length - added.length) }, emptyQ)));
      }} />

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
              <small>{q.wantPhoto ? t('sheet.photoExpected', { name: q.wantPhoto }) : t('quiz.imageHint')}</small>
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
  const [tab, setTab] = useState<'quizzes' | 'players' | 'feedback' | 'reports'>('quizzes');
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
        <p><StatusBadge status={open.status} /> <span className="muted">{t('quiz.codeIs', { code: open.id })}</span>
          {' '}<button type="button" className="text-btn" onClick={() => download(quizWorkbook(t, open.draft.title, open.draft.questions), `${open.id}-${fileSafe(open.draft.title)}.xlsx`)}>📊 {t('sheet.export')}</button></p>
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
  /** Tous les quiz créés, dans un seul fichier Excel (une ligne par question). */
  const exportAll = async () => {
    const rows: string[][] = [[t('sheet.code'), t('sheet.titleCell'), t('sheet.status'), t('sheet.question'), t('sheet.good'), `${t('sheet.bad')} 1`, `${t('sheet.bad')} 2`, `${t('sheet.bad')} 3`]];
    for (const q of list) {
      const r = await api(`/api/admin/quizzes/${q.id}`, { headers: auth });
      if (!r.ok) continue;
      for (const x of r.data.draft.questions) rows.push([q.id, r.data.draft.title, t(`quiz.status.${r.data.status}`), x.text, x.answers[x.correct], ...x.answers.filter((_: string, i: number) => i !== x.correct)]);
    }
    download(writeXlsx([{ name: 'Quiz', rows, widths: [9, 30, 12, 60, 26, 26, 26, 26], bold: [0] }]), `quizellige-quiz-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const tabs = (
    <div className="seg admin-tabs">
      <button type="button" aria-pressed={tab === 'quizzes'} onClick={() => setTab('quizzes')}>{t('admin.tabQuizzes')}</button>
      <button type="button" aria-pressed={tab === 'players'} onClick={() => setTab('players')}>{t('admin.tabPlayers')}</button>
      <button type="button" aria-pressed={tab === 'feedback'} onClick={() => setTab('feedback')}>{t('admin.tabFeedback')}</button>
      <button type="button" aria-pressed={tab === 'reports'} onClick={() => setTab('reports')}>{t('admin.tabReports')}</button>
    </div>
  );
  if (tab === 'players' || tab === 'feedback' || tab === 'reports') {
    return (
      <div className="quizzes panel">
        <BackLink onClick={() => { history.replaceState(null, '', '/'); go('home'); }} label={t('setup.backHome')} />
        <h1>{t('admin.title')}</h1>
        {tabs}
        {tab === 'players' ? <PlayersAdmin pwd={pwd} /> : tab === 'reports' ? <ReportsAdmin pwd={pwd} /> : <FeedbackAdmin pwd={pwd} />}
      </div>
    );
  }
  return (
    <div className="quizzes panel">
      <BackLink onClick={() => { history.replaceState(null, '', '/'); go('home'); }} label={t('setup.backHome')} />
      <h1>{t('admin.title')}</h1>
      {tabs}
      {list.length > 0 && <div className="row-actions"><button type="button" className="btn" onClick={exportAll}>📊 {t('admin.exportQuizzes')}</button></div>}
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

// ------------------------------------------------------------------ admin : joueurs
function PlayersAdmin({ pwd }: { pwd: string }) {
  const { t, lang } = useApp();
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const auth = { Authorization: `Bearer ${pwd}` };
  const load = () => api('/api/admin/users', { headers: auth }).then((r) => r.ok && setData(r.data));
  useEffect(() => { load(); }, []);
  const csv = async () => {
    const r = await fetch('/api/admin/users.csv', { headers: auth });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `quizellige-joueurs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const reset = async (u: any) => {
    const r = await api(`/api/admin/users/${u.id}/reset`, { method: 'POST', headers: auth });
    if (r.ok) setMsg(t('admin.resetDone', { pseudo: u.pseudo, password: r.data.password }));
  };
  const remove = async (u: any) => {
    if (!confirm(t('admin.confirmDeleteUser', { pseudo: u.pseudo }))) return;
    await api(`/api/admin/users/${u.id}`, { method: 'DELETE', headers: auth });
    load();
  };
  if (!data) return <div className="loading" />;
  const st = data.stats;
  const users = (data.users as any[]).filter((u) => !q || u.pseudo.toLowerCase().includes(q.toLowerCase()) || u.email.includes(q.toLowerCase()));
  const topCats = Object.entries(st.cats ?? {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6) as [string, number][];
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang);
  return (
    <div className="players-admin">
      <div className="profile-stats">
        <div><strong>{st.users}</strong><span>{t('admin.statUsers')}</span></div>
        <div><strong>{st.active7}</strong><span>{t('admin.statActive')}</span></div>
        <div><strong>{st.games}</strong><span>{t('admin.statGames')}</span></div>
        <div><strong>{st.optin}</strong><span>{t('admin.statOptin')}</span></div>
      </div>
      {topCats.length > 0 && <p className="muted small">{t('admin.topGames')} {topCats.map(([c, n]) => `${t(`cat.${c}`)} (${n})`).join(' · ')}</p>}
      <div className="row-actions">
        <button type="button" className="btn primary" onClick={csv}>{t('admin.exportCsv')}</button>
        <input className="admin-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.search')} aria-label={t('admin.search')} />
      </div>
      <p className="muted small">{t('admin.csvNote')}</p>
      {msg && <p className="notice" role="status">{msg}</p>}
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>{t('account.pseudo')}</th><th>{t('account.email')}</th><th>{t('admin.colAge')}</th><th>{t('admin.colLevel')}</th><th>{t('admin.colGames')}</th><th>{t('admin.colSince')}</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td dir="auto">{u.avatar} {u.pseudo} {u.country ? <small className="muted">{u.country}</small> : null}</td>
                <td>{u.email || '—'}{u.optin ? ' ✉️' : ''}</td>
                <td>{t(`account.age.${u.age}`)}</td>
                <td>{u.level}</td>
                <td>{u.games}</td>
                <td>{date(u.createdAt)}</td>
                <td className="nowrap">
                  <button type="button" className="text-btn" onClick={() => reset(u)}>{t('admin.reset')}</button>
                  <button type="button" className="text-btn danger" onClick={() => remove(u)}>{t('admin.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ admin : questions signalées
function ReportsAdmin({ pwd }: { pwd: string }) {
  const { t, lang } = useApp();
  const [data, setData] = useState<any>(null);
  const auth = { Authorization: `Bearer ${pwd}` };
  const load = () => api('/api/admin/reports', { headers: auth } as never).then((r) => r.ok && setData(r.data));
  useEffect(() => { load(); }, []);
  const remove = async (id: string) => {
    await api(`/api/admin/reports/${id}`, { method: 'DELETE', headers: auth } as never);
    load();
  };
  if (!data) return <div className="loading" />;
  return (
    <div className="players-admin">
      <div className="profile-stats"><div><strong>{data.count}</strong><span>{t('admin.reportsCount')}</span></div></div>
      {data.items.length === 0 ? <p className="muted">{t('admin.reportsEmpty')}</p> : (
        <ul className="fb-list">
          {data.items.map((r: any) => (
            <li key={r.id}>
              <div className="fb-row">
                <span className="fb-face" aria-hidden="true">⚑</span>
                <span className="muted small">{new Date(r.at).toLocaleString(lang)} · {r.game ? t(`cat.${r.game}`) : ''} · {r.target} · {r.lang}{r.pseudo ? ` · ${r.pseudo}` : ''}</span>
                <button type="button" className="text-btn" onClick={() => remove(r.id)}>{t('admin.reportDone')}</button>
              </div>
              <p className="fb-chips"><span>{t(`report.r.${r.reason}`)}</span></p>
              <p className="fb-comment" dir="auto">{r.question}{r.question ? ' → ' : ''}<strong>{r.answer}</strong></p>
              {r.comment && <p className="fb-comment" dir="auto">💬 {r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ admin : avis des joueurs
function FeedbackAdmin({ pwd }: { pwd: string }) {
  const { t, lang } = useApp();
  const [data, setData] = useState<any>(null);
  const [only, setOnly] = useState(0);
  const auth = { Authorization: `Bearer ${pwd}` };
  const load = () => api('/api/admin/feedback', { headers: auth }).then((r) => r.ok && setData(r.data));
  useEffect(() => { load(); }, []);
  const csv = async () => {
    const r = await fetch('/api/admin/feedback.csv', { headers: auth });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `quizellige-avis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const remove = async (id: string) => {
    if (!confirm(t('admin.confirmDeleteFb'))) return;
    await api(`/api/admin/feedback/${id}`, { method: 'DELETE', headers: auth });
    load();
  };
  if (!data) return <div className="loading" />;
  const faces = ['😞', '😕', '😐', '🙂', '🤩'];
  const items = (data.items as any[]).filter((f) => !only || f.rating === only);
  const tags = Object.entries(data.tags as Record<string, number>).sort((a, b) => b[1] - a[1]);
  return (
    <div className="players-admin">
      <div className="profile-stats">
        <div><strong>{data.count}</strong><span>{t('admin.fbCount')}</span></div>
        <div><strong>{data.avg || '–'}</strong><span>{t('admin.fbAvg')}</span></div>
      </div>
      {tags.length > 0 && <p className="muted small">{tags.map(([k, n]) => `${t(`fb.tag.${k}`)} (${n})`).join(' · ')}</p>}
      <div className="row-actions">
        <button type="button" className="btn primary" onClick={csv}>{t('admin.exportCsv')}</button>
        <div className="seg">
          <button type="button" aria-pressed={!only} onClick={() => setOnly(0)}>{t('admin.fbAll')}</button>
          {faces.map((f, i) => <button type="button" key={i} aria-pressed={only === i + 1} onClick={() => setOnly(i + 1)}>{f}</button>)}
        </div>
      </div>
      {items.length === 0 ? <p className="muted">{t('admin.fbEmpty')}</p> : (
        <ul className="fb-list">
          {items.map((f) => (
            <li key={f.id}>
              <div className="fb-row">
                <span className="fb-face" aria-label={`${f.rating}/5`}>{faces[f.rating - 1]}</span>
                <span className="muted small">
                  {new Date(f.at).toLocaleString(lang)} · {f.pseudo ? `${f.pseudo} (${t(`account.age.${f.age}`)})` : t('admin.fbGuest')}
                  {f.game ? ` · ${t(`cat.${f.game}`)}` : ''} · {t('admin.fbGames', { n: f.games })} · {f.lang} · {f.look} · {f.screen}
                </span>
                <button type="button" className="text-btn danger" onClick={() => remove(f.id)}>{t('admin.delete')}</button>
              </div>
              {f.tags.length > 0 && <p className="fb-chips">{f.tags.map((x: string) => <span key={x}>{t(`fb.tag.${x}`)}</span>)}</p>}
              {f.comment && <p className="fb-comment" dir="auto">{f.comment}</p>}
              <p className="muted tiny">{f.device}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
