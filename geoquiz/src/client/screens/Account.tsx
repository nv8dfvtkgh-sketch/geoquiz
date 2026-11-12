// Compte joueur : inscription / connexion, profil (niveau, badges, progression), classement,
// et carte des gains en fin de partie.
import { useEffect, useMemo, useState } from 'react';
import { useEvents } from '../events';
import { AVATARS, BADGES, type AgeGroup, type Me, type Reward } from '../../shared/protocol';
import { api, starsOf } from '../account';
import { FAMILIES, Icon } from '../games';
import { useApp, type Look } from '../state';

// Codes ISO des pays (membres de l'ONU et quelques autres), Maroc en tête.
const ISO = 'MA AF ZA AL DZ DE AD AO AG SA AR AM AU AT AZ BS BH BD BB BE BZ BJ BT BY MM BO BA BW BR BN BG BF BI KH CM CA CV CF CL CN CY CO KM CG CD KR KP CR CI HR CU DK DJ DM EG AE EC ER ES EE SZ US ET FJ FI FR GA GM GE GH GR GD GT GN GQ GW GY HT HN HU IN ID IQ IR IE IS IL IT JM JP JO KZ KE KG KI XK KW LA LS LV LB LR LY LI LT LU MK MG MY MW MV ML MT MH MR MU MX FM MD MC MN ME MZ NA NR NP NI NE NG NO NZ OM UG UZ PK PW PS PA PG PY NL PE PH PL PT QA DO CZ RO GB RU RW KN SM VC LC SB SV WS ST SN RS SC SL SG SK SI SO SD SS LK SE CH SR SY TJ TW TZ TD TH TL TG TO TT TN TM TR TV UA UY VU VA VE VN YE ZM ZW'.split(' ');
export function countryName(code: string, lang: string) {
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code; } catch { return code; }
}
const flagOf = (code?: string) => (code ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');

function CountrySelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const { t, lang } = useApp();
  const list = useMemo(() => {
    const [first, ...rest] = ISO;
    return [first, ...rest.sort((a, b) => countryName(a, lang).localeCompare(countryName(b, lang), lang))];
  }, [lang]);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('account.countryNone')}</option>
      {list.map((c) => <option key={c} value={c}>{flagOf(c)} {countryName(c, lang)}</option>)}
    </select>
  );
}

