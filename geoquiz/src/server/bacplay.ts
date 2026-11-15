// Petit Bac côté serveur : manches, STOP, vérification des mots, vote des joueurs, points.
// Une partie = plusieurs manches ; chaque manche : roulette (lettre) → écriture → vote → résultats.
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

/** Vérification d'un mot seul (sans le vote). */
export function checkWord(cat: string, word: string, letter: string, solo: boolean): BacStatus {
  const w = word.trim();
  if (!w) return 'empty';
  const norm = normalize(w);
  // « La Paz » : l'initiale compte avec l'article ; « le Mali » : sans.
  if (initial(w) !== letter && initial(norm) !== letter) return 'letter';
  const c = BAC_BY_ID[cat];
  if (c?.check === 'country') return countryNameSet.has(norm) ? 'known' : 'bad';
  if (c?.check === 'capital') return capitalNameSet.has(norm) ? 'known' : 'bad';
  if (c?.check === 'list' && bacWords(cat)?.has(norm)) return 'known';
  return solo ? 'unchecked' : 'vote';
}

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
    if (!this.solo) {
      // Mots inconnus : soumis au vote des autres joueurs.
      for (const [id, a] of this.answers) a.forEach((w, i) => {
        if (checkWord(this.cfg.cats[i], w, this.letter, false) !== 'vote') return;
        const key = `${i}:${normalize(w)}`;
        const v = this.votes.get(key) ?? { cat: i, word: w.trim(), by: new Set<string>(), rejects: new Set<string>() };
        v.by.add(id);
        this.votes.set(key, v);
      });
    }
    if (this.votes.size) { this.phase = 'vote'; this.at(BAC_MS.vote, () => this.endVote()); this.broadcast(); }
    else this.endVote();
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
    for (const p of players) {
      const a = this.answers.get(p.id) ?? this.cfg.cats.map(() => '');
      cells.set(p.id, a.map((w, i) => {
        let status = checkWord(this.cfg.cats[i], w, this.letter, this.solo);
        if (status === 'vote') status = refused.has(`${i}:${normalize(w)}`) ? 'rejected' : 'ok';
        return { word: w.trim(), status, points: 0 };
      }));
    }
    const good = (s: BacStatus) => s === 'ok' || s === 'known';
    this.cfg.cats.forEach((_, i) => {
      const count = new Map<string, number>();
      for (const c of cells.values()) if (good(c[i].status)) count.set(normalize(c[i].word), (count.get(normalize(c[i].word)) ?? 0) + 1);
      for (const c of cells.values()) if (good(c[i].status)) c[i].points = (count.get(normalize(c[i].word)) ?? 0) > 1 ? 5 : 10;
      // Solo : un mot que le site ne connaît pas compte, mais moitié moins.
      for (const c of cells.values()) if (c[i].status === 'unchecked') c[i].points = 5;
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
