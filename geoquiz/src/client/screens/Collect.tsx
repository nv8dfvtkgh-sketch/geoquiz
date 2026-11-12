// Album d'autocollants, autocollant gagné en fin de partie, avatar habillé.
import { useEffect, useState } from 'react';
import { ALBUM, LOOK_BY_ID, LOOK_ITEMS, STICKERS, isUnlocked, type Look, type LookSlot, type Unlock } from '../../shared/stickers';
import { useApp } from '../state';
import { api } from '../account';
import { claimSticker, giftSticker, loadAlbum, type Album } from '../album';
import { PuzzleBack } from './Puzzles';

const BY_ID = Object.fromEntries(STICKERS.map((x) => [x.id, x]));

export function useAlbum(): Album {
  const [a, setA] = useState(loadAlbum);
  useEffect(() => {
    const on = () => setA(loadAlbum());
    window.addEventListener('gq:album', on);
    return () => window.removeEventListener('gq:album', on);
  }, []);
  return a;
}

// ---------------------------------------------------------------- avatar habillé
/** Avatar (emoji) avec sa tenue : chapeau en haut, badge en bas, cadre coloré. */
export function Avatar({ emoji, look, size = 40 }: { emoji: string; look?: Look; size?: number }) {
  const hat = look?.hat ? LOOK_BY_ID[look.hat]?.e : undefined;
  const pin = look?.pin ? LOOK_BY_ID[look.pin]?.e : undefined;
  const frame = look?.frame ? LOOK_BY_ID[look.frame]?.e : undefined;
  return (
    <span className={`av ${frame === 'zellige' ? 'zellige' : ''}`} style={{ '--s': `${size}px`, '--ring': frame && frame !== 'zellige' ? frame : 'transparent' } as React.CSSProperties} aria-hidden="true">
      <span className="av-face">{emoji}</span>
      {hat && <span className="av-hat">{hat}</span>}
      {pin && <span className="av-pin">{pin}</span>}
    </span>
  );
}

function unlockText(t: (k: string, p?: Record<string, string | number>) => string, u: Unlock) {
  switch (u.k) {
    case 'free': return t('look.free');
    case 'level': return t('look.level', { n: u.n });
    case 'games': return t('look.games', { n: u.n });
    case 'badge': return t('look.badge', { name: t(`badge.${u.id}`) });
    case 'stickers': return t('look.stickers', { n: u.n });
    case 'page': return t('look.page');
  }
}

