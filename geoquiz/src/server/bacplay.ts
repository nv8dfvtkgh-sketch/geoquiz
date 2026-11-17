// Petit Bac côté serveur : manches, STOP, vérification des mots, vote des joueurs, points.
// Une partie = plusieurs manches ; chaque manche : roulette (lettre) → écriture → résultats (vérifiés par l'ordinateur).
import { BAC_BY_ID, drawLetter, type BacCell, type BacConfig, type BacStatus, type BacView } from '../shared/bac';
import { capitalNameSet, countryNameSet } from './data';
import { bacWords } from './bacwords';
import { normalize } from './text';

export const BAC_MS = { spin: 3200, vote: 30_000, round: 15_000, grace: 1500 };

export interface BacPlayer { id: string; name: string; connected: boolean }
export interface BacHost {
  players(): BacPlayer[];
  /** Membres qui regardent sans jouer (animateur). */
  watchers(): string[];
  send(id: string, view: BacView): void;
  /** Fin de partie : points de chacun, mots acceptés et cases jouées. */
  end(totals: Map<string, number>, stats: Map<string, { n: number; ok: number }>): void;
}

/** Initiale sans accents ni casse (« Él » → « E »). */
const initial = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().charAt(0).toUpperCase();

/** Une seule faute de frappe d'écart : une lettre en plus, en moins, changée, ou deux lettres inversées. */
export function oneTypo(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // une lettre changée
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // deux lettres inversées
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1); // une lettre en trop ou en moins
}

/** Mot de la liste, exact ou à une faute près (mots de 4 lettres et plus) : la forme de la liste, ou rien. */
function findKnown(set: Set<string> | undefined, norm: string): { key: string; fixed: boolean } | null {
  if (!set) return null;
  if (set.has(norm)) return { key: norm, fixed: false };
  if (norm.replace(/ /g, '').length < 4) return null;
  for (const k of set) if (k[0] === norm[0] && oneTypo(norm, k)) return { key: k, fixed: true };
  for (const k of set) if (oneTypo(norm, k)) return { key: k, fixed: true };
  return null;
}

