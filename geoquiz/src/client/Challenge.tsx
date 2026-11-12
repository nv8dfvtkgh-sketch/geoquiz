// Défi entre amis : partager un lien après une partie solo ; l'ami joue les mêmes questions.
import { useEffect, useState } from 'react';
import type { ChallengeEntry, ChallengeView } from '../shared/protocol';
import { formatTime } from './i18n';
import { createGame } from './net';
import { useApp } from './state';

const NOT_CHALLENGEABLE = new Set(['daily', 'custom']);

function Board({ results, me }: { results: ChallengeEntry[]; me?: string }) {
  const { t } = useApp();
  return (
    <ol className="lb ch-board">
      {results.map((r, i) => (
        <li key={`${r.name}-${r.at}`} className={me && r.name === me ? 'me' : ''}>
          <span className="lb-rank">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
          <span className="lb-name" dir="auto">{r.name}</span>
          <span className="lb-xp">{t('ch.score', { c: r.correct, n: r.total })} · {formatTime(r.timeMs)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Fin de partie solo : « Défier un ami » puis partage (WhatsApp, autre appli, lien). */
export function ChallengeShare() {
  const { t, s, send, name } = useApp();
  const [asked, setAsked] = useState(false);
  const [copied, setCopied] = useState(false);
  const room = s.room!;
  if (room.kind !== 'solo' || NOT_CHALLENGEABLE.has(room.settings.category)) return null;
  const ch = s.challenge;
  const f = s.finished!;
  const score = `${f.solo?.correct ?? 0}/${f.solo?.total ?? 0}`;
  const url = ch ? `${location.origin}/defi/${ch.code}` : '';
  const text = ch ? t('ch.shareText', { score, game: t(`cat.${room.settings.category}`) }) : '';
  const share = async () => {
    try { await navigator.share({ text, url }); } catch { /* annulé */ }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text}\n${url}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* refusé */ }
  };
  return (
    <section className="challenge-share">
      {ch?.results && (
        <>
          <h2>{t('ch.boardTitle', { name: ch.by ?? '' })}</h2>
          <Board results={ch.results} me={name} />
        </>
      )}
      {!ch?.code ? (
        <button type="button" className="btn primary ch-btn" disabled={asked && !ch} onClick={() => { setAsked(true); send({ t: 'challenge' }); }}>⚔️ {t('ch.challengeFriend')}</button>
      ) : (
        <div className="ch-links">
          <p className="muted">{t('ch.sendLink')}</p>
          <div className="row-actions">
            <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noopener">WhatsApp</a>
            {typeof navigator.share === 'function' && <button type="button" className="btn ghost" onClick={share}>{t('ch.otherApp')}</button>}
            <button type="button" className="btn ghost" onClick={copy}>{copied ? t('lobby.copied') : t('lobby.copy')}</button>
          </div>
          <p className="link">{url.replace(/^https?:\/\//, '')}</p>
        </div>
      )}
    </section>
  );
}

/** Page ouverte par le lien /defi/CODE. */
export function ChallengeScreen() {
  const { t, s, go, name, setName, lang, fail } = useApp();
  const [view, setView] = useState<ChallengeView | null>(null);
  const [missing, setMissing] = useState(false);
  const [pseudo, setPseudo] = useState(name);
  const code = s.challengeCode ?? '';
  useEffect(() => {
    fetch(`/api/challenge/${code}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setView).catch(() => setMissing(true));
  }, [code]);
  const home = () => { history.replaceState(null, '', '/'); go('home'); };
  const play = () => {
    if (!view || !pseudo.trim()) return;
    setName(pseudo.trim());
    createGame({ kind: 'solo', settings: view.settings, challenge: view.code }, pseudo.trim(), lang).then(fail);
  };
  if (missing) return (
    <div className="panel challenge-page"><h1>{t('ch.missing')}</h1><button type="button" className="btn primary" onClick={home}>{t('setup.backHome')}</button></div>
  );
  if (!view) return <div className="loading" />;
  const first = view.results.find((r) => r.name === view.by) ?? view.results[0];
  return (
    <div className="panel challenge-page">
      <p className="ch-swords" aria-hidden="true">⚔️</p>
      <h1 dir="auto">{t('ch.invite', { name: view.by })}</h1>
      <p className="ch-game">{t(`cat.${view.settings.category}`)} · {t(`diff.${view.settings.difficulty}`)}</p>
      {first && <p className="ch-target">{t('ch.toBeat', { c: first.correct, n: first.total, time: formatTime(first.timeMs) })}</p>}
      <label className="field">
        <span>{t('home.yourName')}</span>
        <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={20} dir="auto" />
      </label>
      <button type="button" className="btn primary big" disabled={!pseudo.trim()} onClick={play}>{t('ch.accept')}</button>
      {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}
      {view.results.length > 1 && <><h2>{t('ch.already')}</h2><Board results={view.results} /></>}
      <button type="button" className="text-btn" onClick={home}>{t('ch.discover')}</button>
    </div>
  );
}
