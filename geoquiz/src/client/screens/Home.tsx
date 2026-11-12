import { useEffect, useMemo, useState } from 'react';
import { FAMILIES, findGame, Icon, type GameDef } from '../games';
import { createGame, joinGame, lastGame } from '../net';
import { HomeworkCard } from './School';
import { useEvents } from '../events';
import { cameFrom } from './Puzzles';

import { useApp } from '../state';
import { Stars } from './Account';
import { starsOf } from '../account';


/** Événement du moment (quiz spécial, badge à gagner). */
function EventCard({ onOpen }: { onOpen: () => void }) {
  const { t, lang } = useApp();
  const ev = useEvents()?.active;
  if (!ev) return null;
  const end = new Date(ev.end).toLocaleDateString(lang === 'ar' ? 'ar-MA' : lang, { day: 'numeric', month: 'long' });
  return (
    <button type="button" className="event-card" onClick={onOpen}>
      <span className="event-emoji" aria-hidden="true">{ev.emoji}</span>
      <span><strong>{ev.names[lang]}</strong><small>{t('event.until', { date: end })}</small></span>
      <span aria-hidden="true">›</span>
    </button>
  );
}
export function Home() {
  const { look } = useApp();
  return look ? <Games /> : <Welcome />;
}

/** Premier passage : on choisit son âge (pour le style) et on joue tout de suite ; le compte vient après. */
function Welcome() {
  const { t, setLook, go, name, setName } = useApp();
  const pick = (age: 'u13' | '13-17' | '18+') => {
    try { localStorage.setItem('gq.age', age); } catch { /* ignoré */ }
    // Un pseudo d'invité pour jouer tout de suite (modifiable, et remplacé par le compte).
    if (!name.trim()) setName(t('home.guestName', { n: 100 + Math.floor(Math.random() * 900) }));
    setLook(age === 'u13' ? 'kids' : 'classic');
    window.scrollTo(0, 0);
  };
  return (
    <div className="welcome">
      <div className="welcome-head">
        <img className="welcome-logo" src="/logo.svg" width="88" height="88" alt="" />
        <h1>{t('welcome.title')}</h1>
        <p>{t('welcome.pitch')}</p>
      </div>
      <h2 className="welcome-q">{t('welcome.age')}</h2>
      <div className="age-picks">
        <button type="button" onClick={() => pick('u13')}><span aria-hidden="true">🧒</span>{t('account.age.u13')}</button>
        <button type="button" onClick={() => pick('13-17')}><span aria-hidden="true">🧑</span>{t('account.age.13-17')}</button>
        <button type="button" onClick={() => pick('18+')}><span aria-hidden="true">🧑‍💼</span>{t('account.age.18+')}</button>
      </div>
      <p className="muted welcome-later">{t('welcome.already')} <button type="button" className="text-btn" onClick={() => { setLook('classic'); go('signin'); }}>{t('welcome.signin')}</button></p>
    </div>
  );
}

/** Pastille « Nouveau » : seulement pendant les 14 jours qui suivent la sortie. */
const FRESH_UNTIL = Date.parse('2026-11-26');
const isFresh = (g: GameDef) => !!g.fresh && Date.now() < FRESH_UNTIL;
const fold = (x: string) => x.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

