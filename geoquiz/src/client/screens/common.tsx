import { BATTLE_LIVES, type PublicPlayer, type Settings, type TeamScore } from '../../shared/protocol';
import { useApp } from '../state';

export function SettingsSummary({ settings }: { settings: Settings }) {
  const { t, catalog, lang } = useApp();
  const z = catalog?.zones.find((x) => x.id === settings.zone);
  const zone = !z ? settings.zone
    : z.kind === 'world' ? t('zone.world')
      : z.kind === 'regions' ? `${z.names?.[lang]} (${t(`level.${z.level}`)})`
        : t(`zone.${z.id.replace(':', '.')}`);
  return (
    <dl className="summary">
      <div><dt>{t('setup.category')}</dt><dd>{t(`cat.${settings.category}`)}</dd></div>
      {!catalog?.categories.find((c) => c.id === settings.category)?.noZone && <div><dt>{t('setup.zone')}</dt><dd>{zone}</dd></div>}
      <div><dt>{t('setup.difficulty')}</dt><dd>{t(`diff.${settings.difficulty}`)}</dd></div>
      <div><dt>{t('setup.qtype')}</dt><dd>{t(`qtype.${settings.qtype}`)}</dd></div>
      <div><dt>{t('setup.count')}</dt><dd>{settings.count}</dd></div>
      <div><dt>{t('setup.time')}</dt><dd>{t('setup.seconds', { n: settings.timeLimit })}</dd></div>
    </dl>
  );
}

export function Leaderboard({ players, you, limit = 50, deltas }: { players: PublicPlayer[]; you?: string; limit?: number; deltas?: Record<string, number> }) {
  const { t } = useApp();
  return (
    <ol className="board">
      {players.slice(0, limit).map((p, i) => (
        <li key={p.id} className={`${p.id === you ? 'me' : ''} ${p.connected ? '' : 'offline'}`} style={{ '--i': i } as React.CSSProperties}>
          <span className="rank">{i + 1}</span>
          <span className="pname" dir="auto">{p.name}</span>
          {deltas?.[p.id] ? <span className="delta">+{deltas[p.id]}</span> : null}
          <span className="pts">{t('play.score', { n: p.score })}</span>
        </li>
      ))}
    </ol>
  );
}

export function FlagImg({ token, className = 'flag' }: { token: string; className?: string }) {
  return <img className={className} src={`/api/img/${token}`} alt="" draggable={false} />;
}

/** Cœurs du Battle Royale. */
export function Hearts({ lives = 0 }: { lives?: number }) {
  const { t } = useApp();
  return (
    <span className="hearts" role="img" aria-label={t('battle.lives', { n: lives })}>
      {Array.from({ length: BATTLE_LIVES }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true">
          <path className={i < lives ? 'full' : 'empty'} d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z" />
        </svg>
      ))}
    </span>
  );
}

export function TeamChip({ team }: { team: number }) {
  const { t } = useApp();
  return <span className="team-chip"><i className={`t${team}`} aria-hidden="true" />{t(`team.${team}`)}</span>;
}

/** Barres de score des équipes. */
export function TeamBars({ teams, myTeam }: { teams: TeamScore[]; myTeam?: number }) {
  const { t } = useApp();
  const max = Math.max(1, ...teams.map((x) => x.score));
  return (
    <ol className="team-bars">
      {teams.map((x) => (
        <li key={x.id} className={x.id === myTeam ? 'me' : ''}>
          <div className="row">
            <strong><TeamChip team={x.id} /></strong>
            <span>{t('play.score', { n: x.score })} · {t('team.players', { n: x.size })}</span>
          </div>
          <div className="bar"><span className={`t${x.id}`} style={{ width: `${(x.score / max) * 100}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}
