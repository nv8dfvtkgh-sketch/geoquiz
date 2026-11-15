// Challenge Trivia : écran d'accueil (couronnes, règles), roue du thème avant chaque question,
// barre de jeu (thème, niveau, série ×2, jokers 50/50 et ×2). Les questions et les points sont
// gérés par le serveur (triviaQuestions, Room.joker) ; les couronnes sont gardées sur l'appareil.
import { useEffect, useState } from 'react';
import type { QuestionMsg } from '../../shared/protocol';
import { createGame } from '../net';
import { sfx } from '../sound';
import { useApp } from '../state';
import { PuzzleBack } from './Puzzles';

export const THEMES = ['geo', 'hist', 'sci', 'sport', 'screens', 'arts'] as const;
const COLORS: Record<string, string> = { geo: '#0A6CD8', hist: '#B5420C', sci: '#15803D', sport: '#7C3AED', screens: '#BE185D', arts: '#A16207' };
const ICONS: Record<string, string> = { geo: '🌍', hist: '🏛️', sci: '🔬', sport: '🏅', screens: '🎬', arts: '🎨' };

const KEY = 'gq.crowns';
export function loadCrowns(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}
/** Couronne : bonne réponse à une question difficile du thème. */
export function winCrown(theme: string): boolean {
  const c = loadCrowns();
  if (c[theme]) return false;
  c[theme] = true;
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignoré */ }
  return true;
}

export function TriviaScreen() {
  const { t, lang, name, fail } = useApp();
  const crowns = loadCrowns();
  const n = THEMES.filter((x) => crowns[x]).length;
  const start = (kind: 'solo' | 'room') => createGame({ kind, settings: { category: 'trivia', zone: 'world', difficulty: 'medium', qtype: 'mcq', count: 12, timeLimit: 20 } as any }, name, lang).then(fail);
  return (
    <div className="trivia-home panel">
      <PuzzleBack to="home" />
      <h1>{t('cat.trivia')}</h1>
      <p className="muted">{t('trivia.pitch')}</p>
      <section className="bac-box">
        <div className="trivia-crowns-head"><strong>{t('trivia.crowns')}</strong><span className="muted">{t('trivia.crownsOf', { n, total: THEMES.length })}</span></div>
        <div className="trivia-crowns">
          {THEMES.map((th) => (
            <div key={th} className={crowns[th] ? 'won' : ''} style={{ '--c': COLORS[th] } as React.CSSProperties}>
              <span aria-hidden="true">{crowns[th] ? '👑' : ICONS[th]}</span>
              <strong>{t(`trivia.theme.${th}`)}</strong>
              <small>{crowns[th] ? t('trivia.crownWon') : t('trivia.crownTodo')}</small>
            </div>
          ))}
        </div>
        <p className="muted small">{t('trivia.crownHow')}</p>
      </section>
      <ul className="trivia-rules">
        <li>{t('trivia.rule.levels')}</li>
        <li>{t('trivia.rule.jokers')}</li>
        <li>{t('trivia.rule.streak')}</li>
      </ul>
      <div className="bac-go">
        <button type="button" className="btn primary" onClick={() => start('solo')}>{t('trivia.solo')}</button>
        <button type="button" className="btn ghost" onClick={() => start('room')}>{t('trivia.room')}</button>
      </div>
    </div>
  );
}

/** Roue : tourne puis s'arrête sur le thème de la question (1,3 s), au début de chaque question. */
export function TriviaWheel({ q }: { q: QuestionMsg }) {
  const { t } = useApp();
  const [show, setShow] = useState(true);
  const [label, setLabel] = useState<string>(THEMES[0]);
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    if (!q.theme || (q.remaining !== null && q.timeLimit !== null && q.timeLimit - q.remaining > 1500)) { setShow(false); return; }
    setShow(true);
    setStopped(false);
    let i = 0, delay = 70;
    let id: ReturnType<typeof setTimeout>;
    const step = () => {
      i++;
      if (delay > 230) { setLabel(q.theme!); setStopped(true); sfx.good(); id = setTimeout(() => setShow(false), 650); return; }
      setLabel(THEMES[i % THEMES.length]);
      sfx.tick();
      delay *= 1.22;
      id = setTimeout(step, delay);
    };
    id = setTimeout(step, delay);
    return () => clearTimeout(id);
  }, [q.index]);
  if (!show || !q.theme) return null;
  return (
    <div className="trivia-wheel" role="status" aria-live="polite">
      <div className="tw-disc" style={{ '--c': COLORS[label] } as React.CSSProperties}>
        <span aria-hidden="true">{ICONS[label]}</span>
        <strong>{t(`trivia.theme.${label}`)}</strong>
      </div>
      <p>{stopped ? t(`level.q.${q.level ?? 'easy'}`) : t('trivia.spinning')}</p>
    </div>
  );
}

/** Barre au-dessus de la question : thème, niveau, série, jokers. */
export function TriviaBar({ q, locked }: { q: QuestionMsg; locked: boolean }) {
  const { t, s, send } = useApp();
  const me = s.room?.players.find((p) => p.id === s.you);
  const j = s.jokers;
  const left = j?.left ?? { fifty: true, double: true };
  const here = j?.q === q.index ? j : undefined;
  const streak = me?.streak ?? 0;
  const few = (q.options?.length ?? 0) < 3;
  return (
    <div className="trivia-bar">
      <div className="tb-info">
        {q.theme && <span className="tb-theme" style={{ '--c': COLORS[q.theme] } as React.CSSProperties}>{ICONS[q.theme]} {t(`trivia.theme.${q.theme}`)}</span>}
        {q.level && <span className={`tb-level lv-${q.level}`}>{t(`diff.${q.level}`)}</span>}
        {streak >= 3 && <span className="tb-streak">{t('trivia.streakOn', { n: streak })}</span>}
        {here?.double && <span className="tb-streak">{t('trivia.doubleOn')}</span>}
      </div>
      <div className="tb-jokers">
        <button type="button" className="btn ghost" disabled={!left.fifty || locked || few} onClick={() => send({ t: 'joker', kind: 'fifty' })}>{left.fifty ? '50/50' : t('trivia.used')}</button>
        <button type="button" className="btn ghost" disabled={!left.double || locked} onClick={() => send({ t: 'joker', kind: 'double' })}>{left.double ? t('trivia.double') : t('trivia.used')}</button>
      </div>
    </div>
  );
}
