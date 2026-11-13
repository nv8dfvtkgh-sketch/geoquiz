// Jeux de duel sur plateau : réglages, partie sur un seul appareil (à deux ou contre l'ordi) et
// partie à distance (le serveur arbitre). Les règles sont dans src/shared/boards.ts.
import { useEffect, useRef, useState } from 'react';
import type { BoardQ, Lang } from '../../shared/protocol';
import {
  answer, BOARD_MAX, BOARD_QUIZ, BOARD_THEMES, BOT_RIGHT, botMove, DOT, dotsEdgeCount, FLEET, hangMask, hangNext, HANG_ROUNDS, initBoard, legal,
  play, ROUTE, ROUTE_CELLS, SEA, sunk, viewFor, type BoardGame, type BoardState, type Level, type Move,
} from '../../shared/boards';
import { useApp } from '../state';
import { createGame } from '../net';
import { sfx } from '../sound';
import { Confetti } from '../Celebrate';
import { loadGeo, nameOf, type GeoCountry } from '../geo';
import { PuzzleBack } from './Puzzles';
import { RoadSign } from '../RoadSign';

let chosen: BoardGame = 'ttt';
/** Jeu choisi depuis l'accueil (l'écran « duel » s'ouvre ensuite). */
export const chooseDuel = (g: BoardGame) => { chosen = g; };
const COLORS = ['#1E5AA8', '#E8590C', '#1F8A5B', '#B98B00'];
const PAWNS = ['🐪', '🐎', '🐘', '🦁'];
const C4_COLORS = ['#D64545', '#E0A800'];

type Mode = 'online' | 'local' | 'bot';
interface Cfg { game: BoardGame; mode: Mode; level: Level; theme: string; players: number; difficulty: 'easy' | 'medium' | 'hard' }

// ======================================================================= réglages
export function DuelScreen() {
  const { t, look, name, lang, fail } = useApp();
  const [cfg, setCfg] = useState<Cfg>(() => ({ game: chosen, mode: 'bot', level: look === 'kids' ? 'easy' : 'medium', theme: 'geo', players: 2, difficulty: look === 'kids' ? 'easy' : 'medium' }));
  const [playing, setPlaying] = useState<(Cfg & { nonce: number }) | null>(null);
  const quiz = BOARD_QUIZ.has(cfg.game);
  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p });
  if (playing) return <LocalGame key={playing.nonce} cfg={playing} onQuit={() => setPlaying(null)} onAgain={() => setPlaying({ ...playing, nonce: Date.now() })} />;
  const start = () => {
    if (cfg.mode === 'online') {
      const kind = cfg.game === 'caravan' && cfg.players > 2 ? 'room' : 'duel';
      createGame({ kind, settings: { category: 'board', zone: 'world', board: cfg.game, theme: cfg.theme, difficulty: cfg.difficulty, qtype: 'mcq', count: 10, timeLimit: 25 } as any }, name, lang).then(fail);
    } else setPlaying({ ...cfg, nonce: Date.now() });
  };
  return (
    <div className="duel-setup panel">
      <PuzzleBack to="home" />
      <div className="duel-head">
        <span className="duel-ic" aria-hidden="true">{GAME_EMOJI[cfg.game]}</span>
        <div><h1>{t(`cat.${cfg.game}`)}</h1><p className="muted">{t(`duel.${cfg.game}.how`)}</p></div>
      </div>
      <h2 className="duel-h">{t('duel.mode')}</h2>
      <div className="duel-modes">
        {(['bot', 'local', 'online'] as Mode[]).map((m) => (
          <button type="button" key={m} className={cfg.mode === m ? 'on' : ''} onClick={() => set({ mode: m })}>
            <span aria-hidden="true">{m === 'bot' ? '🤖' : m === 'local' ? '📱' : '🔗'}</span>
            <strong>{t(`duel.mode.${m}`)}</strong><small>{t(`duel.mode.${m}.hint`)}</small>
          </button>
        ))}
      </div>
      {cfg.mode === 'bot' && (
        <>
          <h2 className="duel-h">{t('duel.level')}</h2>
          <div className="seg">{(['easy', 'medium', 'hard'] as Level[]).map((l) => <button type="button" key={l} aria-pressed={cfg.level === l} onClick={() => set({ level: l })}>{t(`diff.${l}`)}</button>)}</div>
        </>
      )}
      {cfg.game === 'caravan' && cfg.mode !== 'bot' && (
        <>
          <h2 className="duel-h">{t('duel.players')}</h2>
          <div className="seg">{[2, 3, 4].map((n) => <button type="button" key={n} aria-pressed={cfg.players === n} onClick={() => set({ players: n })}>{n}</button>)}</div>
        </>
      )}
      {(quiz || cfg.game === 'hangman' || cfg.game === 'memory') && (
        <>
          {quiz && (
            <>
              <h2 className="duel-h">{t('duel.theme')}</h2>
              <div className="duel-themes">
                {Object.keys(BOARD_THEMES).map((th) => <button type="button" key={th} className={cfg.theme === th ? 'on' : ''} onClick={() => set({ theme: th })}>{t(`duel.theme.${th}`)}</button>)}
              </div>
            </>
          )}
          <h2 className="duel-h">{t('setup.difficulty')}</h2>
          <div className="seg">{(['easy', 'medium', 'hard'] as const).map((d) => <button type="button" key={d} aria-pressed={cfg.difficulty === d} onClick={() => set({ difficulty: d })}>{t(`diff.${d}`)}</button>)}</div>
        </>
      )}
      <div className="play-bar"><button type="button" className="how-btn primary" onClick={start}>{cfg.mode === 'online' ? t('duel.invite') : t('home.play')}</button></div>
    </div>
  );
}
export const GAME_EMOJI: Record<BoardGame, string> = { ttt: '❌', c4q: '🔴', c4: '🟡', ships: '🚢', hangman: '🔤', dots: '🔲', memory: '🃏', caravan: '🐪', awale: '🌰' };

