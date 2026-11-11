import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { LANGS, type Catalog, type Lang, type Settings } from '../shared/protocol';
import { applyLang, detectLang, LANG_LABELS, makeT } from './i18n';
import { net, saveSession, savedSession } from './net';
import { isMuted, setMuted, sfx } from './sound';
import { AppCtx, initialState, loadSettings, reducer, useApp } from './state';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Lobby, QuickWait } from './screens/Lobby';
import { Game } from './screens/Game';
import { Final } from './screens/Final';

const joinMatch = location.pathname.match(/^\/join\/([A-Za-z0-9]{6})/);

export function App() {
  const [s, dispatch] = useReducer(reducer, initialState(joinMatch?.[1]?.toUpperCase()));
  const [lang, setLangState] = useState<Lang>(detectLang);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [online, setOnline] = useState(true);
  const [name, setNameState] = useState(() => { try { return localStorage.getItem('gq.name') ?? ''; } catch { return ''; } });
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const t = useMemo(() => makeT(lang), [lang]);

  useEffect(() => {
    applyLang(lang);
    net.lang = lang;
    document.title = t('app.title');
  }, [lang, t]);

  const who = useRef({ name, lang });
  who.current = { name, lang };
  useEffect(() => {
    fetch('/api/catalog').then((r) => r.json()).then(setCatalog).catch(() => {});
    // Rechargement de la page : on ne revient dans une partie que si c'est une partie à
    // plusieurs encore en cours (un joueur qui actualise ne perd pas sa place). Une partie
    // solo ou terminée est abandonnée : on reste sur l'accueil.
    let reloadCheck = !!savedSession();
    let ignoring = false;
    const off = net.on((msg) => {
      if (reloadCheck && msg.t !== 'joined' && msg.t !== 'pong') reloadCheck = false; // reprise refusée (partie expirée)
      if (reloadCheck && msg.t === 'joined') {
        reloadCheck = false;
        if (msg.room.kind === 'solo' || msg.room.state === 'finished') {
          ignoring = true;
          net.send({ t: 'leave' });
          saveSession(null);
          setTimeout(() => { net.close(); ignoring = false; }, 50);
          return;
        }
      }
      if (ignoring) return;
      // Partie rapide : un adversaire est trouvé, on rejoint le duel créé pour nous.
      if (msg.t === 'matched') {
        net.open(msg.code);
        net.send({ t: 'join', name: who.current.name, lang: who.current.lang });
        return;
      }
      dispatch({ type: 'server', msg });
    });
    net.statusListeners.add(setOnline);
    const session = savedSession();
    if (session) net.open(session.code);
    if (joinMatch) history.replaceState(null, '', '/');
    return () => { off(); };
  }, []);

  const send = useCallback((m: Parameters<typeof net.send>[0]) => net.send(m), []);
  const ctx = {
    s, t, lang, catalog, name, settings, send,
    setLang: (l: Lang) => { setLangState(l); if (s.room) net.send({ t: 'lang', lang: l }); },
    go: (screen: typeof s.screen, setupKind?: typeof s.setupKind) => dispatch({ type: 'go', screen, setupKind }),
    openGame: (game: string) => { dispatch({ type: 'openGame', game }); window.scrollTo(0, 0); },
    setName: (n: string) => { setNameState(n); try { localStorage.setItem('gq.name', n); } catch {} },
    setSettings: (x: Settings) => { setSettingsState(x); try { localStorage.setItem('gq.settings', JSON.stringify(x)); } catch {} },
    leave: () => { net.send({ t: 'leave' }); setTimeout(() => net.close(), 50); saveSession(null); dispatch({ type: 'reset' }); },
    fail: (code: string | null) => dispatch({ type: 'error', code: code ?? undefined }),
  };

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`app screen-${s.screen}`}>
        <TopBar />
        {!online && <div className="banner" role="status">{t('net.reconnecting')}</div>}
        <main>
          {s.screen === 'home' && <Home />}
          {s.screen === 'setup' && <Setup />}
          {s.screen === 'lobby' && <Lobby />}
          {s.screen === 'quick' && <QuickWait />}
          {s.screen === 'game' && <Game />}
          {s.screen === 'final' && <Final />}
        </main>
      </div>
    </AppCtx.Provider>
  );
}

function TopBar() {
  const { t, lang, setLang, s, leave } = useApp();
  const [muted, setM] = useState(isMuted());
  const inGame = s.screen === 'game' || s.screen === 'lobby' || s.screen === 'final';
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={() => !inGame && leave()} disabled={inGame}>
        <Compass />
        <span>{t('app.title')}</span>
      </button>
      <div className="topbar-tools">
        <label className="lang">
          <span className="sr">{t('lang.label')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={!muted}
          title={muted ? t('sound.off') : t('sound.on')}
          aria-label={muted ? t('sound.off') : t('sound.on')}
          onClick={() => { setMuted(!muted); setM(!muted); if (muted) sfx.good(); }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {muted ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" /> : <path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" fill="none" />}
          </svg>
        </button>
        {inGame && (
          <button type="button" className="text-btn" onClick={leave}>{t('play.quit')}</button>
        )}
      </div>
    </header>
  );
}

export function Compass() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" className="compass">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 4l3.2 12H12.8z" fill="var(--accent)" />
      <path d="M16 28l-3.2-12h6.4z" fill="currentColor" opacity=".55" />
      <circle cx="16" cy="16" r="1.8" fill="var(--paper)" stroke="currentColor" />
    </svg>
  );
}
