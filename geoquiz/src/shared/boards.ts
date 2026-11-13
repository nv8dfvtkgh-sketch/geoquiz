// Jeux de duel sur plateau : règles communes au serveur (parties à distance) et au navigateur
// (même appareil, contre l'ordi). Fonctions pures : un état entre, un nouvel état sort.
//
// Déroulé d'un coup : play(état, joueur, coup) → si l'état porte `ask` (un thème), une question
// est posée au joueur ; answer(état, juste ?) termine le coup.

export type BoardGame = 'ttt' | 'c4q' | 'c4' | 'ships' | 'hangman' | 'dots' | 'memory' | 'caravan' | 'awale';
export const BOARD_GAMES: BoardGame[] = ['ttt', 'c4q', 'ships', 'hangman', 'dots', 'memory', 'caravan', 'awale', 'c4'];
/** Jeux avec questions (le thème se choisit avant la partie). */
export const BOARD_QUIZ = new Set<BoardGame>(['ttt', 'c4q', 'ships', 'dots', 'caravan']);
export const BOARD_MAX: Record<BoardGame, number> = { ttt: 2, c4q: 2, c4: 2, ships: 2, hangman: 2, dots: 2, memory: 2, caravan: 4, awale: 2 };

/** Thèmes des questions : un groupe = plusieurs jeux de questions (QCM sans carte). */
export const BOARD_THEMES: Record<string, string[]> = {
  geo: ['capitals', 'flags', 'currencies', 'languages', 'peaks', 'records'],
  maroc: ['maroc', 'prog_hist', 'prog_geo'],
  world: ['food', 'animals', 'hello', 'inventions', 'records'],
  sport: ['football', 'tennis', 'basketball', 'olympics', 'afrisport', 'rugby'],
  school: ['space', 'body', 'dinos', 'prog_sci', 'inventions'],
  mix: ['capitals', 'flags', 'maroc', 'food', 'animals', 'football', 'space', 'inventions', 'peaks', 'afrisport'],
};
/** Thème d'une case du morpion (emoji + jeu de questions). */
export const TTT_CELLS: [string, string][] = [['🚩', 'flags'], ['🏛️', 'capitals'], ['⚽', 'football'], ['🐾', 'animals'], ['🍲', 'food'], ['🇲🇦', 'maroc'], ['🪐', 'space'], ['💡', 'inventions'], ['🏔️', 'peaks'], ['💰', 'currencies'], ['🏅', 'afrisport'], ['🦖', 'dinos']];

export interface Base {
  game: BoardGame;
  n: number; // joueurs
  turn: number; // à qui de jouer
  winner: number | null; // -1 : égalité
  scores: number[];
  ask?: string; // thème de la question à poser avant de finir le coup
  pending?: unknown; // coup en attente de la réponse
  last?: { p: number; ok?: boolean; ev: string; x?: number }; // dernier événement (pour l'affichage)
  moves: number;
  theme: string; // groupe de thèmes
}
type Rnd = () => number;
const pick = <T,>(a: T[], rnd: Rnd) => a[Math.floor(rnd() * a.length)];
const themeOf = (s: Base, rnd: Rnd) => pick(BOARD_THEMES[s.theme] ?? BOARD_THEMES.geo, rnd);
const next = (s: Base) => (s.turn + 1) % s.n;

// ------------------------------------------------------------------ morpion quiz
export interface Ttt extends Base { game: 'ttt'; cells: (number | null)[]; themes: string[]; icons: string[] }
const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function tttWinner(c: (number | null)[]): number | null {
  for (const [a, b, d] of LINES3) if (c[a] !== null && c[a] === c[b] && c[a] === c[d]) return c[a];
  return c.every((x) => x !== null) ? -1 : null;
}