// ======================================================================= partie sur un appareil
interface LocalQ { q: BoardQ; ok: string }
function LocalGame({ cfg, onQuit, onAgain }: { cfg: Cfg; onQuit: () => void; onAgain: () => void }) {
  const { t, lang } = useApp();
  const n = cfg.game === 'caravan' && cfg.mode === 'local' ? cfg.players : 2;
  const [geo, setGeo] = useState<GeoCountry[] | null>(null);
  const [s, setS] = useState<BoardState | null>(null);
  const [res, setRes] = useState<{ ok: boolean; correct?: string; who: number } | null>(null);
  const [hide, setHide] = useState<number | null>(null); // écran « passe le téléphone » (bataille navale à deux)
  const qs = useRef<LocalQ[]>([]);
  const [curQ, setCurQ] = useState<LocalQ | null>(null);
  const mem = useRef(new Map<number, string>());
  const bot = cfg.mode === 'bot' ? 1 : -1;
  const names = cfg.mode === 'bot' ? [t('cards.you'), t('cards.bot')] : Array.from({ length: n }, (_, i) => t('duel.player', { n: i + 1 }));

  const fetchQs = () => fetch(`/api/boardq?theme=${cfg.theme}&d=${cfg.difficulty}&lang=${lang}&n=40`).then((r) => r.json()).then((x: LocalQ[]) => { qs.current.push(...x); });
  useEffect(() => {
    loadGeo().then((g) => {
      setGeo(g);
      const pool = [...g].sort((a, b) => b.fame - a.fame).slice(0, cfg.difficulty === 'hard' ? 160 : cfg.difficulty === 'medium' ? 100 : 60).sort(() => Math.random() - 0.5);
      const words = pool.filter((c) => { const w = nameOf(c.n, lang); return [...w].length >= 4 && [...w].length <= 14; }).slice(0, HANG_ROUNDS);
      setS(initBoard(cfg.game, n, cfg.theme, Math.random, { words: words.map((c, i) => (i === 1 && c.cap ? nameOf(c.cap, lang) : nameOf(c.n, lang))), hints: words.map((c, i) => (i === 1 && c.cap ? 'capital' : 'country')), flags: pool.slice(0, 8).map((c) => c.id) }));
    }).catch(() => setGeo([]));
    if (BOARD_QUIZ.has(cfg.game)) fetchQs();
  }, []);

  // Question à poser : on prend la suivante de la réserve.
  useEffect(() => {
    if (!s?.ask || curQ) return;
    if (!qs.current.length) { fetchQs().then(() => setS({ ...s })); return; }
    const q = qs.current.shift()!;
    if (s.turn === bot) {
      // L'ordi répond (plus ou moins bien selon le niveau).
      const ok = Math.random() < BOT_RIGHT[cfg.level];
      const id = setTimeout(() => { setRes({ ok, who: bot }); setS(answer(s, ok)); }, 1100);
      return () => clearTimeout(id);
    }
    setCurQ(q);
  }, [s, curQ]);

  // Coup de l'ordi.
  useEffect(() => {
    if (!s || s.winner !== null || s.ask || s.turn !== bot) return;
    if (s.game === 'hangman' && s.done) return;
    const id = setTimeout(() => {
      const m = botMove(viewFor(s, bot), bot, cfg.level, Math.random, mem.current);
      doMove(bot, m);
    }, s.game === 'memory' ? 700 : 650);
    return () => clearTimeout(id);
  }, [s]);
  // Pendu : manche suivante après avoir vu le mot.
  useEffect(() => {
    if (s?.game === 'hangman' && s.done && s.winner === null) { const id = setTimeout(() => setS(hangNext(s)), 2400); return () => clearTimeout(id); }
  }, [s]);
  useEffect(() => { if (s && s.winner !== null) { window.dispatchEvent(new CustomEvent('gq:finished', { detail: { game: cfg.game, score: s.winner === 0 ? 1 : 0 } })); if (s.winner === 0 || cfg.mode === 'local') sfx.end(); } }, [s?.winner]);

  function doMove(p: number, m: Move) {
    setS((cur) => {
      if (!cur || !legal(cur, p, m)) return cur;
      const nx = play(cur, p, m, Math.random);
      if (nx.game === 'memory' && typeof m === 'number') { mem.current.set(m, nx.cards[m].iso); sfx.tick(); }
      if (nx.game === 'awale' || nx.game === 'c4' || nx.game === 'dots') sfx.tick();
      setRes(null);
      // À deux sur un appareil, la bataille navale cache la flotte avant de passer le téléphone.
      if (cfg.mode === 'local' && nx.game === 'ships' && !nx.ask && nx.turn !== cur.turn && nx.winner === null) setHide(nx.turn);
      return nx;
    });
  }
  const onAnswer = (id: string) => {
    if (!s || !curQ) return;
    const ok = id === curQ.ok;
    if (ok) sfx.good(); else sfx.bad();
    setRes({ ok, correct: curQ.ok, who: s.turn });
    const nx = answer(s, ok);
    setTimeout(() => {
      setCurQ(null); setS(nx);
      if (cfg.mode === 'local' && nx.game === 'ships' && nx.turn !== s.turn && nx.winner === null) setHide(nx.turn);
    }, 900);
  };

  if (!s || !geo) return <div className="loading" />;
  const me = cfg.mode === 'bot' ? 0 : s.turn; // à deux sur un appareil : on voit le plateau de celui qui joue
  const view = viewFor(s, cfg.mode === 'bot' ? 0 : (s.game === 'ships' ? s.turn : null));
  const canPlay = s.turn !== bot && s.winner === null && !s.ask && hide === null;
  return (
    <div className="duel panel">
      <button type="button" className="back-link" onClick={onQuit}>‹ {t(`cat.${cfg.game}`)}</button>
      <Players names={names} s={s} you={cfg.mode === 'bot' ? 0 : -1} />
      {hide !== null ? (
        <div className="pass-phone"><span aria-hidden="true">📱</span><p>{t('duel.pass', { name: names[hide] })}</p><button type="button" className="btn primary" onClick={() => setHide(null)}>{t('duel.ready')}</button></div>
      ) : (
        <>
          <Status s={s} names={names} you={cfg.mode === 'bot' ? 0 : s.turn} bot={bot} res={res} />
          {curQ && <QuestionCard q={curQ.q} onAnswer={onAnswer} res={res && res.who === s.turn ? res : null} />}
          {!curQ && <BoardView s={view} me={me} canPlay={canPlay} onMove={(m) => doMove(s.turn, m)} geo={geo} lang={lang} />}
        </>
      )}
      {s.winner !== null && <EndCard s={s} names={names} you={cfg.mode === 'bot' ? 0 : -1} onAgain={onAgain} onQuit={onQuit} again={t('na.again')} />}
    </div>
  );
}

