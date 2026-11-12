// Panneau de réglages unique (bouton avatar en haut) : compte, langue, style, son, voix, avis.
import { Avatar } from './screens/Collect';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { LANGS, LIMITS, type Lang } from '../shared/protocol';
import { FeedbackForm } from './Feedback';
import { LANG_LABELS } from './i18n';
import { isMuted, setMuted, sfx } from './sound';
import { autoRead, canSpeak, setAutoRead } from './speech';
import { useApp } from './state';

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export function SettingsButton() {
  const { t, me } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="settings-btn" aria-label={t('settings.open')} aria-expanded={open} onClick={() => setOpen(true)}>
        {me ? <Avatar emoji={me.avatar} look={me.look} size={30} /> : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></g></svg>
        )}
      </button>
      {/* Hors de la barre du haut : son flou d'arrière-plan piégerait le panneau. */}
      {open && createPortal(<SettingsSheet onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang, look, setLook, me, go, name, setName, s } = useApp();
  const [muted, setM] = useState(isMuted());
  const [auto, setAuto] = useState(autoRead());
  const [view, setView] = useState<'main' | 'feedback'>('main');
  const [editName, setEditName] = useState(false);
  const inGame = s.screen === 'game' || s.screen === 'lobby';
  const nav = (to: 'profile' | 'signin') => { onClose(); go(to); window.scrollTo(0, 0); };
  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label={t('settings.title')} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-sheet">
        <i className="sheet-grip" aria-hidden="true" />
        <button type="button" className="sheet-close" aria-label={t('fb.close')} onClick={onClose}>×</button>
        {view === 'feedback' ? <FeedbackForm onDone={onClose} /> : (
          <>
            {me ? (
              <button type="button" className="set-account" onClick={() => nav('profile')} disabled={inGame}>
                <span className="set-avatar" aria-hidden="true"><Avatar emoji={me.avatar} look={me.look} size={40} /></span>
                <span><strong dir="auto">{me.pseudo}</strong><small>{t('profile.level', { n: me.level })} · {t(`rank.${me.title}`)}</small></span>
                {!inGame && <span className="set-go">{t('settings.myProfile')} ›</span>}
              </button>
            ) : (
              <div className="set-account guest">
                <span className="set-avatar" aria-hidden="true">🙂</span>
                {editName ? (
                  <input value={name} maxLength={LIMITS.maxNameLength} autoFocus onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && setEditName(false)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && setEditName(false)} aria-label={t('home.name')} dir="auto" />
                ) : (
                  <span><strong dir="auto">{name}</strong><button type="button" className="text-btn" onClick={() => setEditName(true)}>{t('home.editName')}</button></span>
                )}
                {!inGame && <button type="button" className="btn primary" onClick={() => nav('signin')}>{t('settings.signin')}</button>}
              </div>
            )}
            <div className="set-row">
              <span>{t('lang.label')}</span>
              <div className="seg set-seg">
                {LANGS.map((l) => <button type="button" key={l} aria-pressed={lang === l} onClick={() => setLang(l as Lang)} lang={l}>{l === 'ar' ? 'ع' : l.toUpperCase()}</button>)}
              </div>
            </div>
            <p className="set-lang-name">{LANG_LABELS[lang]}</p>
            <div className="set-row">
              <span>{t('settings.style')}</span>
              <div className="seg set-seg">
                <button type="button" aria-pressed={look === 'classic'} onClick={() => setLook('classic')}>{t('look.classic')}</button>
                <button type="button" aria-pressed={look === 'kids'} onClick={() => setLook('kids')}>{t('look.kids')}</button>
              </div>
            </div>
            <div className="set-row">
              <span>{t('settings.sound')}</span>
              <Switch on={!muted} label={t('settings.sound')} onChange={(v) => { setMuted(!v); setM(!v); if (v) sfx.good(); }} />
            </div>
            {canSpeak() && (
              <div className="set-row">
                <span>{t('settings.readAloud')}<small>{t('settings.readAloudHint')}</small></span>
                <Switch on={auto} label={t('settings.readAloud')} onChange={(v) => { setAuto(v); setAutoRead(v); }} />
              </div>
            )}
            <button type="button" className="set-row link" onClick={() => setView('feedback')}><span>💬 {t('fb.link')}</span><span>›</span></button>
          </>
        )}
      </div>
    </div>
  );
}