// ------------------------------------------------------------------ puissance 4
export interface C4 extends Base { game: 'c4' | 'c4q'; grid: (number | null)[][]; win?: [number, number][] } // grid[ligne][colonne], ligne 0 en haut
const ROWS = 6, COLS = 7;
function c4Drop(g: (number | null)[][], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (g[r][col] === null) return r;
  return -1;
}
function c4Line(g: (number | null)[][], r: number, c: number): [number, number][] | null {
  const p = g[r][c];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line: [number, number][] = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && g[rr][cc] === p) { line.push([rr, cc]); rr += dr * s; cc += dc * s; }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

// ------------------------------------------------------------------ bataille des océans
export const SEA = 6;
export const FLEET = [3, 2, 2, 1];
export interface Ships extends Base { game: 'ships'; fleets: number[][][]; shots: number[][]; hits: number[][] } // fleets[p] = bateaux (cases) ; shots[p] = tirs de p
function placeFleet(rnd: Rnd): number[][] {
  for (;;) {
    const used = new Set<number>();
    const ships: number[][] = [];
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let t = 0; t < 100 && !placed; t++) {
        const h = rnd() < 0.5;
        const r = Math.floor(rnd() * (h ? SEA : SEA - len + 1)), c = Math.floor(rnd() * (h ? SEA - len + 1 : SEA));
        const cells = Array.from({ length: len }, (_, i) => (h ? r * SEA + c + i : (r + i) * SEA + c));
        // Pas de bateaux collés : plus facile à lire sur une petite grille.
        const near = (x: number) => [x, x - SEA, x + SEA, ...(x % SEA ? [x - 1] : []), ...((x + 1) % SEA ? [x + 1] : [])];
        if (cells.some((x) => near(x).some((y) => used.has(y)))) continue;
        cells.forEach((x) => used.add(x));
        ships.push(cells);
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}
export const sunk = (ship: number[], shots: number[]) => ship.every((x) => shots.includes(x));

// ------------------------------------------------------------------ pendu en duel
export interface Hangman extends Base { game: 'hangman'; words: string[]; hints: string[]; round: number; guessed: string[]; lives: number[]; done: boolean }
export const HANG_LIVES = 5;
export const HANG_ROUNDS = 3;
/** Lettres comparables : sans accents, en majuscules. */
export const foldLetter = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase().replace(/[آأإٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
export const isLetter = (c: string) => /\p{L}/u.test(c);
export function hangMask(word: string, guessed: string[]): string[] {
  return [...word].map((c) => (!isLetter(c) || guessed.includes(foldLetter(c)) ? c : ''));
}
const hangComplete = (word: string, guessed: string[]) => [...word].every((c) => !isLetter(c) || guessed.includes(foldLetter(c)));

// ------------------------------------------------------------------ points et carrés
export const DOT = 3; // carrés par côté
export interface Dots extends Base { game: 'dots'; edges: (number | null)[]; boxes: (number | null)[] } // boxes : joueur, -2 = personne (question ratée)
// Traits : d'abord les horizontaux (DOT+1 lignes × DOT), puis les verticaux (DOT lignes × DOT+1).
const H = (DOT + 1) * DOT;
export const dotsEdgeCount = H + DOT * (DOT + 1);
export function boxEdges(b: number): number[] {
  const r = Math.floor(b / DOT), c = b % DOT;
  return [r * DOT + c, (r + 1) * DOT + c, H + r * (DOT + 1) + c, H + r * (DOT + 1) + c + 1];
}
const boxesOf = (e: number) => Array.from({ length: DOT * DOT }, (_, b) => b).filter((b) => boxEdges(b).includes(e));

// ------------------------------------------------------------------ mémory des drapeaux
export interface Memory extends Base { game: 'memory'; cards: { iso: string; face: 'flag' | 'name' }[]; owner: (number | null)[]; open: number[]; miss: number[] }

// ------------------------------------------------------------------ route des caravanes
export const ROUTE = 30;
// Cases spéciales : ❓ question (+2 si juste), 🐪 avance de 2, ⛰️ recule de 2, 🌊 passe un tour.
export const ROUTE_CELLS: Record<number, 'q' | 'camel' | 'hill' | 'oasis'> = {
  2: 'q', 4: 'camel', 5: 'q', 7: 'hill', 8: 'q', 10: 'oasis', 11: 'q', 13: 'camel', 14: 'q', 16: 'hill', 17: 'q', 19: 'q', 20: 'camel', 22: 'q', 23: 'oasis', 25: 'q', 26: 'hill', 28: 'q',
};
export interface Caravan extends Base { game: 'caravan'; pos: number[]; skip: boolean[]; die?: number }

// ------------------------------------------------------------------ awalé
export interface Awale extends Base { game: 'awale'; pits: number[] } // 0-5 : joueur 0, 6-11 : joueur 1 ; semis dans le sens des indices
const side = (p: number) => (p === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11]);
function awaleSow(pits: number[], from: number): { pits: number[]; end: number } {
  const p = [...pits];
  let seeds = p[from], i = from;
  p[from] = 0;
  while (seeds > 0) { i = (i + 1) % 12; if (i === from) continue; p[i]++; seeds--; }
  return { pits: p, end: i };
}
/** Semis + captures (2 ou 3 graines chez l'adversaire, en remontant). Pas de capture qui prendrait tout. */
function awaleResult(pits: number[], player: number, from: number): { pits: number[]; got: number } {
  const { pits: p, end } = awaleSow(pits, from);
  const opp = side(1 - player);
  let i = end, got = 0;
  const q = [...p];
  while (opp.includes(i) && (q[i] === 2 || q[i] === 3)) { got += q[i]; q[i] = 0; i--; }
  if (got && opp.every((x) => q[x] === 0)) return { pits: p, got: 0 }; // grand chelem interdit : pas de capture
  return { pits: q, got };
}
export function awaleLegal(s: Awale, p: number): number[] {
  const mine = side(p).filter((i) => s.pits[i] > 0);
  // Il faut nourrir l'adversaire s'il n'a plus de graines.
  if (side(1 - p).every((i) => s.pits[i] === 0)) {
    const feed = mine.filter((i) => side(1 - p).some((x) => awaleSow(s.pits, i).pits[x] > 0));
    return feed;
  }
  return mine;
}
function awaleEnd(s: Awale): Awale {
  const total = s.pits.reduce((a, b) => a + b, 0);
  if (s.scores[0] > 24 || s.scores[1] > 24 || !awaleLegal(s, s.turn).length || s.moves > 300 || total === 0) {
    // Fin : chacun garde les graines de son côté.
    const scores = [s.scores[0] + side(0).reduce((a, i) => a + s.pits[i], 0), s.scores[1] + side(1).reduce((a, i) => a + s.pits[i], 0)];
    const pits = s.scores[0] > 24 || s.scores[1] > 24 ? s.pits : s.pits.map(() => 0);
    const sc = s.scores[0] > 24 || s.scores[1] > 24 ? s.scores : scores;
    return { ...s, pits, scores: sc, winner: sc[0] > sc[1] ? 0 : sc[1] > sc[0] ? 1 : -1 };
  }
  return s;
}

export type BoardState = Ttt | C4 | Ships | Hangman | Dots | Memory | Caravan | Awale;
export type Move = number | { k: 'l'; c: string } | { k: 'w'; w: string } | { k: 'roll' };

export interface InitCtx { words?: string[]; hints?: string[]; flags?: string[] }
// ------------------------------------------------------------------ création
export function initBoard(game: BoardGame, n: number, theme: string, rnd: Rnd, ctx: InitCtx = {}): BoardState {
  const base = { n, turn: 0, winner: null, scores: Array(n).fill(0), moves: 0, theme };
  switch (game) {
    case 'ttt': {
      const cells = [...TTT_CELLS].sort(() => rnd() - 0.5).slice(0, 9);
      return { ...base, game, cells: Array(9).fill(null), themes: cells.map((x) => x[1]), icons: cells.map((x) => x[0]) };
    }
    case 'c4': case 'c4q': return { ...base, game, grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)) };
    case 'ships': return { ...base, game, fleets: [placeFleet(rnd), placeFleet(rnd)], shots: [[], []], hits: [[], []] };
    case 'hangman': return { ...base, game, words: ctx.words ?? ['MAROC', 'RABAT', 'AFRIQUE'], hints: ctx.hints ?? [], round: 0, guessed: [], lives: Array(n).fill(HANG_LIVES), done: false };
    case 'dots': return { ...base, game, edges: Array(dotsEdgeCount).fill(null), boxes: Array(DOT * DOT).fill(null) };
    case 'memory': {
      const isos = (ctx.flags ?? ['MA', 'FR', 'JP', 'BR', 'EG', 'CA', 'IT', 'SN']).slice(0, 8);
      const cards = isos.flatMap((iso) => [{ iso, face: 'flag' as const }, { iso, face: 'name' as const }]).sort(() => rnd() - 0.5);
      return { ...base, game, cards, owner: Array(cards.length).fill(null), open: [], miss: [] };
    }
    case 'caravan': return { ...base, game, pos: Array(n).fill(0), skip: Array(n).fill(false) };
    case 'awale': return { ...base, game, pits: Array(12).fill(4) };
  }
}

