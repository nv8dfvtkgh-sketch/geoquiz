import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { LANGS, type Catalog, type Lang, type Me, type Settings } from '../shared/protocol';
import { applyLang, detectLang, LANG_LABELS, makeT } from './i18n';
import { net, saveSession, savedSession } from './net';
import { api, fetchMe, saveAuth, savedAuth } from './account';
import { isMuted, setMuted, sfx } from './sound';
import { AppCtx, initialState, loadSettings, reducer, useApp, type Look } from './state';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Lobby, QuickWait } from './screens/Lobby';
import { Game } from './screens/Game';
import { Final } from './screens/Final';
import { Admin, MyQuizzes, QuizEditor, QuizSheet } from './screens/Quizzes';
import { LeaderboardScreen, OAuthFinish, Profile, SignIn } from './screens/Account';
import { GeoScreen } from './screens/GeoHub';
import { PrintScreen } from './screens/Print';
import { ChallengeScreen } from './Challenge';
import { LeagueScreen, PassportScreen } from './screens/Progress';
import { ClassesScreen, ClassJoinScreen, TournamentScreen } from './screens/School';
import { BottomNav, NAV_SCREENS, RankingsScreen, TodayScreen } from './Nav';
import { SettingsButton } from './Settings';

const joinMatch = location.pathname.match(/^\/join\/([A-Za-z0-9]{6})/);
const quizMatch = location.pathname.match(/^\/quiz\/([A-Za-z0-9]{6})/);
const adminPage = location.pathname.startsWith('/admin');
const hubPreview = /^\/(apercu|geographie)/.test(location.pathname);
const printPage = /^\/imprimer/.test(location.pathname);
const challengeMatch = location.pathname.match(/^\/defi\/([A-Za-z0-9]{6})/);
const classMatch = location.pathname.match(/^\/classe\/([A-Za-z0-9]{6})/);
const tournamentPage = /^\/tournoi/.test(location.pathname);
// Retour de Google / Facebook : #auth=<session>, #oauth=<ticket> ou #autherr=<code>.
const authHash = new URLSearchParams(location.hash.slice(1));
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
if (authHash.get('auth')) saveAuth(authHash.get('auth'));