// ======================================================================= partie à distance
export function BoardOnline() {
  const { t, s, send, lang, leave } = useApp();
  const [geo, setGeo] = useState<GeoCountry[]>([]);
  useEffect(() => { loadGeo().then(setGeo).catch(() => {}); }, []);
  const msg = s.board;
  const room = s.room!;
  const [sent, setSent] = useState(false);
  useEffect(() => { setSent(false); }, [msg?.q]);
  useEffect(() => { if (msg?.view.winner !== null && msg?.view.winner !== undefined) window.dispatchEvent(new CustomEvent('gq:finished', { detail: { game: msg.view.game } })); }, [msg?.view.winner]);
  useEffect(() => { if (msg?.res) { if (msg.res.ok) sfx.good(); else if (msg.res.correct) sfx.bad(); } }, [msg?.res]);
  if (!msg) return <div className="loading" />;
  const v = msg.view;
  const names = msg.order.map((id) => room.players.find((p) => p.id === id)?.name ?? '?');
  const canPlay = msg.you === v.turn && v.winner === null && !v.ask;
  const votes = room.rematchVotes ?? [];
  return (
    <div className="duel panel">
      <Players names={names} s={v} you={msg.you} online />
      <Status s={v} names={names} you={msg.you} bot={-1} res={msg.res ? { ...msg.res, who: msg.res.correct !== undefined ? msg.you : v.last?.p ?? msg.you } : null} deadline={msg.deadline} />
      {msg.q && !sent ? <QuestionCard q={msg.q} onAnswer={(id) => { setSent(true); send({ t: 'banswer', value: id }); }} res={null} />
        : <BoardView s={v} me={Math.max(0, msg.you)} canPlay={canPlay} onMove={(m) => send({ t: 'bmove', move: m })} geo={geo} lang={lang} />}
      {v.winner !== null && (
        <EndCard s={v} names={names} you={msg.you} again={room.kind === 'duel' ? (votes.includes(s.you!) ? t('duel.waitRematch') : t('final.rematch')) : t('final.again')}
          onAgain={() => send({ t: 'rematch' })} onQuit={leave} />
      )}
    </div>
  );
}