/** Le coup est-il permis ? */
export function legal(s: BoardState, p: number, m: Move): boolean {
  if (s.winner !== null || s.turn !== p || s.ask) return false;
  switch (s.game) {
    case 'ttt': return typeof m === 'number' && s.cells[m] === null;
    case 'c4': case 'c4q': return typeof m === 'number' && m >= 0 && m < COLS && s.grid[0][m] === null;
    case 'ships': return typeof m === 'number' && m >= 0 && m < SEA * SEA && !s.shots[p].includes(m);
    case 'hangman':
      if (s.done || s.lives[p] <= 0 || typeof m !== 'object') return false;
      if (m.k === 'l') return [...foldLetter(m.c)].length === 1 && isLetter(m.c) && !s.guessed.includes(foldLetter(m.c));
      return m.k === 'w' && typeof m.w === 'string' && m.w.trim().length > 0;
    case 'dots': return typeof m === 'number' && m >= 0 && m < dotsEdgeCount && s.edges[m] === null;
    case 'memory': return typeof m === 'number' && m >= 0 && m < s.cards.length && s.owner[m] === null && !s.open.includes(m);
    case 'caravan': return typeof m === 'object' && m.k === 'roll';
    case 'awale': return typeof m === 'number' && awaleLegal(s, p).includes(m);
  }
}

