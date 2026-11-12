// Carte des régions : une tuile par région du monde avec sa mini-carte, et pour chaque jeu
// (pays, drapeaux, capitales…) le pourcentage déjà maîtrisé et une médaille.
import { memo, useEffect, useMemo, useState } from 'react';
import type { MapData, ZoneInfo } from '../../shared/protocol';
import { loadMap } from '../MapView';
import { useApp } from '../state';

export interface HubRegion { zone: string; games: string[] }
export const HUB: HubRegion[] = [
  { zone: 'world', games: ['countries', 'flags', 'capitals'] },
  { zone: 'c:africa', games: ['countries', 'flags', 'capitals'] },
  { zone: 'c:europe', games: ['countries', 'flags', 'capitals'] },
  { zone: 'c:asia', games: ['countries', 'flags', 'capitals'] },
  { zone: 'c:north-america', games: ['countries', 'flags', 'capitals'] },
  { zone: 'c:south-america', games: ['countries', 'flags', 'capitals'] },
  { zone: 'c:oceania', games: ['countries', 'flags', 'capitals'] },
  { zone: 'r:MA:groups', games: ['regions'] },
];

/** Médaille selon le pourcentage maîtrisé. */
export const medalOf = (pct: number) => (pct >= 100 ? 'gold' : pct >= 80 ? 'silver' : pct >= 50 ? 'bronze' : 'none');

const MiniMap = memo(function MiniMap({ zone }: { zone: ZoneInfo }) {
  const mapId = zone.kind === 'regions' ? `region:${zone.id.split(':')[1]}:${zone.level}` : 'world';
  const [data, setData] = useState<MapData | null>(null);
  useEffect(() => { loadMap(mapId).then(setData).catch(() => {}); }, [mapId]);
  const inZone = useMemo(() => new Set(zone.ids ?? []), [zone]);
  if (!data || !zone.view) return <div className="hub-map" />;
  // Cadrage un peu élargi, et plus large que haut pour remplir la tuile.
  let [x, y, w, h] = zone.view;
  const pad = Math.max(w, h) * 0.06;
  x -= pad; y -= pad; w += pad * 2; h += pad * 2;
  const ratio = 1.5;
  if (w / h < ratio) { const nw = h * ratio; x -= (nw - w) / 2; w = nw; } else { const nh = w / ratio; y -= (nh - h) / 2; h = nh; }
  const all = zone.kind === 'world' || zone.kind === 'regions';
  return (
    <svg className="hub-map" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {data.features.map((f) => (
        <path key={f.id} d={f.d} className={all || inZone.has(f.id) ? 'in' : 'out'} />
      ))}
    </svg>
  );
});

export function GeoHubView({ progress, onPlay }: { progress: (game: string, zone: string) => number | null; onPlay?: (game: string, zone: string, mode: 'map' | 'type') => void }) {
  const { t, catalog } = useApp();
  const [mode, setMode] = useState<'map' | 'type'>('map');
  if (!catalog) return <div className="loading" />;
  const zoneById = new Map(catalog.zones.map((z) => [z.id, z]));
  const zoneName = (z: ZoneInfo) => (z.kind === 'regions' ? t('hub.morocco') : t(`zone.${z.id.replace(':', '.')}`));
  return (
    <div className="hub">
      <div className="hub-mode">
        <span>{t('hub.mode')}</span>
        <div className="seg">
          <button type="button" aria-pressed={mode === 'map'} onClick={() => setMode('map')}>📍 {t('hub.pin')}</button>
          <button type="button" aria-pressed={mode === 'type'} onClick={() => setMode('type')}>⌨️ {t('hub.type')}</button>
        </div>
      </div>
      <div className="hub-grid">
        {HUB.map((r) => {
          const z = zoneById.get(r.zone);
          if (!z) return null;
          return (
            <section key={r.zone} className={`hub-card hz-${r.zone.replace(/[:]/g, '-')}`}>
              <MiniMap zone={z} />
              <h3>{zoneName(z)}</h3>
              <ul>
                {r.games.map((g) => {
                  const pct = progress(g, r.zone);
                  const medal = medalOf(pct ?? 0);
                  return (
                    <li key={g}>
                      <button type="button" onClick={() => onPlay?.(g, r.zone, mode)}>
                        <span className="hub-game">{t(`cat.${g}`)}</span>
                        <span className="hub-pct">{pct === null ? '–' : `${pct} %`}</span>
                        <span className={`medal ${medal}`} aria-label={t(`hub.medal.${medal}`)} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Pourcentage maîtrisé d'un jeu dans une zone, d'après les éléments déjà trouvés du joueur. */
function useHubProgress() {
  const { me, catalog } = useApp();
  const [regionIds, setRegionIds] = useState<Set<string> | null>(null);
  useEffect(() => { loadMap('region:MA:groups').then((d) => setRegionIds(new Set(d.features.map((f) => f.id)))).catch(() => {}); }, []);
  return (game: string, zoneId: string): number | null => {
    if (!me || !catalog) return null;
    const z = catalog.zones.find((x) => x.id === zoneId);
    const found = me.cats[game]?.found ?? [];
    let n = 0;
    let total = z?.pool?.[game] ?? z?.count ?? 0;
    if (game === 'regions') {
      n = regionIds ? found.filter((id) => regionIds.has(id)).length : 0;
      total = z?.pool?.regions ?? z?.count ?? 0;
    } else if (z?.kind === 'world') {
      n = found.length;
    } else {
      const ids = new Set(z?.ids ?? []);
      n = found.filter((id) => ids.has(id)).length;
    }
    return total ? Math.min(100, Math.floor((n * 100) / total)) : 0;
  };
}

/** Page « Géographie » : chaque ligne ouvre le jeu réglé sur la région et le mode choisis. */
export function GeoScreen() {
  const { t, me, go, settings, setSettings, openGame } = useApp();
  const progress = useHubProgress();
  return (
    <div className="hub-page">
      <button type="button" className="back-link" onClick={() => { history.replaceState(null, '', '/'); go('home'); }}>‹ {t('setup.backHome')}</button>
      <div className="hub-head">
        <h1>{t('hub.title')}</h1>
        <p className="muted">{me ? t('hub.hint') : t('hub.guest')}</p>
        {!me && <button type="button" className="btn primary" onClick={() => go('signin')}>{t('account.create')}</button>}
      </div>
      <GeoHubView
        progress={progress}
        onPlay={(game, zone, mode) => {
          setSettings({ ...settings, zone, qtype: mode });
          openGame(game);
        }}
      />
    </div>
  );
}
