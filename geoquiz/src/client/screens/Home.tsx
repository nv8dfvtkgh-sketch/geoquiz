import { useRef, useState } from 'react';
import { LIMITS } from '../../shared/protocol';
import { FAMILIES, Icon, type GameDef } from '../games';
import { joinGame } from '../net';
import { FeedbackLink } from '../Feedback';
import { HomeworkCard } from './School';
import { useEvents } from '../events';

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

function Games() {
  const { t, s, name, setName, lang, fail, openGame, openQuiz, me, go } = useApp();
  const [code, setCode] = useState(s.joinCode ?? '');
  const [editingName, setEditingName] = useState(!name.trim());
  const [needName, setNeedName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const ready = name.trim().length > 0;

  const askName = () => {
    setEditingName(true);
    setNeedName(true);
    setTimeout(() => nameRef.current?.focus(), 0);
  };
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return askName();
    if (code.length === 6) joinGame(code, name, lang).then(fail);
  };
  const pick = (g: GameDef) => {
    if (g.soon) return;
    if (!ready) return askName();
    if (g.screen) { go(g.screen); window.scrollTo(0, 0); return; }
    openGame(g.id);
  };

  return (
    <div className="home">
      <div className="home-head">
        <h1>{t('home.chooseGame')}</h1>
        <p className="muted">{t('home.chooseHint')}</p>
      </div>

      {me ? (
        <button type="button" className="me-card" onClick={() => go('profile')}>
          <span className="me-avatar" aria-hidden="true">{me.avatar}</span>
          <span className="me-text">
            <strong dir="auto">{me.pseudo}</strong>
            <small>{t('profile.level', { n: me.level })} · {t(`rank.${me.title}`)}</small>
            <span className="level-bar"><span style={{ width: `${Math.round((me.levelXp / me.levelNeed) * 100)}%` }} /></span>
          </span>
          <span className="me-xp">{me.weekXp} XP<small>{t('profile.week')}</small></span>
        </button>
      ) : editingName ? (
        <label className="field name-field">
          <span>{t('home.name')}</span>
          <input
            ref={nameRef}
            value={name}
            maxLength={LIMITS.maxNameLength}
            placeholder={t('home.namePlaceholder')}
            onChange={(e) => { setName(e.target.value); setNeedName(false); }}
            onBlur={() => name.trim() && setEditingName(false)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && setEditingName(false)}
            autoComplete="nickname"
            className={needName ? 'needs' : ''}
          />
          {needName && <small className="error">{t('home.nameFirst')}</small>}
        </label>
      ) : (
        <div className="name-bar">
          <span>{t('home.yourName')} <strong dir="auto">{name}</strong></span>
          <button type="button" className="text-btn" onClick={() => setEditingName(true)}>{t('home.editName')}</button>
        </div>
      )}

      <form className="join" onSubmit={join}>
        <label htmlFor="join-code" className="sr">{t('home.code')}</label>
        <input
          id="join-code"
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="ABC234"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn primary" disabled={code.length !== 6}>{t('home.joinBtn')}</button>
      </form>
      {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}

      <HomeworkCard />
      <EventCard onOpen={() => { if (!ready) return askName(); openGame('event'); }} />

      {FAMILIES.filter((f) => f.id !== 'today').map((f) => (
        <section key={f.id} className="family">
          <h2>{t(`family.${f.id}`)}</h2>
          {f.id === 'geo' && (
            <button type="button" className="geo-feature" onClick={() => { if (!ready) return askName(); go('geo'); window.scrollTo(0, 0); }}>
              <span className="geo-feature-art" aria-hidden="true">🗺️</span>
              <span className="geo-feature-text">
                <strong>{t('hub.title')}</strong>
                <small>{t('hub.cta')}</small>
              </span>
              <span className="geo-feature-go" aria-hidden="true">›</span>
            </button>
          )}
          <div className="tiles">
            {f.games.map((g) => (
              <button
                type="button"
                key={g.id}
                className={`tile ${f.tint} ${g.soon ? 'soon' : ''}`}
                onClick={() => pick(g)}
                aria-disabled={g.soon || undefined}
                title={t(`game.${g.id}`)}
              >
                <Icon name={g.icon} />
                <span className="tile-name">{t(`cat.${g.id}`)}</span>
                {g.soon && <span className="tile-soon">{t('home.soon')}</span>}
                {g.id === 'review' && !!me?.reviewDue && <span className="tile-count">{me.reviewDue}</span>}
                {g.fresh && !g.soon && !starsOf(me, g.id)?.some(Boolean) && <span className="tile-dot" aria-label={t('home.new')} />}
                {!g.soon && <Stars list={starsOf(me, g.id)} />}
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="family">
        <h2>{t('family.mine')}</h2>
        <button type="button" className="create-quiz ready" onClick={() => openQuiz('myquizzes')}>
          <Icon name="plus" size={32} />
          <span>
            <strong>{t('cat.create')}</strong>
            <small>{t('game.create')}</small>
          </span>
        </button>
        <button type="button" className="create-quiz ready print-card" onClick={() => { go('print'); window.scrollTo(0, 0); }}>
          <span className="print-card-art" aria-hidden="true">🖨️</span>
          <span>
            <strong>{t('print.title')}</strong>
            <small>{t('print.cta')}</small>
          </span>
        </button>
      </section>
      <p className="home-foot"><FeedbackLink /></p>
    </div>
  );
}