/** Habiller son avatar (profil) : seuls les objets débloqués se choisissent. */
export function AvatarDresser() {
  const { t, me, auth, setMe } = useApp();
  const album = useAlbum();
  const [look, setLook] = useState<Look>(me?.look ?? {});
  const [saved, setSaved] = useState(false);
  if (!me) return null;
  const ctx = { level: me.level, games: me.games, badges: me.badges, album: { ...(me.album ?? {}), ...album } };
  const pick = async (slot: LookSlot, id: string | undefined) => {
    const next = { ...look, [slot]: id };
    setLook(next); setSaved(false);
    const r = await api('/api/account', { method: 'PUT', body: { look: next }, token: auth });
    if (r.ok) { setMe(r.data); setLook(r.data.look ?? {}); setSaved(true); }
  };
  return (
    <section className="dresser panel">
      <h2>{t('look.title')}</h2>
      <div className="dresser-preview"><Avatar emoji={me.avatar} look={look} size={88} /></div>
      {(['hat', 'pin', 'frame'] as LookSlot[]).map((slot) => (
        <div key={slot} className="dresser-row">
          <h3>{t(`look.${slot}`)}</h3>
          <div className="dresser-items">
            <button type="button" className={!look[slot] ? 'on' : ''} onClick={() => pick(slot, undefined)} aria-label={t('look.none')}>∅</button>
            {LOOK_ITEMS.filter((x) => x.slot === slot).map((x) => {
              const ok = isUnlocked(x.u, ctx);
              return (
                <button type="button" key={x.id} className={`${look[slot] === x.id ? 'on' : ''} ${ok ? '' : 'locked'}`} disabled={!ok} title={unlockText(t, x.u)} onClick={() => pick(slot, x.id)}>
                  {slot === 'frame' ? <i className={`swatch ${x.e === 'zellige' ? 'zellige' : ''}`} style={x.e === 'zellige' ? undefined : { background: x.e }} /> : <span>{x.e}</span>}
                  {!ok && <small>🔒 {unlockText(t, x.u)}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {saved && <p className="record">{t('look.saved')}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- autocollant gagné
/** Petite carte en bas de l'écran quand on gagne un autocollant. */
export function StickerToast() {
  const { t, lang, go } = useApp();
  const [st, setSt] = useState<{ id: string; isNew: boolean; k: number } | null>(null);
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { id: string; isNew: boolean };
      setSt({ ...d, k: Date.now() });
    };
    window.addEventListener('gq:sticker', on);
    return () => window.removeEventListener('gq:sticker', on);
  }, []);
  useEffect(() => { if (!st) return; const id = setTimeout(() => setSt(null), 5000); return () => clearTimeout(id); }, [st]);
  if (!st) return null;
  const x = BY_ID[st.id];
  if (!x) return null;
  return (
    <div className="sticker-toast" role="status" key={st.k}>
      <span className={`sticker mini ${x.rare ? 'rare' : ''}`} aria-hidden="true">{x.e}</span>
      <span className="sticker-toast-text">
        <strong>{st.isNew ? t('album.new') : t('album.double')}</strong>
        <small dir="auto">{x.n[lang]}</small>
      </span>
      <button type="button" className="text-btn" onClick={() => { setSt(null); go('album'); }}>{t('album.open')}</button>
    </div>
  );
}

// ---------------------------------------------------------------- l'album
export function AlbumScreen() {
  const { t, lang, me } = useApp();
  const album = useAlbum();
  const [page, setPage] = useState(ALBUM[0].id);
  const [gift, setGift] = useState<{ id: string; code?: string; busy?: boolean } | null>(null);
  const [claim, setClaim] = useState('');
  const [claimMsg, setClaimMsg] = useState('');
  const owned = STICKERS.filter((x) => album[x.id]).length;
  const p = ALBUM.find((x) => x.id === page)!;
  const dups = STICKERS.filter((x) => (album[x.id] ?? 0) >= 2);
  const doGift = async (id: string) => {
    setGift({ id, busy: true });
    const code = await giftSticker(id);
    setGift(code ? { id, code } : null);
  };
  const doClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await claimSticker(claim);
    if ('error' in r) setClaimMsg(t(`err.${r.error}`));
    else { setClaimMsg(t('album.received', { name: BY_ID[r.id]?.n[lang] ?? '' })); setClaim(''); window.dispatchEvent(new CustomEvent('gq:sticker', { detail: { id: r.id, isNew: true } })); }
  };
  return (
    <div className="album-page panel">
      <PuzzleBack />
      <h1>{t('album.title')}</h1>
      <p className="muted">{t('album.hint')}</p>
      <p className="passport-total"><strong>{owned}</strong> / {STICKERS.length} {t('album.stickers')}</p>
      {!me && <p className="hint">{t('album.guest')}</p>}
      <div className="seg album-tabs">
        {ALBUM.map((x) => {
          const n = x.stickers.filter((s) => album[s.id]).length;
          return <button type="button" key={x.id} aria-pressed={page === x.id} onClick={() => setPage(x.id)}>{x.e} <small>{n}/{x.stickers.length}</small></button>;
        })}
      </div>
      <h2 className="album-h">{p.e} {p.n[lang]}{p.stickers.every((s) => album[s.id]) && <span className="album-done"> ✓ {t('album.complete')}</span>}</h2>
      <ul className="album-grid">
        {p.stickers.map((x, i) => {
          const n = album[x.id] ?? 0;
          return (
            <li key={x.id} className={`${n ? 'have' : 'empty'} ${x.rare ? 'rare' : ''}`} style={{ '--rot': `${((i * 37) % 9) - 4}deg` } as React.CSSProperties}>
              <span className="sticker">{n ? x.e : <b>{i + 1}</b>}</span>
              <span className="sticker-name" dir="auto">{n ? x.n[lang] : '?'}</span>
              {n > 1 && <span className="sticker-count">×{n}</span>}
            </li>
          );
        })}
      </ul>

      <section className="album-trade">
        <h2>{t('album.trade')}</h2>
        <p className="muted">{t('album.tradeHint')}</p>
        {dups.length ? (
          <div className="dup-row">
            {dups.map((x) => <button type="button" key={x.id} className="sticker mini" onClick={() => doGift(x.id)} title={x.n[lang]} disabled={!!gift?.busy}>{x.e}<small>×{album[x.id]}</small></button>)}
          </div>
        ) : <p className="hint">{t('album.noDups')}</p>}
        {gift?.code && (
          <div className="gift-code">
            <p>{t('album.giftReady', { name: BY_ID[gift.id]?.n[lang] ?? '' })}</p>
            <p className="code">{gift.code.split('').map((c, i) => <span key={i}>{c}</span>)}</p>
            <button type="button" className="btn" onClick={() => { try { void navigator.clipboard.writeText(gift.code!); } catch { /* ignoré */ } }}>{t('lobby.copy')}</button>
          </div>
        )}
        <form className="join" onSubmit={doClaim}>
          <label htmlFor="gift-code" className="sr">{t('album.claim')}</label>
          <input id="gift-code" className="code-input" value={claim} onChange={(e) => { setClaim(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setClaimMsg(''); }} placeholder="ABC234" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          <button className="btn primary" disabled={claim.length !== 6}>{t('album.claim')}</button>
        </form>
        {claimMsg && <p className="record" role="status">{claimMsg}</p>}
      </section>
    </div>
  );
}
