import { useMemo, useState } from 'react';
import { LIMITS, type CategoryId, type Difficulty, type QType, type Settings, type ZoneInfo } from '../../shared/protocol';
import { createGame } from '../net';
import { useApp } from '../state';

/** Choix de la partie : catégorie, zone, difficulté, type de questions, nombre, temps. */
export function Setup() {
  const { t, s, send, go, catalog, settings, setSettings, name, lang, fail } = useApp();
  const kind = s.setupKind;
  const editing = kind === 'edit';
  const roomKind = editing ? s.room!.kind : kind;
  const [raw, setCfg] = useState<Settings>(() => (editing ? s.room!.settings : settings));
  const cfg = useMemo(() => fix(raw, catalog?.zones ?? []), [raw, catalog]);
  const [hostPlays, setHostPlays] = useState(true);
  const set = (patch: Partial<Settings>) => setCfg(fix({ ...cfg, ...patch }, catalog?.zones ?? []));

  const cat = catalog?.categories.find((c) => c.id === cfg.category);
  const zonesForCat = useMemo(
    () => (catalog?.zones ?? []).filter((z) => z.categories.includes(cfg.category)),
    [catalog, cfg.category],
  );
  const zoneName = (z: ZoneInfo) =>
    z.kind === 'world' ? t('zone.world')
      : z.kind === 'regions' ? (z.names?.[lang] ?? z.id)
        : t(`zone.${z.id.replace(':', '.')}`);

  if (!catalog) return <div className="loading" />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      send({ t: 'settings', settings: cfg });
      go('lobby');
      return;
    }
    setSettings(cfg);
    createGame({ kind: roomKind, settings: cfg, hostPlays: roomKind === 'room' ? hostPlays : true }, name, lang).then(fail);
  };

  const regionZones = zonesForCat.filter((z) => z.kind === 'regions');
  const regionCountries = [...new Set(regionZones.map((z) => z.id.split(':')[1]))]
    .map((iso) => ({ iso, z: regionZones.find((z) => z.id.startsWith(`r:${iso}:`))! }))
    .sort((a, b) => zoneName(a.z).localeCompare(zoneName(b.z), lang));
  const [, curIso, curLevel] = cfg.zone.split(':');
  const levels = regionZones.filter((z) => z.id.startsWith(`r:${curIso}:`));

  return (
    <form className="setup panel" onSubmit={submit}>
      <h1>{t(`setup.title.${kind}`)}</h1>

      <fieldset className="seg-field">
        <legend>{t('setup.category')}</legend>
        <div className="seg">
          {catalog.categories.map((c) => (
            <button type="button" key={c.id} aria-pressed={cfg.category === c.id} onClick={() => set({ category: c.id as CategoryId })}>
              {t(`cat.${c.id}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {cfg.category === 'regions' ? (
        <div className="row2">
          <label className="field">
            <span>{t('setup.country')}</span>
            <select value={curIso} onChange={(e) => set({ zone: (regionZones.find((z) => z.id === `r:${e.target.value}:groups`) ?? regionZones.find((z) => z.id.startsWith(`r:${e.target.value}:`)))!.id })}>
              {regionCountries.map(({ iso, z }) => <option key={iso} value={iso}>{zoneName(z)}</option>)}
            </select>
          </label>
          {levels.length > 1 && (
            <label className="field">
              <span>{t('setup.level')}</span>
              <select value={curLevel} onChange={(e) => set({ zone: `r:${curIso}:${e.target.value}` })}>
                {levels.map((z) => <option key={z.id} value={z.level}>{t(`level.${z.level}`)} ({z.count})</option>)}
              </select>
            </label>
          )}
        </div>
      ) : (
        <label className="field">
          <span>{t('setup.zone')}</span>
          <select value={cfg.zone} onChange={(e) => set({ zone: e.target.value })}>
            <option value="world">{t('zone.world')}</option>
            <optgroup label={t('zone.continents')}>
              {zonesForCat.filter((z) => z.kind === 'continent').map((z) => <option key={z.id} value={z.id}>{zoneName(z)}</option>)}
            </optgroup>
            <optgroup label={t('zone.subregions')}>
              {zonesForCat.filter((z) => z.kind === 'subregion')
                .sort((a, b) => zoneName(a).localeCompare(zoneName(b), lang))
                .map((z) => <option key={z.id} value={z.id}>{zoneName(z)}</option>)}
            </optgroup>
          </select>
        </label>
      )}

      <fieldset className="seg-field">
        <legend>{t('setup.difficulty')}</legend>
        <div className="seg">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button type="button" key={d} aria-pressed={cfg.difficulty === d} onClick={() => set({ difficulty: d })}>{t(`diff.${d}`)}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="seg-field">
        <legend>{t('setup.qtype')}</legend>
        <div className="seg">
          {(['mix', ...(cat?.qtypes ?? [])] as QType[]).map((q) => (
            <button type="button" key={q} aria-pressed={cfg.qtype === q} onClick={() => set({ qtype: q })}>{t(`qtype.${q}`)}</button>
          ))}
        </div>
      </fieldset>

      <div className="row2">
        <label className="field">
          <span>{t('setup.count')}</span>
          <select value={cfg.count} onChange={(e) => set({ count: +e.target.value })}>
            {[5, 10, 15, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {roomKind !== 'solo' && (
          <label className="field">
            <span>{t('setup.time')}</span>
            <select value={cfg.timeLimit} onChange={(e) => set({ timeLimit: +e.target.value })}>
              {[5, 10, 15, 20, 30, 45, 60].filter((n) => n >= LIMITS.minTime).map((n) => <option key={n} value={n}>{t('setup.seconds', { n })}</option>)}
            </select>
          </label>
        )}
      </div>

      {roomKind === 'solo' && (
        <fieldset className="choices">
          <legend>{t('setup.soloMode')}</legend>
          {(['training', 'timed'] as const).map((m) => (
            <label key={m} className="choice">
              <input type="radio" name="solo" checked={cfg.soloMode === m} onChange={() => set({ soloMode: m })} />
              <span><strong>{t(`solo.${m}`)}</strong><small>{t(`solo.${m}Hint`)}</small></span>
            </label>
          ))}
        </fieldset>
      )}

      {roomKind === 'room' && !editing && (
        <label className="toggle">
          <input type="checkbox" checked={hostPlays} onChange={(e) => setHostPlays(e.target.checked)} />
          <span><strong>{t('setup.hostPlays')}</strong>{!hostPlays && <small>{t('setup.hostPlaysOff')}</small>}</span>
        </label>
      )}

      {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}

      <div className="actions">
        <button type="button" className="btn ghost" onClick={() => go(editing ? 'lobby' : 'home')}>{t('setup.back')}</button>
        <button className="btn primary">{editing ? t('setup.save') : roomKind === 'solo' ? t('setup.start') : t('setup.create')}</button>
      </div>
    </form>
  );
}

/** Garde une zone compatible avec la catégorie choisie. */
function fix(c: Settings, zones: ZoneInfo[]): Settings {
  const ok = zones.find((z) => z.id === c.zone && z.categories.includes(c.category));
  if (ok) return c;
  const pref = c.category === 'regions' ? zones.find((z) => z.id === 'r:MA:groups') ?? zones.find((z) => z.categories.includes('regions')) : zones.find((z) => z.id === 'world');
  return { ...c, zone: pref?.id ?? 'world' };
}
