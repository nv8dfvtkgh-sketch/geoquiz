import { useEffect, useState } from 'react';
import type { RoomMode } from '../../shared/protocol';
import { net } from '../net';
import { useApp } from '../state';
import { SettingsSummary } from './common';
import { ReactionBar, ReactionLayer, TeamPicker } from '../Party';

export function Lobby() {
  const { t, s, send, go } = useApp();
  const [copied, setCopied] = useState(false);
  const room = s.room;
  if (!room) return <div className="loading" />;
  const link = `${location.origin}/join/${room.code}`;
  const duel = room.kind === 'duel';
  const enough = room.players.length >= 2;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch {
      const i = document.createElement('input'); i.value = link; document.body.append(i); i.select(); document.execCommand('copy'); i.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className={`lobby ${s.isHost && !room.hostPlays ? 'presenter' : ''}`}>
      <ReactionLayer big={s.isHost && !room.hostPlays} />
      <section className="share panel">
        <p className="label">{t('lobby.code')}</p>
        <p className="code" aria-live="polite">{room.code.split('').map((c, i) => <span key={i}>{c}</span>)}</p>
        <p className="muted">{t('lobby.share')}</p>
        <p className="link">{link.replace(/^https?:\/\//, '')}</p>
        <div className="share-row">
          <QrCode text={link} />
          <button type="button" className="btn ghost" onClick={copy}>{copied ? t('lobby.copied') : t('lobby.copy')}</button>
        </div>
      </section>

      <section className="players panel">
        <h2>{t('lobby.players', { n: room.players.length, max: room.maxPlayers })}</h2>
        {room.players.length === 0 ? <p className="muted">{t('lobby.empty')}</p> : (
          <ul className="plist">
            {room.players.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'offline'}>
                <span className="pname" dir="auto">{p.name}</span>
                <span className="tags">
                  {p.id === room.hostId && <em>{t('lobby.host')}</em>}
                  {p.id === s.you && <em>{t('lobby.you')}</em>}
                  {!p.connected && <em>{t('lobby.offline')}</em>}
                </span>
                {s.isHost && p.id !== s.you && (
                  <button type="button" className="text-btn" onClick={() => send({ t: 'kick', playerId: p.id })}>{t('lobby.kick')}</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {room.kind === 'room' && <ModePicker />}
        {room.kind !== 'solo' && <PartyOptions />}
        <SettingsSummary settings={room.settings} />
        {room.kind !== 'solo' && room.players.length > 1 && <ReactionBar />}
        {s.error && <p className="error" role="alert">{t(`err.${s.error}`)}</p>}
        <div className="actions">
          {duel ? (
            <p className="waiting">{enough ? '…' : t('lobby.waitOpponent')}</p>
          ) : s.isHost ? (
            <>
              <button type="button" className="btn ghost" onClick={() => go('setup', 'edit')}>{t('lobby.edit')}</button>
              <button type="button" className="btn primary" disabled={!enough} onClick={() => send({ t: 'start' })}>
                {enough ? t('lobby.start') : t('lobby.needTwo')}
              </button>
            </>
          ) : (
            <p className="waiting">{t('lobby.waitHost')}</p>
          )}
        </div>
      </section>
    </div>
  );
}

/** Mode de la salle : l'hôte choisit, les joueurs voient le choix et la règle. */
function ModePicker() {
  const { t, s, send } = useApp();
  const room = s.room!;
  const mode: RoomMode = room.settings.mode ?? 'classic';
  const teams = room.settings.teams ?? 2;
  const set = (patch: { mode?: RoomMode; teams?: number }) => send({ t: 'settings', settings: { ...room.settings, ...patch } });
  return (
    <div className="mode-picker">
      <h3>{t('mode.title')}</h3>
      {s.isHost ? (
        <div className="mode-list" role="radiogroup" aria-label={t('mode.title')}>
          {(['classic', 'battle', 'teams', 'buzzer'] as RoomMode[]).map((m) => (
            <button type="button" key={m} role="radio" aria-checked={mode === m} className={`mode-card ${mode === m ? 'on' : ''}`} onClick={() => set({ mode: m })}>
              <strong>{t(`mode.${m}`)}</strong>
              <span>{t(`mode.${m}.hint`)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mode-chosen"><strong>{t(`mode.${mode}`)}</strong> {t(`mode.${mode}.hint`)}</p>
      )}
      {mode === 'teams' && s.isHost && (
        <div className="seg teams-seg" aria-label={t('mode.teamsCount')}>
          {[2, 3, 4].map((n) => (
            <button type="button" key={n} aria-pressed={teams === n} onClick={() => set({ teams: n })}>{t('mode.nTeams', { n })}</button>
          ))}
        </div>
      )}
      {mode === 'teams' && <TeamPicker />}
    </div>
  );
}

/** Options de fête : coffres surprises et mise finale (l'hôte choisit, les autres voient). */
function PartyOptions() {
  const { t, s, send } = useApp();
  const room = s.room!;
  const st = room.settings;
  const toggle = (k: 'chests' | 'wager') => send({ t: 'settings', settings: { ...st, [k]: !st[k] } });
  const chestsOk = st.mode !== 'battle';
  if (!s.isHost) {
    const on = [chestsOk && st.chests && `🎁 ${t('party.chests')}`, st.wager && `🎲 ${t('party.wager')}`].filter(Boolean);
    return on.length ? <p className="mode-chosen">{on.join(' · ')}</p> : null;
  }
  return (
    <div className="party-opts">
      {chestsOk && (
        <label className="toggle">
          <input type="checkbox" checked={!!st.chests} onChange={() => toggle('chests')} />
          <span><strong>🎁 {t('party.chests')}</strong><small>{t('party.chestsHint')}</small></span>
        </label>
      )}
      <label className="toggle">
        <input type="checkbox" checked={!!st.wager} onChange={() => toggle('wager')} />
        <span><strong>🎲 {t('party.wager')}</strong><small>{t('party.wagerHint')}</small></span>
      </label>
    </div>
  );
}

/** QR code dessiné dans le navigateur (aucun service externe). */
function QrCode({ text }: { text: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((m) => (m.default ?? m).toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))
      .then((s: string) => alive && setSvg(s))
      .catch(() => {});
    return () => { alive = false; };
  }, [text]);
  return svg ? <div className="qr" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}

export function QuickWait() {
  const { t, send, go } = useApp();
  return (
    <div className="quick panel">
      <div className="pulse" aria-hidden="true" />
      <p>{t('quick.waiting')}</p>
      <button type="button" className="btn ghost" onClick={() => { send({ t: 'cancelQuick' }); net.close(); go('home'); }}>{t('quick.cancel')}</button>
    </div>
  );
}