/** Jouer un coup. Peut demander une question (`ask`) avant de le terminer. */
export function play(s0: BoardState, p: number, m: Move, rnd: Rnd): BoardState {
  if (!legal(s0, p, m)) return s0;
  const s = structuredClone(s0) as BoardState;
  s.moves++;
  s.last = undefined;
  switch (s.game) {
    case 'ttt': s.ask = s.themes[m as number]; s.pending = m; return s;
    case 'c4q': case 'ships': s.ask = themeOf(s, rnd); s.pending = m; return s;
    case 'c4': return c4Apply(s, p, m as number);
    case 'dots': {
      const e = m as number;
      s.edges[e] = p;
      const closed = boxesOf(e).filter((b) => boxEdges(b).every((x) => s.edges[x] !== null));
      if (!closed.length) { s.turn = next(s); s.last = { p, ev: 'line', x: e }; return s; }
      s.ask = themeOf(s, rnd); s.pending = closed;
      return s;
    }
    case 'hangman': return hangPlay(s, p, m as { k: 'l'; c: string } | { k: 'w'; w: string });
    case 'memory': {
      const c = m as number;
      if (s.open.length === 0) s.miss = [];
      s.open.push(c);
      if (s.open.length < 2) { s.last = { p, ev: 'flip', x: c }; return s; }
      const [a, b] = s.open;
      s.open = [];
      if (s.cards[a].iso === s.cards[b].iso) {
        s.owner[a] = s.owner[b] = p; s.scores[p]++;
        s.last = { p, ev: 'pair', x: b };
        if (s.owner.every((x) => x !== null)) s.winner = s.scores[0] === s.scores[1] ? -1 : s.scores[0] > s.scores[1] ? 0 : 1;
      } else { s.miss = [a, b]; s.turn = next(s); s.last = { p, ev: 'miss', x: b }; }
      return s;
    }
    case 'caravan': {
      const die = 1 + Math.floor(rnd() * 6);
      s.die = die;
      let pos = Math.min(ROUTE, s.pos[p] + die);
      let ev = 'roll';
      const cell = ROUTE_CELLS[pos];
      if (cell === 'camel') { pos = Math.min(ROUTE, pos + 2); ev = 'camel'; }
      else if (cell === 'hill') { pos = Math.max(0, pos - 2); ev = 'hill'; }
      else if (cell === 'oasis') { s.skip[p] = true; ev = 'oasis'; }
      s.pos[p] = pos;
      s.last = { p, ev, x: die };
      if (pos >= ROUTE) { s.winner = p; return s; }
      if (cell === 'q') { s.ask = themeOf(s, rnd); s.pending = 'q'; return s; }
      return caravanNext(s);
    }
    case 'awale': {
      const { pits, got } = awaleResult(s.pits, p, m as number);
      s.pits = pits; s.scores[p] += got;
      s.last = { p, ev: got ? 'capture' : 'sow', x: got };
      s.turn = next(s);
      return awaleEnd(s);
    }
  }
}