// ======================================================================= morceaux communs
function Players({ names, s, you, online = false }: { names: string[]; s: BoardState; you: number; online?: boolean }) {
  const { t } = useApp();
  return (
    <div className="duel-players">
      {names.map((nm, i) => (
        <span key={i} className={`dp ${s.turn === i && s.winner === null ? 'turn' : ''}`} style={{ '--c': s.game === 'c4' || s.game === 'c4q' ? C4_COLORS[i] : COLORS[i] } as React.CSSProperties}>
          <i aria-hidden="true">{s.game === 'caravan' ? PAWNS[i] : s.game === 'ttt' ? (i ? '◯' : '✕') : '●'}</i>
          <b dir="auto">{nm}{i === you && online ? ` (${t('lobby.you')})` : ''}</b>
          <em>{s.game === 'caravan' ? `${s.pos[i]}/${ROUTE}` : s.game === 'ships' ? `${s.scores[i]}/${FLEET.length}` : s.scores[i]}</em>
        </span>
      ))}
    </div>
  );
}

function Status({ s, names, you, bot, res, deadline }: { s: BoardState; names: string[]; you: number; bot: number; res: { ok: boolean; correct?: string; who: number } | null; deadline?: number }) {
  const { t } = useApp();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) { setLeft(null); return; }
    const end = performance.now() + deadline;
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((end - performance.now()) / 1000))), 250);
    return () => clearInterval(id);
  }, [deadline, s]);
  if (s.winner !== null) return null;
  const who = names[s.turn];
  let text: string;
  if (s.ask) text = s.turn === you ? t('duel.answer') : s.turn === bot ? t('duel.botAnswers') : t('duel.theyAnswer', { name: who });
  else if (s.game === 'hangman' && s.done) text = s.last?.ok ? t('duel.hangFound', { name: names[s.last.p] ?? '' }) : t('duel.hangNobody');
  else text = s.turn === you ? t(`duel.${s.game}.turn`) : s.turn === bot ? t('duel.botTurn') : t('duel.theirTurn', { name: who });
  const ev = s.last;
  const who2 = res && res.who !== you ? `${names[res.who] ?? ''} : ` : '';
  const evText = ev && res !== null ? (res.ok ? `✅ ${who2}${t('duel.right')}` : `❌ ${who2}${t('duel.wrong')}`)
    : ev?.ev === 'hit' ? `💥 ${t('duel.hit')}` : ev?.ev === 'sunk' ? `🚢 ${t('duel.sunk')}` : ev?.ev === 'miss' && s.game === 'ships' ? `🌊 ${t('duel.miss')}`
      : ev?.ev === 'camel' ? `🐪 ${t('duel.camel')}` : ev?.ev === 'hill' ? `⛰️ ${t('duel.hill')}` : ev?.ev === 'oasis' ? `🌴 ${t('duel.oasis')}`
        : ev?.ev === 'capture' ? `🌰 ${t('duel.capture', { n: ev.x ?? 0 })}` : ev?.ev === 'pair' ? `✨ ${t('duel.pair')}` : '';
  return (
    <div className={`duel-status ${s.turn === you ? 'mine' : ''}`} aria-live="polite">
      <span>{text}</span>
      {evText && <small>{evText}</small>}
      {left !== null && left <= 15 && <b className="duel-clock">{left}</b>}
    </div>
  );
}