function Games() {
  const { t, s, name, setName, lang, fail, openGame, openQuiz, me, go, catalog } = useApp();
  const [code, setCode] = useState(s.joinCode ?? '');
  const [joinOpen, setJoinOpen] = useState(!!s.joinCode);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const last = useMemo(() => lastGame(), []);
  // Ancien joueur sans pseudo : un pseudo d'invité, modifiable dans les réglages.
  useEffect(() => { if (!name.trim()) setName(t('home.guestName', { n: 100 + Math.floor(Math.random() * 900) })); }, []);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) joinGame(code, name, lang).then(fail);
  };
  const pick = (g: GameDef) => {
    if (g.soon) return;
    if (g.screen) { cameFrom('home'); go(g.screen); window.scrollTo(0, 0); return; }
    openGame(g.id);
  };
  const lastDef = last ? findGame(last.category) : undefined;
  const zone = last && catalog?.zones.find((z) => z.id === last.zone);
  const zoneLabel = !zone || zone.id === 'world' ? '' : zone.kind === 'regions' ? zone.names?.[lang] ?? '' : t(`zone.${zone.id.replace(':', '.')}`);
  const families = FAMILIES.filter((f) => f.id !== 'today');
  const q = fold(query.trim());
  const found = q ? families.flatMap((f) => f.games.filter((g) => !g.soon && fold(`${t(`cat.${g.id}`)} ${t(`game.${g.id}`)}`).includes(q)).map((g) => ({ g, tint: f.tint }))) : [];

  const tile = (g: GameDef, tint: string) => (
    <button type="button" key={g.id} className={`tile ${tint} ${g.soon ? 'soon' : ''}`} onClick={() => pick(g)} aria-disabled={g.soon || undefined} title={t(`game.${g.id}`)}>
      <Icon name={g.icon} />
      <span className="tile-name">{t(`cat.${g.id}`)}</span>
      {g.soon && <span className="tile-soon">{t('home.soon')}</span>}
      {isFresh(g) && !g.soon && !starsOf(me, g.id)?.some(Boolean) && <span className="tile-dot" aria-label={t('home.new')} />}
      {!g.soon && <Stars list={starsOf(me, g.id)} />}
    </button>
  );

  return (
    <div className="home home2">
      {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}

      {last && lastDef ? (
        <button type="button" className="continue-card" onClick={() => createGame({ kind: 'solo', settings: last }, name, lang).then(fail)}>
          <span className="continue-ic"><Icon name={lastDef.icon} size={26} /></span>
          <span className="continue-text"><strong>{t('home.continue')}</strong><small>{[t(`cat.${last.category}`), zoneLabel, t(`diff.${last.difficulty}`)].filter(Boolean).join(' · ')}</small></span>
          <span className="continue-go">{t('home.play')}</span>
        </button>
      ) : (
        <button type="button" className="continue-card daily" onClick={() => openGame('daily')}>
          <span className="continue-ic"><Icon name="calendar" size={26} /></span>
          <span className="continue-text"><strong>{t('cat.daily')}</strong><small>{t('game.daily')}</small></span>
          <span className="continue-go">{t('home.play')}</span>
        </button>
      )}

      <div className="quick-row">
        <button type="button" className={`quick ${joinOpen ? 'on' : ''}`} onClick={() => setJoinOpen(!joinOpen)}><span aria-hidden="true">🔗</span><span><strong>{t('home.joinShort')}</strong><small>{t('home.joinHint')}</small></span></button>
        <button type="button" className="quick" onClick={() => (last ? createGame({ kind: 'duel', settings: last }, name, lang).then(fail) : openGame('flags'))}><span aria-hidden="true">⚔️</span><span><strong>{t('home.duelShort')}</strong><small>{last ? t(`cat.${last.category}`) : t('home.duelHint')}</small></span></button>
      </div>
      {joinOpen && (
        <form className="join" onSubmit={join}>
          <label htmlFor="join-code" className="sr">{t('home.code')}</label>
          <input id="join-code" className="code-input" value={code} autoFocus
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABC234" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          <button className="btn primary" disabled={code.length !== 6}>{t('home.joinBtn')}</button>
        </form>
      )}

      <HomeworkCard />

      <label className="search">
        <span className="sr">{t('home.search')}</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></g></svg>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('home.searchPlaceholder')} />
      </label>

      {q ? (
        found.length ? <div className="tiles">{found.map(({ g, tint }) => tile(g, tint))}</div> : <p className="muted">{t('home.noResult')}</p>
      ) : (
        <>
          {families.map((f) => {
            const games = f.games;
            const expanded = !!open[f.id];
            return (
              <section key={f.id} className="family row-family">
                <div className="family-head">
                  <h2>{t(`family.${f.id}`)}</h2>
                  {games.length > 2 && <button type="button" className="text-btn" onClick={() => setOpen({ ...open, [f.id]: !expanded })}>{expanded ? t('home.less') : t('home.seeAll', { n: games.length })}</button>}
                </div>
                <div className={expanded ? 'tiles' : 'tiles-row'}>
                  {f.id === 'geo' && (
                    <button type="button" className="tile hub-tile" onClick={() => { go('geo'); window.scrollTo(0, 0); }} title={t('hub.cta')}>
                      <span className="hub-art" aria-hidden="true">🗺️</span>
                      <span className="tile-name">{t('home.hubTile')}</span>
                    </button>
                  )}
                  {games.map((g) => tile(g, f.tint))}
                </div>
              </section>
            );
          })}
          <section className="family row-family">
            <div className="family-head"><h2>{t('family.mine')}</h2></div>
            <div className="tiles-row">
              <button type="button" className="tile tint-sage" onClick={() => openQuiz('myquizzes')}><Icon name="plus" /><span className="tile-name">{t('cat.create')}</span></button>
              <button type="button" className="tile tint-sage" onClick={() => { go('print'); window.scrollTo(0, 0); }}><span className="hub-art" aria-hidden="true">🖨️</span><span className="tile-name">{t('print.title')}</span></button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
