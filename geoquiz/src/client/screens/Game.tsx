import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuestionMsg, Reveal } from '../../shared/protocol';
import { MapView, type Mark } from '../MapView';
import { sfx } from '../sound';
import { useApp } from '../state';
import { RoadSign } from '../RoadSign';
import { Jersey, MysteryFlag, OrderBoard, RaceTrack, SoundClip } from '../GameExtras';
import { autoRead, canSpeak, setAutoRead, speak, stopSpeaking } from '../speech';
import { FlagImg, Hearts, Leaderboard, TeamBars, TeamChip } from './common';

export function Game() {
  const { s } = useApp();
  const q = s.question;
  if (!q || !s.room) return <div className="loading" />;
  const presenter = s.isHost && !s.room.hostPlays;
  return presenter ? <Presenter q={q} /> : <Play q={q} />;
}

/** Question courte + nom du lieu en grand (évite les accords : « la Chine », « de la Chine »…). */
function Prompt({ q, open = false }: { q: QuestionMsg; open?: boolean }) {
  const { t } = useApp();
  const label = t(q.promptKey, q.params);
  return (
    <div className="prompt" key={q.index} data-cat={q.category}>
      <ReadAloud q={q} label={label} />
      <div className="prompt-text">
        {q.params.name ? (<><p className="ask">{label}</p><h1 dir="auto" className={q.category === 'emoji' ? 'rebus' : q.category === 'truefalse' || q.params.name.length > 40 ? 'long' : ''}>{q.params.name}</h1></>) : <h1 dir="auto">{label}</h1>}
      </div>
      {q.emoji && <span className="prompt-emoji" aria-hidden="true">{q.emoji}</span>}
      {q.sign && <RoadSign id={q.sign} />}
      {q.kit && <Jersey kit={q.kit} />}
      {q.sound && <SoundClip key={q.index} token={q.sound} />}
      {q.flag && (q.category === 'flagreveal'
        ? <MysteryFlag q={q} open={open}><FlagImg token={q.flag} className="flag big" /></MysteryFlag>
        : <FlagImg token={q.flag} className="flag big" />)}
      {q.image && <img className="quiz-photo" src={`/api/img/${q.image}`} alt="" draggable={false} />}
      {q.shape && <Shape shape={q.shape} small={q.kind === 'map'} />}
    </div>
  );
}

/** Lecture à voix haute de la question et des choix (voix de l'appareil). */
function ReadAloud({ q, label }: { q: QuestionMsg; label: string }) {
  const { t, lang } = useApp();
  const [auto, setAuto] = useState(autoRead);
  const parts = () => {
    const name = q.params.name && !/^[\p{Extended_Pictographic}\s\u200d\ufe0f]+$/u.test(q.params.name) ? q.params.name : '';
    const opts = q.kind === 'mcq' || q.kind === 'order' ? (q.options ?? []).map((o) => o.label ?? '') : [];
    return [label, name, ...opts];
  };
  useEffect(() => { if (auto) speak(parts(), lang); return () => stopSpeaking(); }, [q.index, auto]);
  if (!canSpeak()) return null;
  return (
    <div className="read-aloud">
      <button type="button" className="speak-btn" aria-label={t('play.readAloud')} title={t('play.readAloud')} onClick={() => speak(parts(), lang)}>🔊</button>
      <label className="speak-auto"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); setAutoRead(e.target.checked); }} /> {t('play.readAuto')}</label>
    </div>
  );
}