export function App() {
  const [s, dispatch] = useReducer(reducer, undefined, () => {
    const st = initialState(joinMatch?.[1]?.toUpperCase());
    if (adminPage) return { ...st, screen: 'admin' as const };
    if (hubPreview) return { ...st, screen: 'geo' as const };
    if (printPage) return { ...st, screen: 'print' as const };
    if (classMatch) return { ...st, screen: 'classjoin' as const, classCode: classMatch[1].toUpperCase() };
    if (tournamentPage) return { ...st, screen: 'tournament' as const };
    if (challengeMatch) return { ...st, screen: 'challenge' as const, challengeCode: challengeMatch[1].toUpperCase() };
    if (authHash.get('oauth')) return { ...st, screen: 'oauth' as const, oauthTicket: authHash.get('oauth')! };
    if (authHash.get('autherr')) return { ...st, screen: 'signin' as const, error: authHash.get('autherr')! };
    if (quizMatch) return { ...st, screen: 'quizsheet' as const, quiz: { id: quizMatch[1].toUpperCase() } };
    return st;
  });
  const [lang, setLangState] = useState<Lang>(detectLang);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [online, setOnline] = useState(true);
  const [name, setNameState] = useState(() => { try { return localStorage.getItem('gq.name') ?? ''; } catch { return ''; } });
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [look, setLookState] = useState<Look | null>(() => {
    try { const v = localStorage.getItem('gq.look'); return v === 'kids' || v === 'classic' ? v : null; } catch { return null; }
  });
  // Compte joueur : jeton gardé sur l'appareil, profil rechargé au démarrage.
  const [auth, setAuth] = useState<string | null>(savedAuth);
  const [me, setMe] = useState<Me | null>(null);
  const authRef = useRef(auth);
  authRef.current = auth;
  const refreshMe = useCallback(() => {
    const tk = authRef.current;
    if (!tk) return;
    fetchMe(tk).then((r) => {
      if (r.ok) setMe(r.data);
      else if (r.status === 401) { saveAuth(null); setAuth(null); setMe(null); }
    });
  }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);
  // Chaque nouvel écran s'ouvre en haut de page (pas au milieu de l'écran précédent).
  useEffect(() => { if (s.screen !== 'game') window.scrollTo(0, 0); }, [s.screen]);
  // Connecté par Google / Facebook sans avoir encore choisi de style : classique (13 ans et plus).
  useEffect(() => { if (me && !look) { setLookState('classic'); try { localStorage.setItem('gq.look', 'classic'); } catch {} } }, [me, look]);
  useEffect(() => {
    document.documentElement.dataset.look = look ?? 'classic';
    if (look) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', look === 'kids' ? '#FFFFFF' : '#F5F5F7');
  }, [look]);
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
          const old = msg.room.code;
          setTimeout(() => { if (net.target === old) net.close(); ignoring = false; }, 50);
          return;
        }
      }
      if (ignoring) return;
      // Joueur connecté : la salle doit savoir à quel compte créditer la partie.
      if (msg.t === 'joined' && authRef.current) net.send({ t: 'auth', token: authRef.current });
      if (msg.t === 'reward') setTimeout(refreshMe, 0);
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
    if (joinMatch || quizMatch) history.replaceState(null, '', '/');
    return () => { off(); };
  }, []);

  const send = useCallback((m: Parameters<typeof net.send>[0]) => net.send(m), []);
  const ctx = {
    s, t, lang, catalog, name, settings, send,
    setLang: (l: Lang) => { setLangState(l); if (s.room) net.send({ t: 'lang', lang: l }); },
    go: (screen: typeof s.screen, setupKind?: typeof s.setupKind) => dispatch({ type: 'go', screen, setupKind }),
    openGame: (game: string) => { dispatch({ type: 'openGame', game }); window.scrollTo(0, 0); },
    openQuiz: (screen: typeof s.screen, quiz?: { id: string; token?: string }) => { dispatch({ type: 'openQuiz', screen, quiz }); window.scrollTo(0, 0); },
    setName: (n: string) => { setNameState(n); try { localStorage.setItem('gq.name', n); } catch {} },
    setSettings: (x: Settings) => { setSettingsState(x); try { localStorage.setItem('gq.settings', JSON.stringify(x)); } catch {} },
    leave: () => { net.send({ t: 'leave' }); setTimeout(() => net.close(), 50); saveSession(null); dispatch({ type: 'reset' }); },
    fail: (code: string | null) => dispatch({ type: 'error', code: code ?? undefined }),
    look,
    setLook: (l: Look) => { setLookState(l); try { localStorage.setItem('gq.look', l); } catch {} },
    me, auth, refreshMe, setMe,
    signIn: (token: string, m: Me) => {
      saveAuth(token); setAuth(token); setMe(m);
      setNameState(m.pseudo); try { localStorage.setItem('gq.name', m.pseudo); } catch {}
    },
    signOut: () => {
      if (auth) void api('/api/account/logout', { method: 'POST', body: {}, token: auth });
      saveAuth(null); setAuth(null); setMe(null);
      dispatch({ type: 'go', screen: 'home' });
    },
  };

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`app screen-${s.screen} ${NAV_SCREENS.includes(s.screen) && look ? 'has-nav' : ''}`}>
        <TopBar />
        {!online && <div className="banner" role="status">{t('net.reconnecting')}</div>}
        <main>
          {s.screen === 'home' && <Home />}
          {s.screen === 'setup' && <Setup />}
          {s.screen === 'lobby' && <Lobby />}
          {s.screen === 'quick' && <QuickWait />}
          {s.screen === 'game' && <Game />}
          {s.screen === 'final' && <Final />}
          {s.screen === 'myquizzes' && <MyQuizzes />}
          {s.screen === 'editor' && <QuizEditor />}
          {s.screen === 'quizsheet' && <QuizSheet />}
          {s.screen === 'admin' && <Admin />}
          {s.screen === 'profile' && <Profile />}
          {s.screen === 'leaderboard' && <LeaderboardScreen />}
          {s.screen === 'signin' && <SignIn />}
          {s.screen === 'geo' && <GeoScreen />}
          {s.screen === 'oauth' && <OAuthFinish />}
          {s.screen === 'print' && <PrintScreen />}
          {s.screen === 'challenge' && <ChallengeScreen />}
          {s.screen === 'passport' && <PassportScreen />}
          {s.screen === 'league' && <LeagueScreen />}
          {s.screen === 'classes' && <ClassesScreen />}
          {s.screen === 'classjoin' && <ClassJoinScreen />}
          {s.screen === 'tournament' && <TournamentScreen />}
          {s.screen === 'today' && <TodayScreen />}
          {s.screen === 'rankings' && <RankingsScreen />}
        </main>
        {NAV_SCREENS.includes(s.screen) && look && <BottomNav />}
      </div>
    </AppCtx.Provider>
  );
}

function TopBar() {
  const { t, lang, setLang, s, leave, look, setLook, me, go } = useApp();
  const [muted, setM] = useState(isMuted());
  const inGame = s.screen === 'game' || s.screen === 'lobby' || s.screen === 'final';
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={() => !inGame && leave()} disabled={inGame}>
        <Compass />
        <span>{t('app.title')}</span>
      </button>
      <div className="topbar-tools">
        {look && <SettingsButton />}
        {inGame && (
          <button type="button" className="text-btn" onClick={leave}>{t('play.quit')}</button>
        )}
      </div>
    </header>
  );
}

/** Logo : la lettre Q en pièces de zellige, étoile au centre (public/logo.svg). */
export function Compass() {
  return <img src="/logo.svg" width="30" height="30" alt="" className="compass zellige" draggable={false} />;
}