function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useApp();
  return (
    <div className="avatars" role="radiogroup" aria-label={t('account.avatar')}>
      {AVATARS.map((a) => (
        <button type="button" key={a} role="radio" aria-checked={value === a} className={value === a ? 'on' : ''} onClick={() => onChange(a)}>{a}</button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ inscription / connexion
/**
 * Formulaire de compte. Avec `pickStyle`, on choisit aussi le style (premier passage) et on
 * peut continuer en invité.
 */
export function AccountForm({ pickStyle, onDone }: { pickStyle?: boolean; onDone?: () => void }) {
  const { t, name, setName, setLook, look, signIn } = useApp();
  const [mode, setMode] = useState<'signup' | 'login' | 'guest'>('signup');
  const [pseudo, setPseudo] = useState(name);
  const [password, setPassword] = useState('');
  // Âge déjà choisi au premier lancement.
  const [age, setAge] = useState<AgeGroup | ''>(() => { try { return (localStorage.getItem('gq.age') as AgeGroup) || ''; } catch { return ''; } });
  const [email, setEmail] = useState('');
  const [optin, setOptin] = useState(false);
  const [country, setCountry] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [style, setStyle] = useState<Look | null>(look);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (pickStyle) document.documentElement.dataset.look = style ?? 'classic'; }, [style, pickStyle]);
  // Le style se propose selon l'âge (modifiable).
  const chooseAge = (a: AgeGroup) => { setAge(a); if (pickStyle && !style) setStyle(a === 'u13' ? 'kids' : 'classic'); };

  const finish = () => { if (pickStyle) setLook(style ?? 'classic'); onDone?.(); window.scrollTo(0, 0); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (mode === 'guest') {
      if (!pseudo.trim()) return setErr('account.pseudoFormat');
      setName(pseudo.trim());
      return finish();
    }
    if (pickStyle && !style && mode === 'signup') return setErr('account.styleMissing');
    setBusy(true);
    const r = mode === 'signup'
      ? await api('/api/account/register', { body: { pseudo: pseudo.trim(), password, age, email: age === 'u13' ? undefined : email, optin, country, avatar } })
      : await api('/api/account/login', { body: { pseudo: pseudo.trim(), password } });
    setBusy(false);
    if (!r.ok) return setErr(r.data?.error ?? 'server');
    signIn(r.data.token, r.data.me as Me);
    finish();
  };

  const tabs = (['signup', 'login'] as const);
  const providers = useProviders();
  return (
    <form className="account-form" onSubmit={submit} noValidate>
      {mode !== 'guest' && (
        <div className="seg account-tabs">
          {tabs.map((m) => <button type="button" key={m} aria-pressed={mode === m} onClick={() => { setMode(m); setErr(''); }}>{t(`account.${m}`)}</button>)}
        </div>
      )}
      {mode !== 'guest' && (providers.google || providers.facebook) && (
        <div className="social">
          {providers.google && (
            <a className="social-btn google" href="/api/auth/google/start" onClick={() => { if (pickStyle && style) setLook(style); }}>
              <GoogleG /> {t('account.withGoogle')}
            </a>
          )}
          {providers.facebook && (
            <a className="social-btn facebook" href="/api/auth/facebook/start" onClick={() => { if (pickStyle && style) setLook(style); }}>
              <FacebookF /> {t('account.withFacebook')}
            </a>
          )}
          <small className="muted center">{t('account.socialAge')}</small>
          <div className="or"><span>{t('account.or')}</span></div>
        </div>
      )}
      <label className="field">
        <span>{mode === 'guest' ? t('home.name') : t('account.pseudo')}</span>
        <input value={pseudo} maxLength={20} onChange={(e) => setPseudo(e.target.value)} autoComplete={mode === 'login' ? 'username' : 'nickname'} placeholder={t('home.namePlaceholder')} />
        {mode === 'signup' && <small className="muted">{t('account.pseudoHint')}</small>}
      </label>
      {mode !== 'guest' && (
        <label className="field">
          <span>{t('account.password')}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          {mode === 'signup' && <small className="muted">{t('account.passwordHint')}</small>}
        </label>
      )}
      {mode === 'signup' && (
        <>
          <fieldset>
            <legend>{t('account.age')}</legend>
            <div className="seg">
              {(['u13', '13-17', '18+'] as AgeGroup[]).map((a) => <button type="button" key={a} aria-pressed={age === a} onClick={() => chooseAge(a)}>{t(`account.age.${a}`)}</button>)}
            </div>
          </fieldset>
          {age && age !== 'u13' && (
            <>
              <label className="field">
                <span>{t('account.email')}</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
                <small className="muted">{t('account.emailHint')}</small>
              </label>
              <label className="check">
                <input type="checkbox" checked={optin} onChange={(e) => setOptin(e.target.checked)} />
                <span>{t('account.optin')}</span>
              </label>
            </>
          )}
          {age === 'u13' && <p className="notice">{t('account.kidNote')}</p>}
          <details className="more">
            <summary>{t('account.optional')}</summary>
            <label className="field">
              <span>{t('account.country')}</span>
              <CountrySelect id="acc-country" value={country} onChange={setCountry} />
            </label>
            <div className="field">
              <span>{t('account.avatar')}</span>
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>
          </details>
        </>
      )}
      {pickStyle && mode !== 'login' && (
        <fieldset>
          <legend>{t('welcome.style')}</legend>
          <div className="look-cards">
            {(['kids', 'classic'] as Look[]).map((l) => (
              <button type="button" key={l} className={`look-card ${l}`} aria-pressed={style === l} onClick={() => setStyle(l)}>
                <span className={`look-preview ${l}`} aria-hidden="true">
                  {l === 'kids' ? <><i>🦁</i><i>🍕</i><i>🚀</i></> : <><i /><i /><i /></>}
                </span>
                <strong>{t(`look.${l}`)}</strong>
                <small>{t(`look.${l}Hint`)}</small>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}
      <button className="btn primary wide" disabled={busy}>
        {mode === 'signup' ? t('account.create') : mode === 'login' ? t('account.signin') : t('welcome.go')}
      </button>
      {mode === 'login' && <p className="muted small center">{t('account.forgot')}</p>}
      {pickStyle && (
        <button type="button" className="text-btn center" onClick={() => { setMode(mode === 'guest' ? 'signup' : 'guest'); setErr(''); }}>
          {mode === 'guest' ? t('account.backToAccount') : t('account.guest')}
        </button>
      )}
      {mode === 'guest' && <p className="muted small center">{t('account.guestNote')}</p>}
    </form>
  );
}

// ------------------------------------------------------------------ Google / Facebook
let providersCache: Promise<{ google: boolean; facebook: boolean }> | null = null;
function useProviders() {
  const [p, setP] = useState({ google: false, facebook: false });
  useEffect(() => {
    providersCache ??= api('/api/auth/providers').then((r) => (r.ok ? r.data : { google: false, facebook: false }));
    providersCache.then(setP);
  }, []);
  return p;
}
/** Logos officiels des boutons de connexion (chartes Google et Facebook). */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
function FacebookF() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.62 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

/** Fin d'inscription après Google / Facebook : pseudo et tranche d'âge (13 ans et plus). */
export function OAuthFinish() {
  const { t, s, look, setLook, signIn, go } = useApp();
  const ticket = s.oauthTicket ?? '';
  const [info, setInfo] = useState<{ provider: string; email: string; name: string } | null>(null);
  const [pseudo, setPseudo] = useState('');
  const [age, setAge] = useState<AgeGroup | ''>('');
  const [email, setEmail] = useState('');
  const [optin, setOptin] = useState(false);
  const [country, setCountry] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/api/account/oauth?ticket=${encodeURIComponent(ticket)}`).then((r) => {
      if (r.ok) { setInfo(r.data); setPseudo(r.data.name ?? ''); } else setErr(r.data?.error ?? 'account.ticketExpired');
    });
  }, [ticket]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const r = await api('/api/account/oauth', { body: { ticket, pseudo: pseudo.trim(), age, email: info?.email ? undefined : email, optin, country, avatar } });
    setBusy(false);
    if (!r.ok) return setErr(r.data?.error ?? 'server');
    signIn(r.data.token, r.data.me);
    if (!look) setLook('classic');
    go('home');
  };
  return (
    <div className="welcome panel">
      <div className="welcome-head">
        <img className="welcome-logo" src="/logo.svg" width="72" height="72" alt="" />
        <h1>{t('oauth.title')}</h1>
        <p>{info ? t('oauth.hint', { provider: info.provider === 'google' ? 'Google' : 'Facebook' }) : ''}</p>
      </div>
      {!info ? (err ? <><p className="error">{t(`err.${err}`)}</p><button type="button" className="btn primary" onClick={() => go('signin')}>{t('account.signin')}</button></> : <div className="loading" />) : (
        <form className="account-form" onSubmit={submit} noValidate>
          <label className="field">
            <span>{t('account.pseudo')}</span>
            <input value={pseudo} maxLength={20} onChange={(e) => setPseudo(e.target.value)} autoComplete="nickname" />
            <small className="muted">{t('account.pseudoHint')}</small>
          </label>
          <fieldset>
            <legend>{t('account.age')}</legend>
            <div className="seg">
              {(['13-17', '18+'] as AgeGroup[]).map((a) => <button type="button" key={a} aria-pressed={age === a} onClick={() => setAge(a)}>{t(`account.age.${a}`)}</button>)}
            </div>
            <small className="muted">{t('oauth.kids')}</small>
          </fieldset>
          {info.email ? <p className="muted small">{t('oauth.email', { email: info.email })}</p> : (
            <label className="field">
              <span>{t('account.email')}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={optin} onChange={(e) => setOptin(e.target.checked)} />
            <span>{t('account.optin')}</span>
          </label>
          <details className="more">
            <summary>{t('account.optional')}</summary>
            <label className="field"><span>{t('account.country')}</span><CountrySelect id="oa-country" value={country} onChange={setCountry} /></label>
            <div className="field"><span>{t('account.avatar')}</span><AvatarPicker value={avatar} onChange={setAvatar} /></div>
          </details>
          {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}
          <button className="btn primary wide" disabled={busy}>{t('account.create')}</button>
        </form>
      )}
    </div>
  );
}

export function SignIn() {
  const { t, go, s } = useApp();
  return (
    <div className="welcome panel">
      <button type="button" className="back-link" onClick={() => go('home')}>‹ {t('setup.backHome')}</button>
      <div className="welcome-head">
        <img className="welcome-logo" src="/logo.svg" width="72" height="72" alt="" />
        <h1>{t('account.title')}</h1>
        <p>{t('account.why')}</p>
      </div>
      {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}
      <AccountForm onDone={() => go('home')} />
    </div>
  );
}

// ------------------------------------------------------------------ niveau et badges
const BADGE_ICON: Record<string, string> = {
  first: '🎯', games10: '🔟', games50: '🏅', games200: '🏆', perfect: '💯', hardHero: '🧗', winner: '👑', duelWin: '⚔️',
  battleWin: '🛡️', explorer: '🧭', collector: '🗂️', streak3: '🔥', streak7: '🌟', flags100: '🚩', morocco: '🇲🇦', polyglot: '🗣️', tourney: '🏟️',
};
export const badgeIcon = (id: string) => BADGE_ICON[id] ?? '🏅';

export function LevelBar({ level, levelXp, levelNeed, title }: { level: number; levelXp: number; levelNeed: number; title: number }) {
  const { t } = useApp();
  const pct = Math.min(100, Math.round((levelXp / levelNeed) * 100));
  return (
    <div className="level">
      <div className="level-head"><strong>{t('profile.level', { n: level })}</strong><span>{t(`rank.${title}`)}</span></div>
      <div className="level-bar" role="progressbar" aria-valuemin={0} aria-valuemax={levelNeed} aria-valuenow={levelXp}><span style={{ width: `${pct}%` }} /></div>
      <small className="muted">{t('profile.toNext', { xp: levelNeed - levelXp })}</small>
    </div>
  );
}

function Stars({ list, always }: { list: boolean[] | null; always?: boolean }) {
  if (!list || (!always && !list.some(Boolean))) return null;
  return <span className="stars" aria-hidden="true">{list.map((on, i) => <i key={i} className={on ? 'on' : ''}>★</i>)}</span>;
}
export { Stars };

// ------------------------------------------------------------------ profil
export function Profile() {
  const { t, me, auth, go, signOut, setMe, lang, look, setLook } = useApp();
  const [edit, setEdit] = useState(false);
  const events = useEvents();
  if (!me) return <SignIn />;
  const evBadges = (events?.all ?? []).filter((e) => me.badges[`ev_${e.id}`]);
  const acc = me.answered ? Math.round((me.correct / me.answered) * 100) : 0;
  return (
    <div className="profile panel">
      <button type="button" className="back-link" onClick={() => go('home')}>‹ {t('setup.backHome')}</button>
      <header className="profile-head">
        <span className="profile-avatar" aria-hidden="true">{me.avatar}</span>
        <div>
          <h1 dir="auto">{me.pseudo}</h1>
          <p className="muted">{me.country ? `${flagOf(me.country)} ${countryName(me.country, lang)} · ` : ''}{t('profile.since', { date: new Date(me.createdAt).toLocaleDateString(lang) })}</p>
        </div>
      </header>
      <LevelBar level={me.level} levelXp={me.levelXp} levelNeed={me.levelNeed} title={me.title} />
      <div className="profile-stats">
        <div><strong>{me.xp}</strong><span>{t('profile.xp')}</span></div>
        <div><strong>{me.games}</strong><span>{t('profile.games')}</span></div>
        <div><strong>{acc} %</strong><span>{t('profile.accuracy')}</span></div>
        <div><strong>{me.wins}</strong><span>{t('profile.wins')}</span></div>
        <div><strong>{me.days.streak}</strong><span>{t('profile.streak')}</span></div>
        <div><strong>{me.weekXp}</strong><span>{t('profile.week')}</span></div>
      </div>
      <button type="button" className="btn primary wide" onClick={() => go('leaderboard')}>{t('lb.title')}</button>
      <button type="button" className="btn ghost wide" onClick={() => go('classes')}>🏫 {t('class.title')}</button>

      <h2>{t('profile.badges', { n: BADGES.filter((b) => me.badges[b]).length, total: BADGES.length })}</h2>
      <ul className="badges">
        {BADGES.map((b) => (
          <li key={b} className={me.badges[b] ? 'on' : ''}>
            <span className="badge-icon" aria-hidden="true">{badgeIcon(b)}</span>
            <strong>{t(`badge.${b}`)}</strong>
            <small>{t(`badge.${b}.how`)}</small>
          </li>
        ))}
      </ul>

      {evBadges.length > 0 && (
        <>
          <h2>{t('profile.eventBadges')}</h2>
          <ul className="badges">
            {evBadges.map((e) => <li key={e.id} className="on"><span className="badge-icon" aria-hidden="true">{e.emoji}</span><strong>{e.names[lang]}</strong></li>)}
          </ul>
        </>
      )}

      <h2>{t('profile.progress')}</h2>
      <p className="muted small">{t('profile.progressHint')}</p>
      <ul className="progress-list">
        {FAMILIES.flatMap((f) => f.games.filter((g) => !g.soon)).map((g) => {
          const c = me.cats[g.id];
          return (
            <li key={g.id}>
              <Icon name={g.icon} size={20} />
              <span>{t(`cat.${g.id}`)}</span>
              <small className="muted">{c ? t('profile.played', { n: c.games }) : t('profile.notYet')}</small>
              <Stars list={starsOf(me, g.id)} always />
            </li>
          );
        })}
      </ul>

      <h2>{t('profile.settings')}</h2>
      <fieldset>
        <legend>{t('welcome.style')}</legend>
        <div className="seg">
          {(['kids', 'classic'] as Look[]).map((l) => <button type="button" key={l} aria-pressed={look === l} onClick={() => setLook(l)}>{t(`look.${l}`)}</button>)}
        </div>
      </fieldset>
      {edit ? <EditProfile me={me} auth={auth!} onDone={(m) => { if (m) setMe(m); setEdit(false); }} /> : (
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => setEdit(true)}>{t('profile.edit')}</button>
          <button type="button" className="btn ghost" onClick={signOut}>{t('account.signout')}</button>
        </div>
      )}
    </div>
  );
}

function EditProfile({ me, auth, onDone }: { me: Me; auth: string; onDone: (m?: Me) => void }) {
  const { t, signOut } = useApp();
  const [avatar, setAvatar] = useState(me.avatar);
  const [country, setCountry] = useState(me.country ?? '');
  const [email, setEmail] = useState(me.email ?? '');
  const [optin, setOptin] = useState(me.optin);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [del, setDel] = useState(false);
  const [err, setErr] = useState('');
  const kid = me.age === 'u13';
  const save = async () => {
    setErr('');
    const body: any = { avatar, country, ...(kid ? {} : { email, optin }) };
    if (newPassword) Object.assign(body, me.hasPassword ? { password, newPassword } : { newPassword });
    const r = await api<Me>('/api/account', { method: 'PUT', body, token: auth });
    if (!r.ok) return setErr((r.data as any)?.error ?? 'server');
    onDone(r.data);
  };
  const remove = async () => {
    const r = await api('/api/account/delete', { body: { password }, token: auth });
    if (!r.ok) return setErr(r.data?.error ?? 'server');
    signOut();
  };
  return (
    <div className="edit-profile">
      <div className="field"><span>{t('account.avatar')}</span><AvatarPicker value={avatar} onChange={setAvatar} /></div>
      <label className="field"><span>{t('account.country')}</span><CountrySelect id="edit-country" value={country} onChange={setCountry} /></label>
      {!kid && (
        <>
          <label className="field"><span>{t('account.email')}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <label className="check"><input type="checkbox" checked={optin} onChange={(e) => setOptin(e.target.checked)} /><span>{t('account.optin')}</span></label>
        </>
      )}
      <details className="more">
        <summary>{me.hasPassword ? t('profile.changePassword') : t('profile.createPassword')}</summary>
        {me.hasPassword && <label className="field"><span>{t('profile.currentPassword')}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>}
        <label className="field"><span>{t('profile.newPassword')}</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></label>
      </details>
      {err && <p className="error" role="alert">{t(`err.${err}`)}</p>}
      <div className="row-actions">
        <button type="button" className="btn primary" onClick={save}>{t('profile.save')}</button>
        <button type="button" className="btn ghost" onClick={() => onDone()}>{t('profile.cancel')}</button>
      </div>
      <details className="more danger-zone" open={del} onToggle={(e) => setDel((e.target as HTMLDetailsElement).open)}>
        <summary>{t('profile.delete')}</summary>
        <p className="small">{t('profile.deleteNote')}</p>
        <label className="field"><span>{me.hasPassword ? t('profile.currentPassword') : t('profile.typePseudo')}</span><input type={me.hasPassword ? 'password' : 'text'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" /></label>
        <button type="button" className="btn danger-btn" disabled={!password} onClick={remove}>{t('profile.deleteConfirm')}</button>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ classement
interface LbRow { id: string; rank: number; xp: number; pseudo: string; avatar: string; country?: string }
export function LeaderboardScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, me, auth, go, lang } = useApp();
  const [onlyMine, setOnlyMine] = useState(false);
  const [data, setData] = useState<{ week: string; top: LbRow[]; me: LbRow | null } | null>(null);
  useEffect(() => {
    const c = onlyMine && me?.country ? `?country=${me.country}` : '';
    api(`/api/leaderboard${c}`, { token: auth }).then((r) => r.ok && setData(r.data));
  }, [onlyMine, auth, me?.country]);
  return (
    <div className="leaderboard-screen panel">
      {!embedded && <button type="button" className="back-link" onClick={() => go(me ? 'profile' : 'home')}>‹ {me ? t('profile.title') : t('setup.backHome')}</button>}
      {!embedded && <h1>{t('lb.title')}</h1>}
      <p className="muted">{t('lb.hint')}</p>
      {me?.country && (
        <div className="seg">
          <button type="button" aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>{t('lb.world')}</button>
          <button type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>{flagOf(me.country)} {countryName(me.country, lang)}</button>
        </div>
      )}
      {!data ? <div className="loading" /> : data.top.length === 0 ? <p className="muted">{t('lb.empty')}</p> : (
        <ol className="lb">
          {data.top.map((r) => (
            <li key={r.id} className={r.id === me?.id ? 'me' : ''}>
              <span className="lb-rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
              <span className="lb-avatar" aria-hidden="true">{r.avatar}</span>
              <span className="lb-name" dir="auto">{r.pseudo} {r.country ? <small>{flagOf(r.country)}</small> : null}</span>
              <strong>{r.xp} XP</strong>
            </li>
          ))}
        </ol>
      )}
      {data?.me && data.me.rank > 50 && <p className="lb-mine">{t('lb.yourRank', { rank: data.me.rank, xp: data.me.xp })}</p>}
      {!me && <button type="button" className="btn primary wide" onClick={() => go('signin')}>{t('account.create')}</button>}
    </div>
  );
}

// ------------------------------------------------------------------ fin de partie
export function RewardCard() {
  const { t, s, me, go, lang } = useApp();
  const events = useEvents();
  const r: Reward | undefined = s.reward;
  if (!s.finished?.players.some((p) => p.id === s.you)) return null; // animateur qui ne joue pas
  if (!me) {
    return (
      <div className="reward guest">
        <p>{t('reward.guest')}</p>
        <button type="button" className="btn primary" onClick={() => go('signin')}>{t('account.create')}</button>
      </div>
    );
  }
  if (!r) return <div className="reward"><p className="muted">{t('reward.saving')}</p></div>;
  return (
    <div className={`reward ${r.levelUp ? 'up' : ''}`}>
      <div className="reward-xp"><strong>+{r.xp} XP</strong>{r.levelUp && <span className="reward-up">{t('reward.levelUp', { n: r.level })}</span>}</div>
      <LevelBar level={r.level} levelXp={r.levelXp} levelNeed={r.levelNeed} title={r.title} />
      {r.unlocked && <p className="reward-unlock">🔓 {t('reward.unlocked', { diff: t(`diff.${r.unlocked}`) })}</p>}
      {r.best !== undefined && !r.unlocked && <p className="muted small">{t('reward.best', { acc: r.best })}</p>}
      {r.badges.length > 0 && (
        <ul className="reward-badges">
          {r.badges.map((b) => {
            const ev = b.startsWith('ev_') ? events?.all.find((e) => `ev_${e.id}` === b) : undefined;
            return <li key={b}><span aria-hidden="true">{ev ? ev.emoji : badgeIcon(b)}</span><strong>{ev ? ev.names[lang] : t(`badge.${b}`)}</strong></li>;
          })}
        </ul>
      )}
    </div>
  );
}
