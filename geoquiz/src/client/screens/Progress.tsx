// Passeport du voyageur (un tampon par pays maîtrisé) et ligue de la semaine.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../account';
import { useApp } from '../state';

const CONTINENTS = ['africa', 'europe', 'asia', 'north-america', 'south-america', 'oceania'];
const INK = ['#1E5AA8', '#1F8A5B', '#E8590C', '#B98B00'];

interface C { iso: string; name: string; continent: string; capital: boolean }

function Back() {
  const { t, go } = useApp();
  return <button type="button" className="back-link" onClick={() => { history.replaceState(null, '', '/'); go('home'); }}>‹ {t('setup.backHome')}</button>;
}

/** Pays tamponné : trouvé dans Pays, Drapeaux et Capitales (au moins une fois chacun). */
export function PassportScreen() {
  const { t, me, lang, go } = useApp();
  const [list, setList] = useState<C[] | null>(null);
  const [open, setOpen] = useState('africa');
  useEffect(() => { fetch(`/api/countries?lang=${lang}`).then((r) => r.json()).then(setList).catch(() => setList([])); }, [lang]);
  const found = useMemo(() => ({
    countries: new Set(me?.cats.countries?.found ?? []), flags: new Set(me?.cats.flags?.found ?? []), capitals: new Set(me?.cats.capitals?.found ?? []),
  }), [me]);
  const done = (c: C) => found.countries.has(c.iso) && found.flags.has(c.iso) && (!c.capital || found.capitals.has(c.iso));
  if (!list) return <div className="loading" />;
  const total = list.filter(done).length;
  return (
    <div className="passport panel">
      <Back />
      <h1>{t('passport.title')}</h1>
      <p className="muted">{t('passport.hint')}</p>
      {!me && <div className="review-box"><p>{t('passport.signin')}</p><button type="button" className="btn primary" onClick={() => go('signin')}>{t('account.create')}</button></div>}
      <p className="passport-total"><strong>{total}</strong> / {list.length} {t('passport.stamps')}</p>
      <div className="seg passport-tabs">
        {CONTINENTS.map((c) => {
          const cs = list.filter((x) => x.continent === c);
          return <button type="button" key={c} aria-pressed={open === c} onClick={() => setOpen(c)}>{t(`zone.c.${c}`)} <small>{cs.filter(done).length}/{cs.length}</small></button>;
        })}
      </div>
      <ul className="stamp-grid">
        {list.filter((x) => x.continent === open).map((c, i) => {
          const ok = done(c);
          return (
            <li key={c.iso} className={ok ? 'stamped' : ''} style={{ '--ink': INK[i % INK.length], '--rot': `${((i * 37) % 17) - 8}deg` } as React.CSSProperties}>
              <span className="stamp-ring">
                {ok ? <img src={`/api/flag/${c.iso}.svg`} alt="" loading="lazy" /> : <span className="stamp-q">?</span>}
              </span>
              <span className="stamp-name" dir="auto">{c.name}</span>
              <span className="stamp-dots" aria-label={t('passport.parts')}>
                <i className={found.countries.has(c.iso) ? 'on' : ''} title={t('cat.countries')} />
                <i className={found.flags.has(c.iso) ? 'on' : ''} title={t('cat.flags')} />
                {c.capital && <i className={found.capitals.has(c.iso) ? 'on' : ''} title={t('cat.capitals')} />}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hint">{t('passport.legend')}</p>
    </div>
  );
}

const DIV_COLORS = ['#B26B3A', '#8E9AAF', '#E0A800', '#2B6CD4', '#5BC0EB'];

interface LeagueView {
  week: string; div: number; rows: { id: string; rank: number; xp: number; pseudo: string; avatar: string }[]; me: string; up: number; down: number; endsAt: number;
  last?: { div: number; rank: number; size: number; move: 'up' | 'down' | 'stay' };
}

export function LeagueScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, me, auth, go } = useApp();
  const [v, setV] = useState<LeagueView | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (auth) api('/api/league', { token: auth }).then((r) => r.ok && setV(r.data)); }, [auth]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(id); }, []);
  if (!me) return (
    <div className="league panel">{!embedded && <Back />}<h1>{t('league.title')}</h1><p className="muted">{t('league.hint')}</p>
      <div className="review-box"><p>{t('league.signin')}</p><button type="button" className="btn primary" onClick={() => go('signin')}>{t('account.create')}</button></div></div>
  );
  if (!v) return <div className="loading" />;
  const left = Math.max(0, v.endsAt - now);
  const days = Math.floor(left / 864e5), hours = Math.floor(left / 36e5) % 24;
  const n = v.rows.length;
  return (
    <div className="league panel">
      {!embedded && <Back />}
      <div className="league-head" style={{ '--div': DIV_COLORS[v.div] } as React.CSSProperties}>
        <span className="div-badge" aria-hidden="true">{['🥉', '🥈', '🥇', '💎', '👑'][v.div]}</span>
        <div>
          <h1>{t(`league.div.${v.div}`)}</h1>
          <p className="muted">{t('league.ends', { d: days, h: hours })}</p>
        </div>
      </div>
      {v.last && (
        <p className={`league-last ${v.last.move}`}>
          {v.last.move === 'up' ? t('league.wentUp', { div: t(`league.div.${v.div}`), r: v.last.rank })
            : v.last.move === 'down' ? t('league.wentDown', { div: t(`league.div.${v.div}`), r: v.last.rank })
            : t('league.stayed', { r: v.last.rank })}
        </p>
      )}
      <p className="muted">{t('league.hint')}</p>
      {n === 0 ? <p className="review-box">{t('league.empty')}</p> : (
        <ol className="lb league-list">
          {v.rows.map((r) => {
            const zone = r.rank <= v.up && v.div < 4 ? 'up' : v.down && r.rank > n - v.down && v.div > 0 ? 'down' : '';
            return (
              <li key={r.id} className={`${r.id === v.me ? 'me' : ''} ${zone}`}>
                <span className="lb-rank">{r.rank}</span>
                <span aria-hidden="true">{r.avatar}</span>
                <span className="lb-name" dir="auto">{r.pseudo}</span>
                <span className="lb-xp">{r.xp} XP</span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="league-legend"><span className="up">▲ {t('league.upZone', { n: v.up })}</span>{v.div > 0 && <span className="down">▼ {t('league.downZone', { n: 5 })}</span>}</p>
    </div>
  );
}