/** Silhouette d'un pays (Silhouettes de pays). */
function Shape({ shape, small }: { shape: NonNullable<QuestionMsg['shape']>; small?: boolean }) {
  const pad = Math.max(shape.w, shape.h) * 0.06;
  return (
    <svg
      className={`shape ${small ? 'small' : ''}`}
      viewBox={`${-pad} ${-pad} ${shape.w + pad * 2} ${shape.h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="?"
    >
      <path d={shape.d} />
    </svg>
  );
}

/** Révélation de la bonne réponse : immédiate en solo, en fin de manche à plusieurs. */
function useReveal(q: QuestionMsg): Reveal | undefined {
  const { s } = useApp();
  if (s.room?.kind === 'solo') return s.fb?.q === q.index ? s.fb.reveal : undefined;
  return s.reveal?.q === q.index ? s.reveal.reveal : undefined;
}

// ------------------------------------------------------------------ joueur
function Play({ q }: { q: QuestionMsg }) {
  const { t, s, send } = useApp();
  const fb = s.fb?.q === q.index ? s.fb : undefined;
  const reveal = useReveal(q);
  const solo = s.room!.kind === 'solo';
  const me = s.room!.players.find((p) => p.id === s.you);
  // Battle Royale : un joueur éliminé regarde la partie sans pouvoir répondre.
  const locked = !!fb?.done || !!reveal || (q.remaining !== null && s.reveal?.q === q.index) || !!me?.out;

  // Sons au retour du serveur.
  const lastSeen = useRef('');
  useEffect(() => {
    if (!fb) return;
    const k = `${fb.q}:${fb.tried.length}`;
    if (k === lastSeen.current) return;
    lastSeen.current = k;
    fb.correct ? sfx.good() : sfx.bad();
  }, [fb]);

  const answer = (value: string) => {
    if (locked || fb?.tried.includes(value)) return;
    send({ t: 'answer', q: q.index, value });
  };

  const marks = useMemo(() => {
    const m: Record<string, Mark> = {};
    for (const v of fb?.tried ?? []) m[v] = 'picked';
    if (fb?.lastBad && !fb.done) m[fb.lastBad] = 'bad';
    if (fb?.done && fb.correct && fb.value) m[fb.value] = 'good';
    if (reveal?.id && !(fb?.correct)) m[reveal.id] = 'reveal';
    if (reveal?.id && fb?.correct) m[reveal.id] = 'good';
    return m;
  }, [fb, reveal]);

  return (
    <div className={`play kind-${q.kind}`}>
      <div className="hud">
        <span className="qnum">{t('play.question', { i: q.index + 1, n: q.total })}</span>
        {!solo && me && <span className="myscore">{t('play.score', { n: me.score })}</span>}
        <Timer q={q} stopped={locked} />
      </div>

      <ModeBar />

      {q.category === 'tables' && <RaceTrack players={s.room!.players} you={s.you} total={q.total} />}

      <Prompt q={q} open={locked} />

      {q.kind === 'pin' && q.map && <PinPlay q={q} locked={locked} reveal={reveal} mine={fb?.value} onSubmit={answer} />}

      {q.kind === 'order' && <OrderBoard q={q} locked={locked} reveal={reveal} onSubmit={answer} />}

      {q.kind === 'map' && q.map && (
        <MapView spec={q.map} marks={marks} onPick={locked ? undefined : answer} t={t} />
      )}

      {q.kind !== 'map' && q.map && q.highlight && (
        <MapView spec={q.map} highlight={q.highlight} marks={reveal?.id ? { [reveal.id]: fb?.correct ? 'good' : 'reveal' } : {}} t={t} />
      )}

      {q.kind === 'mcq' && <Options q={q} chosen={fb?.value} correctId={reveal?.optionId ?? (fb?.correct ? fb.value : undefined)} wrongId={fb && !fb.correct ? fb.value : undefined} onPick={locked ? undefined : answer} />}

      {q.kind === 'type' && <TypeBox key={q.index} disabled={locked} onSubmit={answer} numeric={q.category === 'calc'} />}

      <Status q={q} />
    </div>
  );
}

function Options({ q, chosen, correctId, wrongId, onPick }: { q: QuestionMsg; chosen?: string; correctId?: string; wrongId?: string; onPick?: (v: string) => void }) {
  const flags = q.options!.some((o) => o.flag);
  return (
    <div className={`options ${flags ? 'flags' : ''}`}>
      {q.options!.map((o, i) => {
        const cls = o.id === correctId ? 'good' : o.id === wrongId ? 'bad' : o.id === chosen ? 'chosen' : '';
        return (
          <button type="button" key={o.id} className={`opt ${cls}`} disabled={!onPick && !cls} onClick={() => onPick?.(o.id)} style={{ '--i': i } as React.CSSProperties}>
            {o.flag && <FlagImg token={o.flag} />}
            {o.label && (!o.flag || q.category === 'higher') && <span dir="auto" className={o.flag ? 'opt-sub' : ''}>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** « Où est-ce ? » : toucher la carte pose l'épingle, puis on valide. */
function PinPlay({ q, locked, reveal, mine, onSubmit }: { q: QuestionMsg; locked: boolean; reveal?: Reveal; mine?: string; onSubmit: (v: string) => void }) {
  const { t } = useApp();
  const [pin, setPin] = useState<[number, number] | null>(null);
  useEffect(() => setPin(null), [q.index]);
  const sent = mine ? (mine.split(',').map(Number) as [number, number]) : undefined;
  return (
    <>
      <MapView spec={q.map!} onPin={locked ? undefined : setPin} pins={{ mine: sent ?? pin ?? undefined, target: reveal?.point }} t={t} />
      {!locked && (
        <div className="pin-actions">
          <span className="muted">{pin ? t('play.pinMove') : t('play.pinHint')}</span>
          <button type="button" className="btn primary" disabled={!pin} onClick={() => pin && onSubmit(`${pin[0]},${pin[1]}`)}>{t('play.validate')}</button>
        </div>
      )}
    </>
  );
}

function TypeBox({ disabled, onSubmit, numeric }: { disabled: boolean; onSubmit: (v: string) => void; numeric?: boolean }) {
  const { t } = useApp();
  const [v, setV] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return (
    <form className="typebox" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()); }}>
      <input ref={ref} value={v} onChange={(e) => setV(e.target.value)} disabled={disabled} placeholder={t('play.typeHere')} dir="auto" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="send" inputMode={numeric ? 'numeric' : 'text'} />
      <button className="btn primary" disabled={disabled || !v.trim()}>{t('play.validate')}</button>
    </form>
  );
}

/** Ligne d'état sous la question + panneau de fin de manche. */
function Status({ q }: { q: QuestionMsg }) {
  const { t, s, send } = useApp();
  const fb = s.fb?.q === q.index ? s.fb : undefined;
  const room = s.room!;
  const solo = room.kind === 'solo';
  const reveal = useReveal(q);
  const roundEnd = !solo && s.reveal?.q === q.index ? s.reveal : undefined;

  if (solo && fb?.done) {
    const last = q.index + 1 >= q.total;
    return (
      <div className={`result-bar ${fb.correct ? 'ok' : 'ko'}`} role="status">
        <div>
          <strong>{fb.correct ? t('play.correct') : t('play.wrong')}</strong>
          {fb.km !== undefined && <span className="km">{t('play.km', { n: fb.km.toLocaleString() })} · {t('play.points', { n: fb.points })}</span>}
          {!fb.correct && reveal && <span dir="auto">{t('play.answerWas', { label: reveal.label })}</span>}
          {fb.correct && q.kind === 'type' && reveal && <span dir="auto">{t('play.spelling', { label: reveal.label })}</span>}
          {fb.correct && q.kind !== 'type' && ['monuments', 'truefalse', 'stadiums', 'higher', 'timeline', 'pin', 'chain', 'timezones'].includes(q.category) && reveal && <span dir="auto">{reveal.label}</span>}
          {reveal?.credit && <small className="credit" dir="auto">{t('play.photo', { credit: reveal.credit })}</small>}
        </div>
        {reveal?.flag && <FlagImg token={reveal.flag} className="flag small" />}
        {room.settings.soloMode !== 'timed' && (
          <button type="button" className="btn primary" autoFocus onClick={() => send({ t: 'next' })}>{last ? t('play.finish') : t('play.next')}</button>
        )}
      </div>
    );
  }

  if (roundEnd) {
    const mine = roundEnd.results.find((r) => r.id === s.you);
    const deltas = Object.fromEntries(roundEnd.results.map((r) => [r.id, r.points]));
    return (
      <div className={`sheet ${mine?.correct ? 'ok' : 'ko'}`} role="status">
        <div className="sheet-head">
          <div>
            <strong>{mine?.correct ? t('play.correct') : fb ? t('play.wrong') : t('play.timeUp')}</strong>
            {mine?.km !== undefined && <span className="km">{t('play.km', { n: mine.km.toLocaleString() })}</span>}
            <span dir="auto">{t('play.answerWas', { label: roundEnd.reveal.label })}</span>
            {roundEnd.reveal.credit && <small className="credit" dir="auto">{t('play.photo', { credit: roundEnd.reveal.credit })}</small>}
          </div>
          {roundEnd.reveal.flag && <FlagImg token={roundEnd.reveal.flag} className="flag small" />}
          {mine && mine.points > 0 && <span className="gain">{t('play.points', { n: mine.points })}</span>}
          {mine && mine.points < 0 && <span className="loss">{mine.points}</span>}
        </div>
        {roundEnd.battle && <p className="battle-line">{battleLine(t, roundEnd.battle, s.you!, room)}</p>}
        {roundEnd.teams ? <TeamBars teams={roundEnd.teams} myTeam={room.players.find((p) => p.id === s.you)?.team} />
          : <Leaderboard players={roundEnd.players} you={s.you} limit={room.kind === 'duel' ? 2 : 5} deltas={deltas} />}
        {roundEnd.next !== null && <Countdown from={roundEnd.next} at={roundEnd.at} />}
      </div>
    );
  }

  return (
    <div className="status" role="status" aria-live="polite">
      {q.kind === 'map' && !fb?.done && <span className="tries">{Array.from({ length: q.attempts }, (_, i) => <i key={i} className={i < (fb?.attemptsLeft ?? q.attempts) ? 'on' : ''} />)}<span className="sr">{t('play.attempts', { n: fb?.attemptsLeft ?? q.attempts })}</span></span>}
      {fb && !fb.done && !fb.correct && <span className="bad-txt">{t('play.wrong')}</span>}
      {fb?.done && !solo && (
        <span>
          <strong className={fb.correct ? 'good-txt' : 'bad-txt'}>{fb.correct ? t('play.correct') : t('play.wrong')}</strong>{' '}
          {s.progress && t('play.waiting', { a: s.progress.answered, n: s.progress.total })}
        </span>
      )}
    </div>
  );
}

function Countdown({ from, at }: { from: number; at: number }) {
  const { t } = useApp();
  const [n, setN] = useState(Math.ceil(from / 1000));
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(0, Math.ceil((from - (performance.now() - at)) / 1000))), 200);
    return () => clearInterval(id);
  }, [from, at]);
  return <p className="countdown">{t('play.nextIn', { n })}</p>;
}

function Timer({ q, stopped }: { q: QuestionMsg; stopped: boolean }) {
  const { s } = useApp();
  const [left, setLeft] = useState(q.remaining ?? 0);
  const tickRef = useRef(-1);
  useEffect(() => {
    if (q.remaining === null) return;
    const end = s.qAt + q.remaining;
    const id = setInterval(() => {
      const l = Math.max(0, end - performance.now());
      setLeft(l);
      const sec = Math.ceil(l / 1000);
      if (!stopped && sec <= 3 && sec > 0 && sec !== tickRef.current) { tickRef.current = sec; sfx.tick(); }
    }, 100);
    return () => clearInterval(id);
  }, [q, s.qAt, stopped]);
  if (q.timeLimit === null || q.remaining === null) return <span className="timer-none" />;
  const frac = left / q.timeLimit;
  return (
    <span className={`timer ${frac < 0.25 ? 'low' : ''}`} role="timer">
      <span className="timer-bar"><span style={{ transform: `scaleX(${frac})` }} /></span>
      <span className="timer-n">{Math.ceil(left / 1000)}</span>
    </span>
  );
}

// ------------------------------------------------------------------ animateur (écran principal)
/** Bandeau du mode de salle : duel en cours (Battle Royale) ou équipe du joueur. */
function ModeBar() {
  const { t, s } = useApp();
  const room = s.room!;
  const me = room.players.find((p) => p.id === s.you);
  if (!me) return null;
  if (room.settings.mode === 'battle' && room.kind === 'room') {
    if (me.out) return <p className="out-banner">{t('battle.youOut')}</p>;
    const pair = room.pairs?.find((p) => p.includes(me.id));
    const oppId = pair ? (pair[0] === me.id ? pair[1] : pair[0]) : null;
    const opp = oppId ? room.players.find((p) => p.id === oppId) : undefined;
    return (
      <div className="versus">
        <div className="side"><strong>{t('battle.you')}</strong><Hearts lives={me.lives} /></div>
        <span className="vs">{t('battle.vs')}</span>
        <div className="side right">
          {opp ? <><strong dir="auto">{opp.name}</strong><Hearts lives={opp.lives} /></> : <strong>{t('battle.bye')}</strong>}
        </div>
      </div>
    );
  }
  if (room.settings.mode === 'teams' && room.kind === 'room' && me.team !== undefined) return <TeamChip team={me.team} />;
  return null;
}

/** Résultat du duel pour ce joueur. */
function battleLine(t: (k: string, p?: Record<string, string | number>) => string, b: { lost: string[]; out: string[] }, me: string, room: NonNullable<ReturnType<typeof useApp>['s']['room']>) {
  const pair = room.pairs?.find((p) => p.includes(me));
  if (!pair) return '';
  const oppId = pair[0] === me ? pair[1] : pair[0];
  const opp = room.players.find((p) => p.id === oppId);
  if (b.out.includes(me)) return t('battle.eliminated');
  if (b.lost.includes(me) && opp && b.lost.includes(opp.id)) return t('battle.bothLost');
  if (b.lost.includes(me)) return opp ? t('battle.lostTo', { name: opp.name }) : t('battle.lostHeart');
  if (opp && b.lost.includes(opp.id)) return t('battle.beat', { name: opp.name });
  return t('battle.safe');
}

function Presenter({ q }: { q: QuestionMsg }) {
  const { t, s, send } = useApp();
  const reveal = useReveal(q);
  const roundEnd = s.reveal?.q === q.index ? s.reveal : undefined;
  const last = q.index + 1 >= q.total;
  const marks: Record<string, Mark> = reveal?.id ? { [reveal.id]: 'reveal' } : {};
  return (
    <div className="presenter-game">
      <div className="hud">
        <span className="qnum">{t('play.question', { i: q.index + 1, n: q.total })}</span>
        <span className="answered">{s.progress ? t('play.answered', { a: s.progress.answered, n: s.progress.total }) : ''}</span>
        <Timer q={q} stopped={!!roundEnd} />
      </div>
      <Prompt q={q} open={!!roundEnd} />
      <div className="presenter-body">
        {q.map && <MapView spec={q.map} highlight={q.highlight} marks={marks} pins={q.kind === 'pin' ? { target: reveal?.point } : undefined} t={t} />}
        {q.kind === 'mcq' && <Options q={q} correctId={reveal?.optionId} />}
        {q.kind === 'order' && <OrderBoard q={q} locked reveal={reveal} />}
        {roundEnd && (
          <aside className="presenter-board">
            <p className="answer" dir="auto">{t('play.answerWas', { label: roundEnd.reveal.label })}</p>
            {roundEnd.reveal.credit && <small className="credit" dir="auto">{t('play.photo', { credit: roundEnd.reveal.credit })}</small>}
            {roundEnd.reveal.flag && <FlagImg token={roundEnd.reveal.flag} className="flag small" />}
            {roundEnd.battle && (
              <p className="battle-line">
                {t('battle.alive', { n: roundEnd.players.filter((p) => !p.out).length })}
                {roundEnd.battle.out.length > 0 && <> · {t('battle.outNames', { names: roundEnd.players.filter((p) => roundEnd.battle!.out.includes(p.id)).map((p) => p.name).join(', ') })}</>}
              </p>
            )}
            {roundEnd.teams && <><h2>{t('team.title')}</h2><TeamBars teams={roundEnd.teams} /></>}
            <h2>{t('play.leaderboard')}</h2>
            <Leaderboard players={roundEnd.players} limit={10} deltas={Object.fromEntries(roundEnd.results.map((r) => [r.id, r.points]))} />
          </aside>
        )}
      </div>
      <div className="actions">
        {roundEnd ? (
          <button type="button" className="btn primary" onClick={() => send({ t: 'next' })}>{last ? t('play.finish') : t('play.next')}</button>
        ) : (
          <button type="button" className="btn ghost" onClick={() => send({ t: 'next' })}>{t('play.closeQuestion')}</button>
        )}
      </div>
    </div>
  );
}
