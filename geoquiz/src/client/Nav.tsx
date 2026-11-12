// Barre de navigation en bas (comme une appli) : Jouer, Aujourd'hui, Classements, Profil.
import { cameFrom } from './screens/Puzzles';
import { useEffect, useState } from 'react';
import { api } from './account';
import { FAMILIES, Icon, type GameDef } from './games';
import type { Screen } from './state';
import { useApp } from './state';
import { useEvents } from './events';
import { HomeworkCard } from './screens/School';
import { DailyBoard } from './screens/Setup';
import { LeaderboardScreen, Stars } from './screens/Account';
import { LeagueScreen } from './screens/Progress';
import { starsOf } from './account';

/** Écrans où la barre est visible (jamais pendant une partie). */
export const NAV_SCREENS: Screen[] = ['home', 'today', 'rankings', 'profile', 'signin', 'leaderboard', 'league', 'passport', 'classes', 'tournament', 'geo', 'print', 'myquizzes', 'globle', 'capword', 'compass'];
const TAB_OF: Partial<Record<Screen, string>> = {
  home: 'home', geo: 'home', print: 'home', myquizzes: 'home',
  today: 'today', globle: 'today', capword: 'today', compass: 'today', passport: 'today', league: 'today', classes: 'today', tournament: 'today',
  rankings: 'rankings', leaderboard: 'rankings', profile: 'profile', signin: 'profile',
};

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const TAB_ICONS: Record<string, JSX.Element> = {
  home: <g {...P}><rect x="2.5" y="7" width="19" height="11" rx="5.5" /><path d="M7 10.5v4M5 12.5h4" /><circle cx="15.5" cy="11.3" r=".6" fill="currentColor" /><circle cx="17.5" cy="13.7" r=".6" fill="currentColor" /></g>,
  today: <g {...P}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></g>,
  rankings: <g {...P}><path d="M4 20V13h4.5v7M9.75 20V8h4.5v12M15.5 20v-9.5H20V20" /><path d="M3 20h18" /></g>,
  profile: <g {...P}><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" /></g>,
};

let hwCache: { id: string; n: number } | null = null;
/** Devoirs à faire (compte connecté), gardés le temps de la session. */
export function useHomework() {
  const { me, auth } = useApp();
  const [n, setN] = useState(hwCache && me && hwCache.id === me.id ? hwCache.n : 0);
  useEffect(() => {
    if (!me || !auth || !(me as { id: string }).id) return;
    api<{ joined: { assignments: { mine: unknown }[] }[] }>('/api/classes', { token: auth }).then((r) => {
      if (!r.ok) return;
      const v = r.data.joined.reduce((s, c) => s + c.assignments.filter((a) => !a.mine).length, 0);
      hwCache = { id: me.id, n: v };
      setN(v);
    });
  }, [me?.id, auth]);
  return n;
}

export function BottomNav() {
  const { t, s, go, me } = useApp();
  const hw = useHomework();
  const tab = TAB_OF[s.screen] ?? 'home';
  const badge = (me?.reviewDue ?? 0) + hw;
  const open = (to: Screen) => { if (to === 'home') history.replaceState(null, '', '/'); go(to); window.scrollTo(0, 0); };
  return (
    <nav className="bottom-nav" aria-label={t('nav.label')}>
      {([['home', 'home'], ['today', 'today'], ['rankings', 'rankings'], ['profile', 'profile']] as [string, Screen][]).map(([id, to]) => (
        <button type="button" key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => open(to)}>
          <span className="nav-ic">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">{TAB_ICONS[id]}</svg>
            {id === 'today' && badge > 0 && <i className="nav-badge">{badge > 9 ? '9+' : badge}</i>}
          </span>
          <span>{t(`nav.${id}`)}</span>
        </button>
      ))}
    </nav>
  );
}

/** Onglet « Aujourd'hui » : défi du jour, révisions, devoirs, ligue, tournoi, événement. */
export function TodayScreen() {
  const { t, me, name, setName, openGame, go, lang } = useApp();
  const ev = useEvents()?.active;
  const fam = FAMILIES.find((f) => f.id === 'today')!;
  const pick = (g: GameDef) => {
    if (!name.trim()) setName(t('home.guestName', { n: 100 + Math.floor(Math.random() * 900) }));
    if (g.screen) { cameFrom('today'); go(g.screen); window.scrollTo(0, 0); return; }
    openGame(g.id);
  };
  const end = ev ? new Date(ev.end).toLocaleDateString(lang === 'ar' ? 'ar-MA' : lang, { day: 'numeric', month: 'long' }) : '';
  return (
    <div className="home today">
      <div className="home-head"><h1>{t('nav.today')}</h1><p className="muted">{t('today.hint')}</p></div>
      <HomeworkCard />
      {ev && (
        <button type="button" className="event-card" onClick={() => openGame('event')}>
          <span className="event-emoji" aria-hidden="true">{ev.emoji}</span>
          <span><strong>{ev.names[lang]}</strong><small>{t('event.until', { date: end })}</small></span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      <div className="tiles">
        {fam.games.map((g) => (
          <button type="button" key={g.id} className={`tile ${fam.tint}`} onClick={() => pick(g)} title={t(`game.${g.id}`)}>
            <Icon name={g.icon} />
            <span className="tile-name">{t(`cat.${g.id}`)}</span>
            {g.id === 'review' && !!me?.reviewDue && <span className="tile-count">{me.reviewDue}</span>}
            {!g.screen && <Stars list={starsOf(me, g.id)} />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Onglet « Classements » : la semaine, ma ligue, le défi du jour. */
export function RankingsScreen() {
  const { t } = useApp();
  const [tab, setTab] = useState<'week' | 'league' | 'daily'>('week');
  return (
    <div className="rankings">
      <h1 className="rankings-title">{t('nav.rankings')}</h1>
      <div className="seg rankings-tabs">
        {(['week', 'league', 'daily'] as const).map((x) => <button type="button" key={x} aria-pressed={tab === x} onClick={() => setTab(x)}>{t(`rank.tab.${x}`)}</button>)}
      </div>
      {tab === 'week' && <LeaderboardScreen embedded />}
      {tab === 'league' && <LeagueScreen embedded />}
      {tab === 'daily' && <div className="panel"><DailyBoard /></div>}
    </div>
  );
}
