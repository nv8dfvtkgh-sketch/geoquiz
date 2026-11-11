import { useEffect, useState } from 'react';
import { net } from '../net';
import { useApp } from '../state';
import { SettingsSummary } from './common';

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
        <SettingsSummary settings={room.settings} />
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
