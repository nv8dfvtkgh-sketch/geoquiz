import { useRef, useState } from 'react';
import { LIMITS } from '../../shared/protocol';
import { FAMILIES, Icon, type GameDef } from '../games';
import { joinGame } from '../net';
import { useApp } from '../state';

export function Home() {
  const { t, s, name, setName, lang, fail, openGame, openQuiz } = useApp();
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
    openGame(g.id);
  };

  return (
    <div className="home">
      <div className="home-head">
        <h1>{t('home.chooseGame')}</h1>
        <p className="muted">{t('home.chooseHint')}</p>
      </div>

      {editingName ? (
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

      {FAMILIES.map((f) => (
        <section key={f.id} className="family">
          <h2>{t(`family.${f.id}`)}</h2>
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
                {g.fresh && !g.soon && <span className="tile-dot" aria-label={t('home.new')} />}
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
      </section>
    </div>
  );
}