/** Réponse à la question : le coup est joué si elle est juste. */
export function answer(s0: BoardState, ok: boolean): BoardState {
  if (!s0.ask) return s0;
  const s = structuredClone(s0) as BoardState;
  const m = s.pending;
  s.ask = undefined; s.pending = undefined;
  const p = s.turn;
  switch (s.game) {
    case 'ttt': {
      if (ok) s.cells[m as number] = p;
      s.last = { p, ok, ev: 'ttt', x: m as number };
      s.winner = tttWinner(s.cells);
      if (s.winner === null && s.moves >= 40) s.winner = -1; // trop de questions ratées : égalité
      if (s.winner === null) s.turn = next(s);
      if (s.winner !== null && s.winner >= 0) s.scores[s.winner]++;
      return s;
    }
    case 'c4q': {
      if (!ok) { s.last = { p, ok, ev: 'c4', x: m as number }; s.turn = next(s); if (s.moves >= 120) s.winner = -1; return s; }
      const r = c4Apply(s, p, m as number) as C4;
      r.last = { ...r.last!, ok: true };
      return r;
    }
    case 'ships': {
      if (!ok) { s.last = { p, ok, ev: 'shot', x: m as number }; s.turn = next(s); return s; }
      const cell = m as number, opp = 1 - p;
      s.shots[p].push(cell);
      const hit = s.fleets[opp].some((sh) => sh.includes(cell));
      if (hit) s.hits[p].push(cell);
      const ship = s.fleets[opp].find((sh) => sh.includes(cell));
      s.last = { p, ok, ev: hit ? (ship && sunk(ship, s.shots[p]) ? 'sunk' : 'hit') : 'miss', x: cell };
      s.scores[p] = s.fleets[opp].filter((sh) => sunk(sh, s.shots[p])).length;
      if (s.fleets[opp].every((sh) => sunk(sh, s.shots[p]))) s.winner = p;
      else if (!hit) s.turn = next(s); // touché : on rejoue
      return s;
    }
    case 'dots': {
      const closed = m as number[];
      for (const b of closed) s.boxes[b] = ok ? p : -2;
      if (ok) s.scores[p] += closed.length; else s.turn = next(s);
      s.last = { p, ok, ev: 'box', x: closed[0] };
      if (s.edges.every((x) => x !== null)) s.winner = s.scores[0] === s.scores[1] ? -1 : s.scores[0] > s.scores[1] ? 0 : 1;
      return s;
    }
    case 'caravan': {
      if (ok) s.pos[p] = Math.min(ROUTE, s.pos[p] + 2);
      s.last = { p, ok, ev: 'q', x: s.die };
      if (s.pos[p] >= ROUTE) { s.winner = p; return s; }
      return caravanNext(s);
    }
    default: return s;
  }
}

