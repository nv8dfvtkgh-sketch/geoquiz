// Avis des joueurs : proposé une fois après la 3ᵉ partie, et toujours accessible par un lien.
import { useEffect, useState } from 'react';
import { api } from './account';
import { useApp } from './state';

const LIKES = ['fun', 'learn', 'design', 'multi', 'kids'];
const ISSUES = ['bug', 'hard', 'easy', 'unclear', 'slow', 'more'];
const FACES = ['😞', '😕', '😐', '🙂', '🤩'];
const KEY = 'gq.fb';
const ASK_AT = 3;

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } };

/** Compte une partie terminée (une fois par fin de partie). */
export function countGame(): number {
  const n = Number(read('gq.games') || 0) + 1;
  write('gq.games', String(n));
  return n;
}
/** Faut-il proposer l'avis ? Une fois à la 3ᵉ partie ; « Plus tard » repousse de 5 parties. */
export function shouldAsk(): boolean {
  const state = read(KEY);
  if (state === 'sent' || state === 'never') return false;
  const games = Number(read('gq.games') || 0);
  return games >= (Number(state) || ASK_AT);
}

export function FeedbackForm({ game, onDone, onLater }: { game?: string; onDone: () => void; onLater?: () => void }) {
  const { t, lang, look, auth } = useApp();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'edit' | 'sending' | 'sent' | 'error'>('edit');
  const toggle = (x: string) => setTags((v) => (v.includes(x) ? v.filter((y) => y !== x) : [...v, x]));
  const send = async () => {
    setState('sending');
    const r = await api('/api/feedback', {
      method: 'POST', token: auth,
      body: { rating, tags, comment, game, games: Number(read('gq.games') || 0), lang, look, device: navigator.userAgent.slice(0, 160), screen: `${screen.width}×${screen.height}` },
    });
    if (r.ok) { write(KEY, 'sent'); setState('sent'); setTimeout(onDone, 1800); } else setState('error');
  };
  if (state === 'sent') return <div className="feedback done" role="status"><span aria-hidden="true">💛</span> {t('fb.thanks')}</div>;
  return (
    <div className="feedback">
      <h2>{t('fb.title')}</h2>
      <p className="muted">{t('fb.ask')}</p>
      <div className="fb-faces" role="radiogroup" aria-label={t('fb.title')}>
        {FACES.map((f, i) => (
          <button type="button" key={i} role="radio" aria-checked={rating === i + 1} aria-label={t(`fb.r${i + 1}`)} className={rating === i + 1 ? 'on' : ''} onClick={() => setRating(i + 1)}>{f}</button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <p className="fb-label">{t('fb.liked')}</p>
          <div className="fb-tags">{LIKES.map((x) => <button type="button" key={x} aria-pressed={tags.includes(x)} onClick={() => toggle(x)}>{t(`fb.tag.${x}`)}</button>)}</div>
          <p className="fb-label">{t('fb.issues')}</p>
          <div className="fb-tags">{ISSUES.map((x) => <button type="button" key={x} aria-pressed={tags.includes(x)} onClick={() => toggle(x)}>{t(`fb.tag.${x}`)}</button>)}</div>
          <label className="field">
            <span>{t('fb.comment')}</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000} placeholder={t('fb.placeholder')} dir="auto" />
          </label>
          <p className="hint">{t('fb.privacy')}</p>
        </>
      )}
      {state === 'error' && <p className="error" role="alert">{t('fb.error')}</p>}
      <div className="actions">
        {onLater && <button type="button" className="btn ghost" onClick={onLater}>{t('fb.later')}</button>}
        <button type="button" className="btn primary" disabled={!rating || state === 'sending'} onClick={send}>{t('fb.send')}</button>
      </div>
    </div>
  );
}

/** Carte affichée en fin de partie, une seule fois (3ᵉ partie). */
export function FeedbackPrompt({ game }: { game?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(shouldAsk()); }, []);
  if (!open) return null;
  const later = () => { write(KEY, String(Number(read('gq.games') || 0) + 5)); setOpen(false); };
  return <FeedbackForm game={game} onDone={() => setOpen(false)} onLater={later} />;
}

/** Lien « Donner mon avis » qui ouvre le formulaire par-dessus la page. */
export function FeedbackLink() {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-btn feedback-link" onClick={() => setOpen(true)}>💬 {t('fb.link')}</button>
      {open && (
        <div className="fb-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="fb-sheet">
            <button type="button" className="fb-close" aria-label={t('fb.close')} onClick={() => setOpen(false)}>×</button>
            <FeedbackForm onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
