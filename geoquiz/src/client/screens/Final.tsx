import { useEffect, useMemo, useState } from 'react';
import { formatTime } from '../i18n';
import { sfx } from '../sound';
import { useApp } from '../state';
import { Leaderboard, TeamBars, TeamChip } from './common';
import { RewardCard } from './Account';
import { DailyBoard } from './Setup';

export function Final() {
  const { t, s, send, leave } = useApp();
  const f = s.finished;
  const room = s.room;
  useEffect(() => { sfx.end(); }, []);
  const best = useBest();
  if (!f || !room) return <div className="loading" />;
  const kind = room.kind;

  if (kind === 'solo' && f.solo) {
    return (
      <div className="final panel">
        <h1>{t('final.title')}</h1>
        <div className="solo-stats">
          <div><span>{t('final.accuracy')}</span><strong>{f.solo.accuracy} %</strong><small>{t('final.correctCount', { c: f.solo.correct, n: f.solo.total })}</small></div>
          <div><span>{t('final.time')}</span><strong>{formatTime(f.solo.timeMs)}</strong></div>
        </div>
        {room.settings.soloMode === 'timed' && best && (
          <p className={best.isNew ? 'record' : 'muted'}>{best.isNew ? t('final.newBest') : t('final.best', { acc: best.acc, time: formatTime(best.time) })}</p>
        )}
        {room.settings.category === 'daily' && <DailyShare />}
        <RewardCard />
        {room.settings.category === 'daily' && <DailyBoard refresh={1} />}
        <Recap />
        <div className="actions">
          <button type="button" className="btn ghost" onClick={leave}>{t('final.home')}</button>
          {room.settings.category !== 'daily' && <button type="button" className="btn primary" onClick={() => send({ t: 'rematch' })}>{t('final.again')}</button>}
        </div>
      </div>
    );
  }

  const [first, second] = f.players;
  if (kind === 'duel') {
    const draw = second && first.score === second.score;
    const iWin = !draw && first.id === s.you;
    const voted = room.rematchVotes?.includes(s.you!);
    const asked = (room.rematchVotes?.length ?? 0) > 0 && !voted;
    return (
      <div className="final panel">
        <h1 className={draw ? '' : iWin ? 'win' : 'lose'}>{draw ? t('final.draw') : iWin ? t('final.youWin') : t('final.youLose')}</h1>
        {!draw && <p className="muted" dir="auto">{t('final.win', { name: first.name })}</p>}
        <Leaderboard players={f.players} you={s.you} />
        <RewardCard />
        <Recap />
        {asked && <p className="record">{t('final.rematchAsked')}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={leave}>{t('final.home')}</button>
          <button type="button" className="btn primary" disabled={voted} onClick={() => send({ t: 'rematch' })}>
            {voted ? t('final.rematchWaiting') : t('final.rematch')}
          </button>
        </div>
      </div>
    );
  }

  const podium = f.players.slice(0, 3);
  return (
    <div className="final panel">
      <h1>{t('final.title')}</h1>
      {f.teams && f.teams.length > 0 && (
        <>
          <p className="record"><TeamChip team={f.teams[0].id} /> {t('team.wins')}</p>
          <TeamBars teams={f.teams} myTeam={f.players.find((p) => p.id === s.you)?.team} />
        </>
      )}
      {room.settings.mode === 'battle' && f.players[0] && !f.players[0].out && (
        <p className="record" dir="auto">{t('battle.winner', { name: f.players[0].name })}</p>
      )}
      <div className="podium">
        {[1, 0, 2].map((i) => podium[i] && (
          <div key={podium[i].id} className={`step s${i + 1} ${podium[i].id === s.you ? 'me' : ''}`}>
            <span className="pname" dir="auto">{podium[i].name}</span>
            <span className="pts">{t('play.score', { n: podium[i].score })}</span>
            <span className="block">{i + 1}</span>
          </div>
        ))}
      </div>
      <Leaderboard players={f.players} you={s.you} />
      <RewardCard />
      <div className="actions">
        <button type="button" className="btn ghost" onClick={leave}>{t('final.home')}</button>
        {s.isHost ? (
          <button type="button" className="btn primary" onClick={() => send({ t: 'rematch' })}>{t('final.backLobby')}</button>
        ) : <p className="waiting">{t('final.waitHost')}</p>}
      </div>
    </div>
  );
}

/** Défi du jour : résultat en carrés de couleur, à partager sans dévoiler les réponses. */
function DailyShare() {
  const { t, s, lang } = useApp();
  const [done, setDone] = useState(false);
  const f = s.finished!;
  const mine = f.recap.map((x) => x.results.find((r) => r.id === s.you));
  const grid = mine.map((r) => (r?.correct ? '🟩' : '🟥')).join('');
  const ok = mine.filter((r) => r?.correct).length;
  const day = new Date().toLocaleDateString(lang === 'ar' ? 'ar-MA' : lang, { day: 'numeric', month: 'short' });
  const text = `${t('daily.shareTitle', { day })}\n${grid} ${ok}/${mine.length}\n${location.origin}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setDone(true); }
    } catch { /* partage annulé */ }
  };
  return (
    <div className="daily-share">
      <p className="daily-grid" aria-label={`${ok}/${mine.length}`}>{grid}</p>
      <button type="button" className="btn primary" onClick={share}>{done ? t('daily.copied') : t('daily.share')}</button>
    </div>
  );
}

function Recap() {
  const { t, s } = useApp();
  const f = s.finished!;
  const players = s.room!.kind === 'duel' ? f.players : f.players.filter((p) => p.id === s.you);
  return (
    <details className="recap" open={s.room!.kind !== 'room'}>
      <summary>{t('final.recap')}</summary>
      <table>
        {players.length > 1 && (
          <thead><tr><th /><th />{players.map((p) => <th key={p.id} dir="auto">{p.name}</th>)}</tr></thead>
        )}
        <tbody>
          {f.recap.map((r) => (
            <tr key={r.index}>
              <td className="n">{r.index + 1}</td>
              <td dir="auto">{r.label}</td>
              {players.map((p) => {
                const res = r.results.find((x) => x.id === p.id);
                return <td key={p.id} className={res?.correct ? 'good-txt' : 'bad-txt'}>{res?.correct ? (s.room!.kind === 'solo' ? '✓' : `+${res.points}`) : '✗'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Meilleur score solo (mode chrono), enregistré dans le navigateur. */
function useBest() {
  const { s } = useApp();
  return useMemo(() => {
    const f = s.finished;
    const room = s.room;
    if (!f?.solo || room?.kind !== 'solo' || room.settings.soloMode !== 'timed') return null;
    const st = room.settings;
    const key = `gq.best:${st.category}|${st.zone}|${st.difficulty}|${st.qtype}|${st.count}`;
    let prev: { acc: number; time: number } | null = null;
    try { prev = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch {}
    const cur = { acc: f.solo.accuracy, time: f.solo.timeMs };
    const isNew = !prev || cur.acc > prev.acc || (cur.acc === prev.acc && cur.time < prev.time);
    if (isNew) try { localStorage.setItem(key, JSON.stringify(cur)); } catch {}
    return { ...(isNew ? cur : prev!), isNew };
  }, [s.finished]);
}