function QuestionCard({ q, onAnswer, res }: { q: BoardQ; onAnswer: (id: string) => void; res: { ok: boolean; correct?: string } | null }) {
  const { t } = useApp();
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [q]);
  return (
    <div className="duel-q">
      {q.params.name ? <><p className="duel-q-cat">{t(q.promptKey, q.params)}</p><h2 dir="auto">{q.params.name}</h2></> : <h2 dir="auto">{t(q.promptKey, q.params)}</h2>}
      {q.flag && <img className="duel-q-flag" src={`/api/flag/${q.flag}.svg`} alt="" />}
      {q.emoji && <span className="duel-q-emoji" aria-hidden="true">{q.emoji}</span>}
      {q.sign && <RoadSign id={q.sign} />}
      <div className="duel-opts">
        {q.options.map((o) => (
          <button type="button" key={o.id} disabled={!!picked}
            className={`opt ${res && o.id === res.correct ? 'right' : ''} ${res && picked === o.id && !res.ok ? 'wrong' : ''}`}
            onClick={() => { setPicked(o.id); onAnswer(o.id); }}>
            {o.flag && <img src={`/api/flag/${o.flag}.svg`} alt="" width="40" height="30" />}
            {o.label && <span dir="auto">{o.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function EndCard({ s, names, you, onAgain, onQuit, again }: { s: BoardState; names: string[]; you: number; onAgain: () => void; onQuit?: () => void; again: string }) {
  const { t } = useApp();
  const won = s.winner === you;
  return (
    <div className={`duel-end ${won ? 'won' : ''}`}>
      {won && <Confetti size="big" />}
      <span className="na-big" aria-hidden="true">{s.winner === -1 ? '🤝' : won ? '🏆' : you >= 0 ? '😅' : '🏆'}</span>
      <strong dir="auto">{s.winner === -1 ? t('duel.draw') : you < 0 || !won ? t('duel.wins', { name: names[s.winner!] }) : t('duel.youWin')}</strong>
      <div className="pz-end-actions">
        <button type="button" className="btn primary" onClick={onAgain}>{again}</button>
        {onQuit && <button type="button" className="btn" onClick={onQuit}>{t('duel.quit')}</button>}
      </div>
    </div>
  );
}

// ======================================================================= les plateaux
function BoardView({ s, me, canPlay, onMove, geo, lang }: { s: BoardState; me: number; canPlay: boolean; onMove: (m: Move) => void; geo: GeoCountry[]; lang: Lang }) {
  const { t } = useApp();
  switch (s.game) {
    case 'ttt':
      return (
        <div className="b-ttt">
          {s.cells.map((c, i) => (
            <button type="button" key={i} disabled={!canPlay || c !== null} onClick={() => onMove(i)} style={c !== null ? { color: COLORS[c] } : undefined}
              className={s.last?.x === i ? 'last' : ''}>
              {c === null ? <><span aria-hidden="true">{s.icons[i]}</span><small>{t(`cat.${s.themes[i]}`)}</small></> : <b>{c ? '◯' : '✕'}</b>}
            </button>
          ))}
        </div>
      );
    case 'c4': case 'c4q': {
      const win = new Set((s.win ?? []).map(([r, c]) => `${r}:${c}`));
      return (
        <div className="b-c4" role="grid">
          {Array.from({ length: 7 }, (_, c) => (
            <button type="button" key={c} className="b-c4-col" disabled={!canPlay || s.grid[0][c] !== null} onClick={() => onMove(c)} aria-label={t('duel.column', { n: c + 1 })}>
              {s.grid.map((row, r) => <i key={r} className={win.has(`${r}:${c}`) ? 'win' : ''} style={row[c] !== null ? { background: row[c] ? '#F2B705' : '#D64545' } : undefined} />)}
            </button>
          ))}
        </div>
      );
    }
    case 'ships': {
      const opp = 1 - me;
      const shots = s.shots[me], theirs = s.shots[opp];
      const oppSunk = s.fleets[opp];
      return (
        <div className="b-ships">
          <h3>{t('duel.ships.target')}</h3>
          <div className="b-sea big">
            {Array.from({ length: SEA * SEA }, (_, i) => {
              const shot = shots.includes(i), hit = s.hits[me].includes(i);
              const sk = oppSunk.some((sh) => sh.includes(i) && sunk(sh, shots));
              return <button type="button" key={i} disabled={!canPlay || shot} onClick={() => onMove(i)} className={`${shot ? (hit ? 'hit' : 'miss') : ''} ${sk ? 'sunk' : ''}`}>{shot ? (hit ? '💥' : '•') : ''}</button>;
            })}
          </div>
          <h3>{t('duel.ships.mine')}</h3>
          <div className="b-sea small">
            {Array.from({ length: SEA * SEA }, (_, i) => {
              const ship = s.fleets[me].some((sh) => sh.includes(i));
              const shot = theirs.includes(i);
              return <i key={i} className={`${ship ? 'ship' : ''} ${shot ? (ship ? 'hit' : 'miss') : ''}`}>{shot ? (ship ? '💥' : '•') : ''}</i>;
            })}
          </div>
        </div>
      );
    }
    case 'hangman': return <HangBoard s={s} me={me} canPlay={canPlay} onMove={onMove} lang={lang} />;
    case 'dots': {
      const W = 300, pad = 20, step = (W - 2 * pad) / DOT;
      const H = (DOT + 1) * DOT;
      const edge = (e: number) => {
        if (e < H) { const r = Math.floor(e / DOT), c = e % DOT; return [pad + c * step, pad + r * step, pad + (c + 1) * step, pad + r * step]; }
        const k = e - H, r = Math.floor(k / (DOT + 1)), c = k % (DOT + 1);
        return [pad + c * step, pad + r * step, pad + c * step, pad + (r + 1) * step];
      };
      return (
        <svg className="b-dots" viewBox={`0 0 ${W} ${W}`} role="img">
          {s.boxes.map((b, i) => b !== null && (
            <g key={`b${i}`}>
              <rect x={pad + (i % DOT) * step + 3} y={pad + Math.floor(i / DOT) * step + 3} width={step - 6} height={step - 6} rx="6" fill={b === -2 ? 'var(--fill)' : COLORS[b]} opacity={b === -2 ? 1 : 0.25} />
              {b >= 0 && <text x={pad + (i % DOT + 0.5) * step} y={pad + (Math.floor(i / DOT) + 0.62) * step} textAnchor="middle" fontSize="26" fontWeight="800" fill={COLORS[b]}>{b + 1}</text>}
            </g>
          ))}
          {Array.from({ length: dotsEdgeCount }, (_, e) => {
            const [x1, y1, x2, y2] = edge(e);
            const who = s.edges[e];
            return (
              <g key={e} className={`dot-edge ${who === null && canPlay ? 'free' : ''}`} onClick={() => who === null && canPlay && onMove(e)}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="22" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={who === null ? 'var(--border)' : COLORS[who]} strokeWidth={who === null ? 3 : 7} strokeLinecap="round" strokeDasharray={who === null ? '4 6' : undefined} />
              </g>
            );
          })}
          {Array.from({ length: (DOT + 1) ** 2 }, (_, i) => <circle key={`d${i}`} cx={pad + (i % (DOT + 1)) * step} cy={pad + Math.floor(i / (DOT + 1)) * step} r="6" fill="var(--ink)" />)}
        </svg>
      );
    }
    case 'memory': {
      const byIso = new Map(geo.map((c) => [c.id, c]));
      return (
        <div className="b-memory">
          {s.cards.map((c, i) => {
            const up = c.iso !== '';
            return (
              <button type="button" key={i} disabled={!canPlay || up} onClick={() => onMove(i)} className={`${up ? 'up' : ''} ${s.owner[i] !== null ? 'done' : ''} ${s.miss.includes(i) ? 'miss' : ''}`}
                style={s.owner[i] !== null ? { borderColor: COLORS[s.owner[i]!] } : undefined}>
                {!up ? <span aria-hidden="true">🌍</span> : c.face === 'flag' ? <img src={`/api/flag/${c.iso}.svg`} alt="" /> : <span dir="auto">{nameOf(byIso.get(c.iso)?.n, lang) || c.iso}</span>}
              </button>
            );
          })}
        </div>
      );
    }
    case 'caravan': {
      const icon: Record<string, string> = { q: '❓', camel: '🐪', hill: '⛰️', oasis: '🌴' };
      return (
        <div className="b-caravan">
          <div className="b-route">
            {Array.from({ length: ROUTE + 1 }, (_, i) => (
              <span key={i} className={`cell ${ROUTE_CELLS[i] ?? ''} ${i === 0 ? 'start' : ''} ${i === ROUTE ? 'end' : ''}`}>
                <small>{i === 0 ? '🏁' : i === ROUTE ? '🏆' : icon[ROUTE_CELLS[i]] ?? i}</small>
                <span className="pawns">{s.pos.map((p, k) => (p === i ? <b key={k} title={String(k + 1)}>{PAWNS[k]}</b> : null))}</span>
              </span>
            ))}
          </div>
          <div className="b-dice">
            <span className="die" aria-live="polite">{s.die ? ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][s.die - 1] : '🎲'}</span>
            <button type="button" className="btn primary" disabled={!canPlay} onClick={() => { sfx.tick(); onMove({ k: 'roll' }); }}>{t('duel.roll')}</button>
          </div>
          <p className="hint">{t('duel.caravan.legend')}</p>
        </div>
      );
    }
    case 'awale': {
      const top = me === 0 ? [11, 10, 9, 8, 7, 6] : [5, 4, 3, 2, 1, 0];
      const bottom = me === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
      const pit = (i: number, mine: boolean) => (
        <button type="button" key={i} className={`pit ${s.last && (s.last as any).x !== undefined ? '' : ''}`} disabled={!mine || !canPlay || !legal(s as any, s.turn, i)} onClick={() => onMove(i)}>
          <span className="seeds" aria-hidden="true">{Array.from({ length: Math.min(s.pits[i], 12) }, (_, k) => <i key={k} />)}</span>
          <b>{s.pits[i]}</b>
        </button>
      );
      return (
        <div className="b-awale">
          <div className="store">{s.scores[1 - me]}</div>
          <div className="pits">
            <div className="row">{top.map((i) => pit(i, false))}</div>
            <div className="row">{bottom.map((i) => pit(i, true))}</div>
          </div>
          <div className="store mine">{s.scores[me]}</div>
          <p className="hint">{t('duel.awale.legend')}</p>
        </div>
      );
    }
  }
}

const KEYS: Record<string, string[]> = {
  fr: ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'], en: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'], es: ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'],
  ar: ['ضصثقفغعهخحج', 'شسيبلاتنمكط', 'ذءرزظدو'],
};
function HangBoard({ s, me, canPlay, onMove, lang }: { s: Extract<BoardState, { game: 'hangman' }>; me: number; canPlay: boolean; onMove: (m: Move) => void; lang: Lang }) {
  const { t } = useApp();
  const [w, setW] = useState('');
  const word = s.words[s.round];
  const shown = s.done ? [...word] : [...word].map((c) => (c === '_' ? '' : c));
  const arabic = /[؀-ۿ]/.test(word) || lang === 'ar';
  const rows = KEYS[arabic ? 'ar' : lang] ?? KEYS.en;
  const fold = (c: string) => c.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase();
  return (
    <div className="b-hang">
      <p className="b-hang-info">{t('duel.hang.round', { n: s.round + 1, total: Math.min(HANG_ROUNDS, s.words.length) })} · {t(`duel.hang.${s.hints[s.round] ?? 'country'}`)}</p>
      <div className="b-hang-word" dir={arabic ? 'rtl' : 'ltr'}>
        {shown.map((c, i) => (/\p{L}/u.test(word[i] ?? '') || c === '' || c === '_' ? <b key={i} className={c ? 'on' : ''}>{c}</b> : <i key={i}>{c === ' ' ? ' ' : c}</i>))}
      </div>
      <div className="b-hang-lives">{s.lives.map((l, i) => <span key={i} style={{ color: COLORS[i] }}>{'❤'.repeat(Math.max(0, l))}{'♡'.repeat(Math.max(0, 5 - l))}</span>)}</div>
      {!s.done && (
        <>
          <div className="wd-keys" dir={arabic ? 'rtl' : 'ltr'}>
            {rows.map((row, i) => (
              <div key={i}>{[...row].map((k) => {
                const used = s.guessed.includes(fold(k));
                const inWord = used && [...word].some((c) => fold(c) === fold(k));
                return <button type="button" key={k} className={used ? (inWord ? 'g' : 'x') : ''} disabled={!canPlay || used} onClick={() => onMove({ k: 'l', c: k })}>{k}</button>;
              })}</div>
            ))}
          </div>
          <form className="pz-field" onSubmit={(e) => { e.preventDefault(); if (w.trim() && canPlay) { onMove({ k: 'w', w }); setW(''); } }}>
            <input value={w} onChange={(e) => setW(e.target.value)} placeholder={t('duel.hang.word')} disabled={!canPlay} dir="auto" autoComplete="off" />
            <button className="btn" disabled={!canPlay || !w.trim()}>{t('play.validate')}</button>
          </form>
        </>
      )}
      {void me}
    </div>
  );
}
export { hangMask };