/** Ressemble à un vrai mot (pas « zzzzz » ni « qsdfg ») : l'ordinateur décide, plus de vote. */
export function plausible(w: string): boolean {
  const n = normalize(w).replace(/[ '-]/g, '');
  if (n.length < 2) return false;
  if (/(.)\1\1/.test(n)) return false; // trois fois la même lettre
  if (/^[a-z]+$/.test(n)) {
    if (!/[aeiouy]/.test(n)) return false;
    if (/[bcdfghjklmnpqrstvwxz]{5}/.test(n)) return false;
  }
  return true;
}

/** Vérification d'un mot : listes du site (une faute permise), sinon l'ordinateur juge si c'est un vrai mot.
 *  `key` : forme qui sert à repérer deux joueurs qui ont écrit le même mot (même avec une faute). */
export function checkCell(cat: string, word: string, letter: string): { status: BacStatus; key: string } {
  const w = word.trim();
  if (!w) return { status: 'empty', key: '' };
  const norm = normalize(w);
  // « La Paz » : l'initiale compte avec l'article ; « le Mali » : sans.
  if (initial(w) !== letter && initial(norm) !== letter) return { status: 'letter', key: norm };
  const c = BAC_BY_ID[cat];
  const set = c?.check === 'country' ? countryNameSet : c?.check === 'capital' ? capitalNameSet : c?.check === 'list' ? bacWords(cat) : undefined;
  const k = findKnown(set, norm);
  if (k) return { status: k.fixed ? 'typo' : 'known', key: k.key };
  if (c?.check === 'country' || c?.check === 'capital') return { status: 'bad', key: norm };
  if (!plausible(w)) return { status: 'rejected', key: norm };
  // Catégorie avec liste (animal, métier…) : mot absent de nos listes, compté à moitié.
  return { status: c?.check === 'list' ? 'unchecked' : 'ok', key: norm };
}
/** Statut seul (ancien nom). */
export const checkWord = (cat: string, word: string, letter: string, _solo?: boolean): BacStatus => checkCell(cat, word, letter).status;

interface Vote { cat: number; word: string; by: Set<string>; rejects: Set<string> }

export class BacGame {
  round = 0;
  letter = '';
  used: string[] = [];
  phase: BacView['phase'] = 'spin';
  deadline = 0;
  timer?: ReturnType<typeof setTimeout>;
  answers = new Map<string, string[]>();
  totals = new Map<string, number>();
  stats = new Map<string, { n: number; ok: number }>();
  stopBy?: string;
  votes = new Map<string, Vote>();
  ready = new Set<string>();
  table?: BacView['table'];

  constructor(private host: BacHost, public cfg: BacConfig, public solo: boolean, private rnd: () => number = Math.random) {}

  start() { this.nextRound(); }
  stop() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  private at(ms: number, fn: () => void) {
    this.stop();
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(fn, ms);
  }

  nextRound() {
    this.round++;
    this.letter = drawLetter(this.used, this.cfg.rare, this.rnd);
    this.used.push(this.letter);
    this.answers = new Map();
    this.votes = new Map();
    this.ready = new Set();
    this.stopBy = undefined;
    this.table = undefined;
    this.phase = 'spin';
    this.at(BAC_MS.spin, () => { this.phase = 'write'; this.at(this.cfg.time * 1000 + BAC_MS.grace, () => this.endWrite()); this.broadcast(); });
    this.broadcast();
  }

  /** Réponse tapée (envoyée au fil de la saisie, pour que STOP ramasse tout). */
  fill(id: string, i: number, v: string) {
    if (this.phase !== 'write' || !Number.isInteger(i) || i < 0 || i >= this.cfg.cats.length) return;
    if (!this.host.players().some((p) => p.id === id)) return;
    const a = this.answers.get(id) ?? this.cfg.cats.map(() => '');
    const before = a.filter((x) => x.trim()).length;
    a[i] = String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 40);
    this.answers.set(id, a);
    // Les autres voient seulement le nombre de cases remplies, quand il change.
    if (a.filter((x) => x.trim()).length !== before) this.broadcast(id);
  }

  /** STOP : seulement quand toutes ses cases sont remplies. */
  stopRound(id: string) {
    if (this.phase !== 'write') return;
    const a = this.answers.get(id);
    if (!a || a.some((x) => !x.trim())) return;
    this.stopBy = this.host.players().find((p) => p.id === id)?.name;
    this.endWrite();
  }

  endWrite() {
    if (this.phase !== 'write') return;
    // Plus de vote entre joueurs : l'ordinateur vérifie tout de suite.
    this.endVote();
  }

  veto(id: string, key: string) {
    const v = this.votes.get(key);
    if (this.phase !== 'vote' || !v || v.by.has(id)) return;
    if (v.rejects.has(id)) v.rejects.delete(id); else v.rejects.add(id);
    this.broadcast();
  }
  voteDone(id: string) {
    if (this.phase !== 'vote') return;
    this.ready.add(id);
    if (this.host.players().filter((p) => p.connected).every((p) => this.ready.has(p.id))) this.endVote();
    else this.broadcast();
  }

  endVote() {
    if (this.phase !== 'write' && this.phase !== 'vote') return;
    const voters = this.host.players().filter((p) => p.connected);
    const refused = new Set<string>();
    for (const [key, v] of this.votes) {
      const eligible = voters.filter((p) => !v.by.has(p.id)).length;
      if (eligible && v.rejects.size * 2 > eligible) refused.add(key);
    }
    // Statuts, puis points : 10 seul, 5 si un autre a le même mot.
    const players = this.host.players();
    const cells = new Map<string, BacCell[]>();
    const keys = new Map<string, string[]>();
    for (const p of players) {
      const a = this.answers.get(p.id) ?? this.cfg.cats.map(() => '');
      keys.set(p.id, []);
      cells.set(p.id, a.map((w, i) => {
        const r = checkCell(this.cfg.cats[i], w, this.letter);
        keys.get(p.id)!.push(r.key);
        return { word: w.trim(), status: refused.has(`${i}:${r.key}`) ? 'rejected' : r.status, points: 0 };
      }));
    }
    const good = (s: BacStatus) => s === 'ok' || s === 'known' || s === 'typo';
    this.cfg.cats.forEach((_, i) => {
      // Même mot (à une faute près) chez plusieurs joueurs : 5 points chacun au lieu de 10.
      const count = new Map<string, number>();
      for (const [id, c] of cells) if (good(c[i].status) || c[i].status === 'unchecked') count.set(keys.get(id)![i], (count.get(keys.get(id)![i]) ?? 0) + 1);
      for (const [id, c] of cells) {
        const n = count.get(keys.get(id)![i]) ?? 0;
        if (good(c[i].status)) c[i].points = n > 1 ? 5 : 10;
        // Mot absent de nos listes (animal, métier…) : compté, mais moitié moins.
        else if (c[i].status === 'unchecked') c[i].points = 5;
      }
    });
    this.table = players.map((p) => {
      const cs = cells.get(p.id)!;
      const pts = cs.reduce((s, c) => s + c.points, 0);
      this.totals.set(p.id, (this.totals.get(p.id) ?? 0) + pts);
      const st = this.stats.get(p.id) ?? { n: 0, ok: 0 };
      st.n += cs.length; st.ok += cs.filter((c) => c.points > 0).length;
      this.stats.set(p.id, st);
      return { id: p.id, name: p.name, cells: cs, round: pts, total: this.totals.get(p.id)! };
    }).sort((a, b) => b.total - a.total);
    this.ready = new Set();
    if (this.round >= this.cfg.rounds) {
      this.phase = 'end';
      this.stop();
      this.broadcast();
      this.host.end(this.totals, this.stats);
      return;
    }
    this.phase = 'round';
    this.at(this.solo ? 60 * 60_000 : BAC_MS.round, () => this.nextRound());
    this.broadcast();
  }

  /** Manche suivante : en solo à la demande, en salle quand tout le monde est prêt (ou au bout du temps). */
  next(id: string) {
    if (this.phase !== 'round') return;
    this.ready.add(id);
    if (this.solo || this.host.players().filter((p) => p.connected).every((p) => this.ready.has(p.id))) this.nextRound();
    else this.broadcast();
  }

  viewFor(id: string): BacView {
    const filled: Record<string, number> = {};
    for (const [pid, a] of this.answers) filled[pid] = a.filter((x) => x.trim()).length;
    return {
      phase: this.phase, round: this.round, rounds: this.cfg.rounds, letter: this.letter, used: this.used, cats: this.cfg.cats,
      ms: Math.max(0, this.deadline - Date.now() - (this.phase === 'write' ? BAC_MS.grace : 0)),
      answers: this.answers.get(id) ?? this.cfg.cats.map(() => ''), filled, stopBy: this.stopBy, solo: this.solo,
      votes: this.phase === 'vote' ? [...this.votes].map(([key, v]) => ({ key, cat: v.cat, word: v.word, by: [...v.by].map((b) => this.host.players().find((p) => p.id === b)?.name ?? '?'), rejects: v.rejects.size, mine: v.by.has(id), voted: v.rejects.has(id) })) : undefined,
      ready: [...this.ready],
      table: this.table,
    };
  }
  broadcast(skip?: string) {
    for (const p of this.host.players()) if (p.id !== skip || this.phase !== 'write') this.host.send(p.id, this.viewFor(p.id));
    for (const id of this.host.watchers()) this.host.send(id, this.viewFor(id));
  }
}
