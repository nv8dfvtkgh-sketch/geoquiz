// Grands événements du moment : bloc « En direct » de l'accueil et page « Événements ».
import { useApp } from '../state';
import { liveFor, liveStatus, useEvents, weekFor, type LiveInfo } from '../events';
import { COLLECTORS } from '../../shared/stickers';
import { loadAlbum } from '../album';

function Badge({ l, short }: { l: LiveInfo; short?: boolean }) {
  const { t } = useApp();
  const st = liveStatus(l);
  const label = st.k === 'soon' ? t('live.inDays', { n: st.n }) : t(`live.${st.k}`);
  if (short) return <small className="lv-when">{label}</small>;
  return <span className={`lv-badge ${st.k}`}>{st.k !== 'over' && <span className="lv-dot" aria-hidden="true" />}{label}</span>;
}

/** Bloc de l'accueil : une vignette par événement, « Tout voir » ouvre la page. */
export function LiveBlock() {
  const { t, lang, openGame, go } = useApp();
  const live = liveFor(useEvents());
  if (!live.length) return null;
  return (
    <section className="lv-block" aria-label={t('live.title')}>
      <div className="lv-head">
        <span className="lv-dot" aria-hidden="true" /><strong>{t('live.title')}</strong>
        <button type="button" className="lv-all" onClick={() => go('events')}>{t('live.all')} ›</button>
      </div>
      <div className="lv-chips">
        {live.map((l) => (
          <button type="button" key={l.id} className={`lv-chip ${l.color ?? ''}`} onClick={() => openGame(l.game)}>
            <span className="lv-emo" aria-hidden="true">{l.emoji}</span>
            <span className="lv-name">{(l.names[lang] ?? l.names.fr).split(/\s*:\s*/)[0]}</span>
            <Badge l={l} short />
          </button>
        ))}
      </div>
    </section>
  );
}

/** Page « Événements » : une grande carte par événement. */
export function EventsScreen() {
  const { t, lang, openGame, go } = useApp();
  const evs = useEvents();
  const live = liveFor(evs);
  const wk = weekFor(evs);
  const album = loadAlbum();
  const fmt = (d: string) => new Date(d).toLocaleDateString(lang === 'ar' ? 'ar-MA' : lang, { day: 'numeric', month: 'short' });
  return (
    <div className="lv-page">
      <button type="button" className="back-link" onClick={() => go('home')}>‹ {t('nav.home')}</button>
      <h1>{t('live.page')}</h1>
      <p className="lv-sub">{t('live.sub')}</p>
      {!live.length && <p className="lv-empty">{t('live.empty')}</p>}
      {live.map((l) => {
        const col = l.game === 'week' && wk && l.to ? COLLECTORS.find((c) => c.event === wk.id) : undefined;
        const dates = !l.to ? t('live.since', { date: fmt(l.from) }) : l.from === l.to ? fmt(l.from) : `${fmt(l.from)} – ${fmt(l.to)}`;
        return (
          <article key={l.id} className="lv-card">
            <div className={`lv-top ${l.color ?? ''}`}>
              <span className="lv-big" aria-hidden="true">{l.emoji}</span>
              <div><strong>{l.names[lang] ?? l.names.fr}</strong><small>{[l.place?.[lang] ?? l.place?.fr, dates].filter(Boolean).join(' · ')}</small></div>
              <Badge l={l} />
            </div>
            <div className="lv-bottom">
              {col && <span className={`sticker mini collector ${col.theme} ${album[col.id] ? '' : 'locked'}`} aria-hidden="true">{col.e}</span>}
              <div className="lv-meta"><b>{t('live.count', { n: l.count })}</b><span>{col ? (album[col.id] ? t('col.won') : t('live.collector')) : t(`live.about.${l.game}`)}</span></div>
              <button type="button" className="btn primary lv-play" onClick={() => openGame(l.game)}>{t('home.play')}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
