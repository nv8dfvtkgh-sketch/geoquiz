import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, LIMITS, type MapData } from '../../shared/protocol';
import { loadMap } from '../MapView';
import { joinGame, net } from '../net';
import { useApp } from '../state';

export function Home() {
  const { t, s, go, name, setName, lang, catalog, fail } = useApp();
  const [code, setCode] = useState(s.joinCode ?? '');
  const max = catalog?.maxPlayers ?? 50;
  const ready = name.trim().length > 0;

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6 && ready) joinGame(code, name, lang).then(fail);
  };

  return (
    <div className="home">
      <section className="plate">
        <WorldPlate />
        <div className="plate-title">
          <h1>{t('app.title')}</h1>
          <p>{t('app.tagline')}</p>
        </div>
      </section>

      <div className="home-body">
        <label className="field">
          <span>{t('home.name')}</span>
          <input
            value={name}
            maxLength={LIMITS.maxNameLength}
            placeholder={t('home.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            className={!ready ? 'needs' : ''}
          />
        </label>

        {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}

        <form className="join" onSubmit={join}>
          <h2>{t('home.join')}</h2>
          <div className="join-row">
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC234"
              aria-label={t('home.code')}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn primary" disabled={code.length !== 6 || !ready}>{t('home.joinBtn')}</button>
          </div>
        </form>

        <nav className="modes">
          <button type="button" className="mode" disabled={!ready} onClick={() => go('setup', 'solo')}>
            <strong>{t('home.solo')}</strong><span>{t('home.soloHint')}</span>
          </button>
          <button type="button" className="mode" disabled={!ready} onClick={() => go('setup', 'duel')}>
            <strong>{t('home.duel')}</strong><span>{t('home.duelHint')}</span>
          </button>
          <button type="button" className="mode" disabled={!ready} onClick={() => { net.open('quick'); net.send({ t: 'quick', settings: { ...DEFAULT_SETTINGS, timeLimit: 15 } }); }}>
            <strong>{t('home.quick')}</strong><span>{t('home.quickHint')}</span>
          </button>
          <button type="button" className="mode" disabled={!ready} onClick={() => go('setup', 'room')}>
            <strong>{t('home.room')}</strong><span>{t('home.roomHint', { max })}</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

/** Planche d'atlas décorative : la carte du monde, sans interaction. */
function WorldPlate() {
  const [map, setMap] = useState<MapData | null>(null);
  useEffect(() => { loadMap('world').then(setMap).catch(() => {}); }, []);
  return (
    <svg className="plate-map" viewBox={map ? `0 0 ${map.w} ${map.h}` : '0 0 1000 520'} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      {map?.features.map((f) => <path key={f.id} d={f.d} />)}
    </svg>
  );
}
