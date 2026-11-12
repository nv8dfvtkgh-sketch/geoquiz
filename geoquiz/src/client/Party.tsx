// Multijoueur plus vivant : réactions en direct, coffres surprises, mise finale, choix d'équipe.
import { useEffect, useRef, useState } from 'react';
import { REACTIONS, type ChestResult } from '../shared/protocol';
import { useApp } from './state';
import { sfx } from './sound';

// ---------------------------------------------------------------- réactions
/** Boutons d'emojis (liste fixe, pas de texte libre). */
export function ReactionBar() {
  const { t, send, s } = useApp();
  const [cool, setCool] = useState(false);
  if (!s.room || s.room.kind === 'solo') return null;
  const me = s.room.players.some((p) => p.id === s.you);
  if (!me) return null;
  return (
    <div className="react-bar" role="group" aria-label={t('react.label')}>
      {REACTIONS.map((e, i) => (
        <button type="button" key={e} disabled={cool} aria-label={e} onClick={() => { send({ t: 'react', e: i }); setCool(true); setTimeout(() => setCool(false), 750); }}>{e}</button>
      ))}
    </div>
  );
}

interface Floating { id: number; e: string; name: string; x: number }
/** Emojis qui s'envolent sur tous les écrans (plus grands sur l'écran de l'animateur). */
export function ReactionLayer({ big = false }: { big?: boolean }) {
  const [list, setList] = useState<Floating[]>([]);
  const n = useRef(0);
  useEffect(() => {
    const on = (ev: Event) => {
      const m = (ev as CustomEvent).detail as { e: number; name: string };
      const e = REACTIONS[m.e];
      if (!e) return;
      const id = ++n.current;
      setList((l) => [...l.slice(-24), { id, e, name: m.name, x: 8 + Math.random() * 84 }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 2600);
    };
    window.addEventListener('gq:react', on);
    return () => window.removeEventListener('gq:react', on);
  }, []);
  return (
    <div className={`react-layer ${big ? 'big' : ''}`} aria-hidden="true">
      {list.map((f) => (
        <span key={f.id} style={{ left: `${f.x}%` }}><b>{f.e}</b><small dir="auto">{f.name}</small></span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- coffres surprises
export const CHEST_EMOJI: Record<ChestResult['kind'], string> = { plus: '💰', small: '🪙', double: '✖️2', steal: '🦝', shield: '🛡️', swap: '🔄', blocked: '🛡️' };
export function chestText(t: (k: string, p?: Record<string, string | number>) => string, c: ChestResult) {
  return t(`chest.${c.kind}`, { n: c.amount, name: c.from ?? '' });
}

/** Mon coffre : trois coffres fermés, on en touche un (ou il s'ouvre tout seul). */
export function ChestCard({ chest, q }: { chest: ChestResult; q: number }) {
  const { t } = useApp();
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { setOpen(null); const id = setTimeout(() => setOpen((o) => o ?? 1), 1800); return () => clearTimeout(id); }, [q]);
  useEffect(() => { if (open !== null) sfx.good(); }, [open]);
  return (
    <div className="chest-card">
      <p className="chest-title">{open === null ? t('chest.pick') : chestText(t, chest)}</p>
      <div className="chest-row">
        {[0, 1, 2].map((i) => (
          <button type="button" key={i} disabled={open !== null} className={open === i ? 'open' : open !== null ? 'dim' : ''} onClick={() => setOpen(i)} aria-label={t('chest.open')}>
            {open === i ? <span className="chest-prize">{CHEST_EMOJI[chest.kind]}</span> : <span aria-hidden="true">🎁</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Les coffres des autres joueurs (les plus marquants : vols, échanges). */
export function ChestNews({ chests, you }: { chests: Record<string, ChestResult>; you?: string }) {
  const { t, s } = useApp();
  const names = Object.fromEntries((s.room?.players ?? []).map((p) => [p.id, p.name]));
  const news = Object.entries(chests).filter(([id, c]) => id !== you && (c.kind === 'steal' || c.kind === 'swap' || c.kind === 'blocked')).slice(0, 3);
  if (!news.length) return null;
  return (
    <ul className="chest-news">
      {news.map(([id, c]) => <li key={id} dir="auto">{CHEST_EMOJI[c.kind]} {t(`chestNews.${c.kind}`, { who: names[id] ?? '?', name: c.from ?? '', n: c.amount })}</li>)}
    </ul>
  );
}

// ---------------------------------------------------------------- mise finale
export function WagerPanel() {
  const { t, s, send } = useApp();
  const w = s.wager!;
  const me = s.room?.players.find((p) => p.id === s.you);
  const presenter = s.isHost && !s.room?.hostPlays;
  const [left, setLeft] = useState(Math.ceil((w.until - performance.now()) / 1000));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((w.until - performance.now()) / 1000))), 250);
    return () => clearInterval(id);
  }, [w.until]);
  const mine = s.you ? w.bets?.[s.you] : undefined;
  const score = me?.score ?? 0;
  return (
    <div className="wager panel">
      <p className="wager-kicker">{t('wager.kicker')}</p>
      <h1>{t('wager.title')}</h1>
      <p className="wager-theme">{t('wager.theme')} <strong>{t(`cat.${w.category}`)}</strong></p>
      <p className="wager-clock" aria-live="polite">{left}</p>
      {presenter || !me ? <p className="muted">{t('wager.waiting')}</p> : (
        <>
          <p className="muted">{t('wager.hint', { n: score })}</p>
          <div className="wager-picks">
            {[0, 25, 50, 100].map((pct) => (
              <button type="button" key={pct} className={mine === pct ? 'on' : ''} disabled={mine !== undefined} onClick={() => send({ t: 'bet', q: w.q, pct })}>
                <strong>{pct === 100 ? t('wager.all') : `${pct} %`}</strong>
                <small>{Math.round((score * pct) / 100).toLocaleString()} pts</small>
              </button>
            ))}
          </div>
          {mine !== undefined && <p className="record">{t('wager.done')}</p>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- équipes
export const TEAM_EMOJI = ['🏔️', '🐪', '🌊', '🌋'];
/** Salle d'attente, mode Équipes : chacun rejoint l'équipe de son choix. */
export function TeamPicker() {
  const { t, s, send } = useApp();
  const room = s.room!;
  const n = room.settings.teams ?? 2;
  const me = room.players.find((p) => p.id === s.you);
  return (
    <div className="team-pick">
      <p className="muted">{me ? t('team.pickHint') : t('team.pickHost')}</p>
      <div className="team-pick-grid">
        {Array.from({ length: n }, (_, i) => {
          const members = room.players.filter((p) => p.team === i);
          return (
            <button type="button" key={i} className={`team-box t${i} ${me?.team === i ? 'on' : ''}`} disabled={!me} onClick={() => send({ t: 'team', team: i })}>
              <strong><span aria-hidden="true">{TEAM_EMOJI[i]}</span> {t(`team.${i}`)}</strong>
              <small>{members.length ? members.map((p) => p.name).join(', ') : t('team.empty')}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