function c4Apply(s: C4, p: number, col: number): BoardState {
  const r = c4Drop(s.grid, col);
  s.grid[r][col] = p;
  s.last = { p, ev: 'drop', x: col };
  const line = c4Line(s.grid, r, col);
  if (line) { s.winner = p; s.win = line; s.scores[p]++; return s; }
  if (s.grid[0].every((x) => x !== null)) { s.winner = -1; return s; }
  s.turn = next(s);
  return s;
}
function caravanNext(s: Caravan): Caravan {
  let t = next(s);
  // Oasis : le joueur passe son prochain tour.
  for (let i = 0; i < s.n && s.skip[t]; i++) { s.skip[t] = false; t = (t + 1) % s.n; }
  s.turn = t;
  return s;
}
function hangPlay(s: Hangman, p: number, m: { k: 'l'; c: string } | { k: 'w'; w: string }): Hangman {
  const word = s.words[s.round];
  let found = false;
  if (m.k === 'l') {
    const c = foldLetter(m.c);
    s.guessed.push(c);
    found = [...word].some((x) => foldLetter(x) === c);
    s.last = { p, ok: found, ev: 'letter' };
    if (found && hangComplete(word, s.guessed)) return hangRoundWon(s, p);
  } else {
    const strip = (x: string) => [...foldLetter(x)].filter(isLetter).join('');
    found = strip(m.w) === strip(word);
    s.last = { p, ok: found, ev: 'word' };
    if (found) return hangRoundWon(s, p);
  }
  if (!found) {
    s.lives[p]--;
    const alive = s.lives.map((l, i) => (l > 0 ? i : -1)).filter((i) => i >= 0);
    if (!alive.length) return hangRoundOver(s, null); // personne n'a trouvé
    s.turn = alive.includes(next(s)) ? next(s) : alive[0];
  }
  return s;
}
function hangRoundWon(s: Hangman, p: number): Hangman {
  s.scores[p]++;
  return hangRoundOver(s, p);
}
function hangRoundOver(s: Hangman, p: number | null): Hangman {
  s.done = true;
  s.last = { p: p ?? -1, ok: p !== null, ev: 'round' };
  return s;
}
/** Pendu : manche suivante (après avoir montré le mot). */
export function hangNext(s0: Hangman): Hangman {
  const s = structuredClone(s0);
  if (!s.done) return s;
  if (s.round + 1 >= Math.min(HANG_ROUNDS, s.words.length)) {
    s.winner = s.scores[0] === s.scores[1] ? -1 : s.scores[0] > s.scores[1] ? 0 : 1;
    return s;
  }
  s.round++; s.guessed = []; s.lives = Array(s.n).fill(HANG_LIVES); s.done = false; s.last = undefined;
  s.turn = s.round % s.n;
  return s;
}

// ------------------------------------------------------------------ vue d'un joueur (informations cachées)
/** Ce qu'un joueur a le droit de voir (bateaux adverses, cartes retournées, mot du pendu). */
export function viewFor(s0: BoardState, p: number | null): BoardState {
  const v = structuredClone(s0) as BoardState;
  const s = s0 as any;
  if (v.game === 'ships') {
    for (let i = 0; i < 2; i++) {
      if (i === p || s.winner !== null) continue;
      // Bateaux adverses : seulement ceux coulés.
      v.fleets[i] = s.fleets[i].filter((sh: number[]) => sunk(sh, s.shots[1 - i]));
    }
  } else if (v.game === 'memory') {
    v.cards = s.cards.map((c: { iso: string; face: "flag" | "name" }, i: number) => (s.owner[i] !== null || s.open.includes(i) || s.miss.includes(i) ? c : { iso: '', face: c.face }));
  } else if (v.game === 'hangman') {
    v.words = s.words.map((w: string, i: number) => (i < s.round || (i === s.round && s.done) || s.winner !== null ? w : hangMask(w, i === s.round ? s.guessed : []).map((c) => c || '_').join('')));
  }
  delete v.pending;
  return v;
}

