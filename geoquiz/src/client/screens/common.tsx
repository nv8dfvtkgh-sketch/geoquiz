import type { PublicPlayer, Settings } from '../../shared/protocol';
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
