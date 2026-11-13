import { useEffect, useMemo, useState } from 'react';
import { LIMITS, type Difficulty, type QType, type RoomKind, type Settings, type ZoneInfo } from '../../shared/protocol';
import { findGame, Icon } from '../games';
import { createGame, net } from '../net';
import { useApp } from '../state';
import { api, lockedFor } from '../account';
import { printableGame } from './Print';
import { dailyDoneHere, nextDailyTime } from '../dailyLock';

/**
 * Fiche d'un jeu : description, niveau, zone, options, puis « Comment jouer ? »
 * (seul, en duel, en salle). Sert aussi à modifier les réglages depuis la salle d'attente.
 */
export function Setup() {
  const { t, s, send, go, catalog, settings, setSettings, name, lang, fail, me, auth } = useApp();
  const editing = s.setupKind === 'edit';
  const roomKind = editing ? s.room!.kind : null;
  const game = editing ? s.room!.settings.category : s.game;
  const [raw, setCfg] = useState<Settings>(() => (editing ? s.room!.settings : { ...settings, category: game }));
  // Défi du jour : questions imposées (10, même tirage pour tous).
  const review = game === 'review';
  const fixed = game === 'daily' || review || game === 'survival';
  const cfg = useMemo(() => fix({ ...raw, category: game, ...(fixed ? { difficulty: 'easy' as const, count: 10, qtype: 'auto' as const } : {}) }, catalog?.zones ?? []), [raw, catalog, game, fixed]);
  const [hostPlays, setHostPlays] = useState(true);
  // Défi du jour déjà joué (sur cet appareil, ou sur le compte depuis un autre appareil) : rien avant demain.
  const [dailyDone, setDailyDone] = useState(() => game === 'daily' && dailyDoneHere());
  useEffect(() => {
    if (game !== 'daily' || editing || !auth) return;
    let alive = true;
    api('/api/daily', { token: auth }).then((r) => { if (alive && r.ok && r.data.me) setDailyDone(true); });
    return () => { alive = false; };
  }, [game, editing, auth]);
  const set = (patch: Partial<Settings>) => setCfg(fix({ ...cfg, ...patch }, catalog?.zones ?? []));

  const cat = catalog?.categories.find((c) => c.id === cfg.category);
  // Progression : en solo, une difficulté se débloque en réussissant la précédente (60 %).
  const locked = cfg.category === 'custom' ? null : lockedFor(me, cfg.category, cfg.difficulty);
  const def = findGame(game);
  const zonesForCat = useMemo(() => (catalog?.zones ?? []).filter((z) => z.categories.includes(cfg.category)), [catalog, cfg.category]);
  const zoneName = (z: ZoneInfo) =>
    z.kind === 'world' ? t('zone.world')
      : z.kind === 'regions' ? (z.names?.[lang] ?? z.id)
        : t(`zone.${z.id.replace(':', '.')}`);

  if (!catalog) return <div className="loading" />;

  const play = (kind: RoomKind) => {
    setSettings(cfg);
    createGame({ kind, settings: cfg, hostPlays: kind === 'room' ? hostPlays : true, reviewToken: review ? auth ?? '' : undefined }, name, lang).then(fail);
  };
  const quick = () => {
    setSettings(cfg);
    net.open('quick');
    net.send({ t: 'quick', settings: cfg });
  };
  const save = () => {
    send({ t: 'settings', settings: cfg });
    go('lobby');
  };

  const regionZones = zonesForCat.filter((z) => z.kind === 'regions');
  const regionCountries = [...new Set(regionZones.map((z) => z.id.split(':')[1]))]
    .map((iso) => ({ iso, z: regionZones.find((z) => z.id.startsWith(`r:${iso}:`))! }))
    .sort((a, b) => zoneName(a.z).localeCompare(zoneName(b.z), lang));
  const [, curIso, curLevel] = cfg.zone.split(':');
  const levels = regionZones.filter((z) => z.id.startsWith(`r:${curIso}:`));
  const showTime = !editing || roomKind !== 'solo';

  return (
    <div className="setup panel">
      <div className={`game-hero ${def?.tint ?? 'tint-ocean'}`}>
        <button type="button" className="back-pill" onClick={() => go(editing ? 'lobby' : cfg.category.startsWith('rev_') ? 'revision' : 'home')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          {editing ? t('setup.back') : cfg.category.startsWith('rev_') ? t('rev.back') : t('setup.backHome')}
        </button>
        {def && <Icon name={def.icon} size={64} />}
      </div>
      <div className="game-intro">
        <h1>{t(`cat.${cfg.category}`)}</h1>
        <p className="muted">{t(`game.${cfg.category}.long`)}</p>
      </div>

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
      ) : !cat?.noZone && (
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

      {game === 'daily' && <DailyBoard />}
      {review && (
        <div className="review-box">
          {!me ? <><p>{t('review.signin')}</p><button type="button" className="btn primary" onClick={() => go('signin')}>{t('account.create')}</button></>
            : me.reviewDue ? <p className="record">{t('review.due', { n: me.reviewDue })}</p>
            : <p className="muted">{t('review.none')}</p>}
        </div>
      )}

      {!fixed && <fieldset className="seg-field">
        <legend>{t('setup.difficulty')}</legend>
        <div className="seg">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button type="button" key={d} aria-pressed={cfg.difficulty === d} onClick={() => set({ difficulty: d })}>
              {lockedFor(me, cfg.category, d) && !editing ? <span aria-hidden="true">🔒 </span> : null}{cfg.category.startsWith('prog_') ? t(`diff.prog.${d}`) : t(`diff.${d}`)}
            </button>
          ))}
        </div>
        {cfg.qtype === 'auto' && (cat?.qtypes.length ?? 0) > 1 && <p className="hint">{t('setup.autoHint')}</p>}
      </fieldset>}

      {!fixed && <details className="more" open={editing}>
        <summary>{t('setup.more')}</summary>
        {(cat?.qtypes.length ?? 0) > 1 && <fieldset className="seg-field">
          <legend>{t('setup.qtype')}</legend>
          <div className="seg">
            {(['auto', 'mix', ...(cat?.qtypes ?? [])] as QType[]).map((q) => (
              <button type="button" key={q} aria-pressed={cfg.qtype === q} onClick={() => set({ qtype: q })}>{t(`qtype.${q}`)}</button>
            ))}
          </div>
        </fieldset>}
        <div className="row2">
          <label className="field">
            <span>{t('setup.count')}</span>
            <select value={cfg.count} onChange={(e) => set({ count: +e.target.value })}>
              {[5, 10, 15, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {showTime && (
            <label className="field">
              <span>{t('setup.time')}</span>
              <select value={cfg.timeLimit} onChange={(e) => set({ timeLimit: +e.target.value })}>
                {[5, 10, 15, 20, 30, 45, 60].filter((n) => n >= LIMITS.minTime).map((n) => <option key={n} value={n}>{t('setup.seconds', { n })}</option>)}
              </select>
            </label>
          )}
        </div>
        {!editing && (
          <>
            <fieldset className="choices">
              <legend>{t('setup.soloMode')}</legend>
              {(['training', 'timed'] as const).map((m) => (
                <label key={m} className="choice">
                  <input type="radio" name="solo" checked={cfg.soloMode === m} onChange={() => set({ soloMode: m })} />
                  <span><strong>{t(`solo.${m}`)}</strong><small>{t(`solo.${m}Hint`)}</small></span>
                </label>
              ))}
            </fieldset>
            <label className="toggle">
              <input type="checkbox" checked={hostPlays} onChange={(e) => setHostPlays(e.target.checked)} />
              <span><strong>{t('setup.hostPlays')}</strong><small>{t('setup.hostPlaysOff')}</small></span>
            </label>
          </>
        )}
      </details>}

      {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}

      {editing ? (
        <div className="actions">
          <button type="button" className="btn primary" onClick={save}>{t('setup.save')}</button>
        </div>
      ) : (
        <>
          <div className="how">
            {locked && <p className="hint">{t('lock.hint')}</p>}
            {!review && !dailyDone && <button type="button" className="text-btn quick-link" onClick={quick}>{t('setup.quickLink')}</button>}
            {printableGame(cfg.category) && <button type="button" className="text-btn quick-link" onClick={() => { go('print'); window.scrollTo(0, 0); }}>🖨️ {t('print.fromGame')}</button>}
          </div>
          {dailyDone && (
            <div className="daily-done" role="status">
              <span aria-hidden="true">✅</span>
              <div><strong>{t('daily.doneTitle')}</strong><small>{t('daily.doneHint', { time: nextDailyTime(lang) })}</small></div>
            </div>
          )}
          {!dailyDone && !(review && (!me || !me.reviewDue)) && (
            <div className="play-bar">
              {locked ? (
                <button type="button" className="how-btn primary" disabled>
                  🔒 {t('setup.soloBtn')}<small>{t('lock.need', { diff: t(`diff.${locked}`) })}</small>
                </button>
              ) : (
                <button type="button" className="how-btn primary" onClick={() => play('solo')}>
                  {t('setup.soloBtn')}<small>{cfg.soloMode === 'timed' ? t('solo.timed') : t('solo.training')}</small>
                </button>
              )}
              {!review && (
                <div className="play-bar-row">
                  <button type="button" className="how-btn" onClick={() => play('duel')}>⚔️ {t('setup.duelShort')}</button>
                  <button type="button" className="how-btn" onClick={() => play('room')}>👥 {t('setup.roomShort')}</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Classement du défi du jour (comptes connectés). */
export function DailyBoard({ refresh = 0 }: { refresh?: number }) {
  const { t, me, auth } = useApp();
  const [data, setData] = useState<{ day: string; players: number; top: { id: string; rank: number; pseudo: string; avatar: string; correct: number; total: number; timeMs: number }[]; me: { rank: number; correct: number; total: number } | null } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api('/api/daily', { token: auth }).then((r) => { if (alive && r.ok) setData(r.data); });
    load();
    // Le score de la partie qui vient de finir arrive un peu après la fin.
    const id = refresh ? setTimeout(load, 1500) : undefined;
    return () => { alive = false; if (id) clearTimeout(id); };
  }, [auth, refresh]);
  if (!data) return null;
  return (
    <section className="daily-board">
      <h2>{t('daily.board')}</h2>
      {data.me ? <p className="record">{t('daily.yourRank', { r: data.me.rank, n: data.players, c: data.me.correct, t: data.me.total })}</p>
        : <p className="muted">{me ? t('daily.notYet') : t('daily.signin')}</p>}
      {data.top.length > 0 ? (
        <ol className="lb">
          {data.top.slice(0, 10).map((r) => (
            <li key={r.id} className={me?.id === r.id ? 'me' : ''}>
              <span className="lb-rank">{r.rank}</span><span aria-hidden="true">{r.avatar}</span>
              <span className="lb-name" dir="auto">{r.pseudo}</span>
              <span className="lb-xp">{r.correct}/{r.total} · {Math.round(r.timeMs / 1000)} s</span>
            </li>
          ))}
        </ol>
      ) : <p className="muted">{t('daily.empty')}</p>}
    </section>
  );
}

/** Garde une zone compatible avec la catégorie choisie. */
function fix(c: Settings, zones: ZoneInfo[]): Settings {
  const ok = zones.find((z) => z.id === c.zone && z.categories.includes(c.category));
  if (ok) return c;
  if (c.category === 'macities') return { ...c, zone: 'r:MA:groups' };
  const pref = c.category === 'regions' ? zones.find((z) => z.id === 'r:MA:groups') ?? zones.find((z) => z.categories.includes('regions')) : zones.find((z) => z.id === 'world');
  return { ...c, zone: pref?.id ?? 'world' };
}