// ------------------------------------------------------------------ l'ordi
export type Level = 'easy' | 'medium' | 'hard';
export const BOT_RIGHT: Record<Level, number> = { easy: 0.55, medium: 0.7, hard: 0.85 };

export function botMove(s: BoardState, p: number, level: Level, rnd: Rnd, memory?: Map<number, string>): Move {
  const rand = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const sloppy = level === 'easy' ? 0.35 : level === 'medium' ? 0.12 : 0;
  switch (s.game) {
    case 'ttt': {
      const free = s.cells.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
      if (rnd() < sloppy) return rand(free);
      // Gagner, sinon bloquer, sinon le centre, sinon un coin.
      for (const who of [p, 1 - p]) for (const [a, b, c] of LINES3) {
        const l = [a, b, c].map((i) => s.cells[i]);
        if (l.filter((x) => x === who).length === 2 && l.includes(null)) return [a, b, c][l.indexOf(null)];
      }
      if (s.cells[4] === null) return 4;
      const corners = [0, 2, 6, 8].filter((i) => s.cells[i] === null);
      return corners.length ? rand(corners) : rand(free);
    }
    case 'c4': case 'c4q': {
      const cols = Array.from({ length: COLS }, (_, i) => i).filter((c) => s.grid[0][c] === null);
      if (rnd() < sloppy) return rand(cols);
      const depth = level === 'easy' ? 1 : level === 'medium' ? 3 : 5;
      let best = cols[0], bestV = -Infinity;
      for (const c of [...cols].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3))) {
        const v = -c4Nega(s.grid, c, p, depth);
        if (v > bestV) { bestV = v; best = c; }
      }
      return best;
    }
    case 'ships': {
      const shots = s.shots[p], hits = s.hits[p];
      const opp = 1 - p;
      const open = hits.filter((h) => !s.fleets[opp].some((sh) => sh.includes(h) && sunk(sh, shots)));
      const ok = (x: number) => x >= 0 && x < SEA * SEA && !shots.includes(x);
      if (open.length && rnd() > sloppy) {
        const around = open.flatMap((h) => [h - SEA, h + SEA, ...(h % SEA ? [h - 1] : []), ...((h + 1) % SEA ? [h + 1] : [])]).filter(ok);
        if (around.length) return rand(around);
      }
      const free = Array.from({ length: SEA * SEA }, (_, i) => i).filter(ok);
      const parity = free.filter((x) => (Math.floor(x / SEA) + (x % SEA)) % 2 === 0);
      return rand(parity.length ? parity : free);
    }
    case 'hangman': {
      const word = foldLetter(s.words[s.round]);
      const freq = level === 'hard' ? 'AEIOURSNTLMCDP' : 'EAISNRTOULDCMP';
      const arabic = /[؀-ۿ]/.test(word);
      const order = arabic ? [...'اليمنرتبوهدعسقكفحجشصطزخذثضظغء'] : [...freq, ...'BGHFVJKQWXYZ'];
      const left = order.filter((c) => !s.guessed.includes(c));
      // L'ordi « devine » un peu le mot quand il en voit l'essentiel (selon le niveau).
      const shown = hangMask(s.words[s.round], s.guessed).filter(Boolean).length / [...s.words[s.round]].length;
      if (level !== 'easy' && shown > (level === 'hard' ? 0.6 : 0.75) && rnd() < 0.6) {
        const missing = [...word].find((c) => isLetter(c) && !s.guessed.includes(c));
        if (missing) return { k: 'l', c: missing };
      }
      return { k: 'l', c: rnd() < sloppy ? rand(left) : left[0] };
    }
    case 'dots': {
      const free = s.edges.map((e, i) => (e === null ? i : -1)).filter((i) => i >= 0);
      const sides = (b: number, extra: number) => boxEdges(b).filter((x) => s.edges[x] !== null || x === extra).length;
      const closing = free.filter((e) => boxesOf(e).some((b) => sides(b, e) === 4));
      if (closing.length && rnd() > sloppy) return rand(closing);
      const safe = free.filter((e) => !boxesOf(e).some((b) => sides(b, e) === 3));
      return rand(safe.length && rnd() > sloppy ? safe : free);
    }
    case 'memory': {
      const hidden = s.cards.map((_, i) => i).filter((i) => s.owner[i] === null && !s.open.includes(i));
      const mem = memory ?? new Map<number, string>();
      const known = [...mem.entries()].filter(([i]) => hidden.includes(i));
      if (s.open.length === 1) {
        const iso = s.cards[s.open[0]].iso;
        const twin = known.find(([i, x]) => x === iso && i !== s.open[0]);
        if (twin && rnd() > sloppy) return twin[0];
        return rand(hidden.filter((i) => !mem.has(i)).length ? hidden.filter((i) => !mem.has(i)) : hidden);
      }
      // Une paire déjà vue ?
      const byIso = new Map<string, number[]>();
      for (const [i, x] of known) byIso.set(x, [...(byIso.get(x) ?? []), i]);
      const pair = [...byIso.values()].find((v) => v.length >= 2);
      if (pair && rnd() > sloppy) return pair[0];
      const unseen = hidden.filter((i) => !mem.has(i));
      return rand(unseen.length ? unseen : hidden);
    }
    case 'caravan': return { k: 'roll' };
    case 'awale': {
      const moves = awaleLegal(s, p);
      if (rnd() < sloppy) return rand(moves);
      const depth = level === 'easy' ? 1 : level === 'medium' ? 3 : 5;
      let best = moves[0], bestV = -Infinity;
      for (const m of moves) {
        const v = awaleSearch(play(s, p, m, rnd) as Awale, p, depth - 1, rnd);
        if (v > bestV) { bestV = v; best = m; }
      }
      return best;
    }
  }
}
/** Négamax avec élagage alpha-bêta : valeur de la position pour le joueur `p` qui vient de jouer `col`, vue par l'adversaire. */
function c4Nega(g0: (number | null)[][], col: number, p: number, depth: number, alpha = -Infinity, beta = Infinity): number {
  const g = g0.map((r) => [...r]);
  const r = c4Drop(g, col);
  g[r][col] = p;
  if (c4Line(g, r, col)) return -1000 - depth;
  if (depth <= 0 || g[0].every((x) => x !== null)) return -c4Score(g, p);
  let best = -Infinity;
  for (const c of [3, 2, 4, 1, 5, 0, 6]) {
    if (g[0][c] !== null) continue;
    const v = -c4Nega(g, c, 1 - p, depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? 0 : best;
}
const C4_WINDOWS: [number, number][][] = (() => {
  const w: [number, number][][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells: [number, number][] = [];
    for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) break; cells.push([rr, cc]); }
    if (cells.length === 4) w.push(cells);
  }
  return w;
})();
function c4Score(g: (number | null)[][], p: number): number {
  let sc = 0;
  for (let r = 0; r < ROWS; r++) if (g[r][3] === p) sc += 3; else if (g[r][3] === 1 - p) sc -= 3;
  for (const win of C4_WINDOWS) {
    let mine = 0, theirs = 0;
    for (const [r, c] of win) { const x = g[r][c]; if (x === p) mine++; else if (x !== null) theirs++; }
    if (!theirs) sc += [0, 1, 4, 20][mine] ?? 0;
    else if (!mine) sc -= [0, 1, 4, 25][theirs] ?? 0;
  }
  return sc;
}
function awaleSearch(s: Awale, me: number, depth: number, rnd: Rnd): number {
  if (s.winner !== null || depth <= 0) return s.scores[me] - s.scores[1 - me];
  const moves = awaleLegal(s, s.turn);
  if (!moves.length) return s.scores[me] - s.scores[1 - me];
  const vals = moves.map((m) => awaleSearch(play(s, s.turn, m, rnd) as Awale, me, depth - 1, rnd));
  return s.turn === me ? Math.max(...vals) : Math.min(...vals);
}
