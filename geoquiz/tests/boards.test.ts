import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_GAMES, answer, botMove, hangNext, initBoard, legal, play, viewFor, type BoardState, type Hangman } from '../src/shared/boards';

// Petit générateur reproductible.
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test('Jeux de duel : chaque jeu se termine entre deux ordis', () => {
  for (const game of BOARD_GAMES) {
    for (let g = 0; g < 9; g++) {
      const rnd = seeded(g + 1);
      const n = game === 'caravan' ? 2 + (g % 3) : 2;
      let s: BoardState = initBoard(game, n, 'geo', rnd, { words: ['Maroc', 'Côte d’Ivoire', 'الرباط'], flags: ['MA', 'FR', 'JP', 'BR', 'EG', 'CA', 'IT', 'SN'] });
      const mem = new Map<number, string>();
      let steps = 0;
      while (s.winner === null && steps < 2000) {
        steps++;
        if (s.game === 'hangman' && s.done) { s = hangNext(s); continue; }
        const p = s.turn;
        const view = viewFor(s, p);
        const m = botMove(view, p, (['easy', 'medium', 'hard'] as const)[g % 3], rnd, mem);
        assert.ok(legal(s, p, m), `${game} : coup illégal ${JSON.stringify(m)}`);
        s = play(s, p, m, rnd);
        if (s.game === 'memory' && s.last && typeof m === 'number') mem.set(m, s.cards[m].iso);
        if (s.ask) s = answer(s, rnd() < 0.7);
      }
      assert.notEqual(s.winner, null, `${game} ne se termine pas`);
    }
  }
});

test('Vue d\'un joueur : bateaux adverses et cartes cachés, mot masqué', () => {
  const rnd = seeded(7);
  const sh = initBoard('ships', 2, 'geo', rnd);
  const v = viewFor(sh, 0);
  assert.equal(v.game === 'ships' && v.fleets[1].length, 0);
  assert.equal(v.game === 'ships' && v.fleets[0].length, 4);
  const me = initBoard('memory', 2, 'geo', rnd, { flags: ['MA', 'FR', 'JP', 'BR', 'EG', 'CA', 'IT', 'SN'] });
  const mv = viewFor(me, 0);
  assert.ok(mv.game === 'memory' && mv.cards.every((c) => c.iso === ''));
  let h = initBoard('hangman', 2, 'geo', rnd, { words: ['Rabat', 'Lima', 'Oslo'] }) as Hangman;
  h = play(h, 0, { k: 'l', c: 'a' }, rnd) as Hangman;
  assert.equal((viewFor(h, 1) as Hangman).words[0], '_a_a_');
  assert.equal(h.turn, 0, 'lettre juste : on rejoue');
  h = play(h, 0, { k: 'l', c: 'z' }, rnd) as Hangman;
  assert.equal(h.turn, 1);
  h = play(h, 1, { k: 'w', w: 'rabat' }, rnd) as Hangman;
  assert.equal(h.scores[1], 1);
  assert.ok(h.done);
});

test('Awalé : semis, capture de 2 ou 3, pas de grand chelem', () => {
  const rnd = seeded(3);
  let s = initBoard('awale', 2, 'geo', rnd);
  assert.equal(s.game === 'awale' && s.pits.reduce((a, b) => a + b, 0), 48);
  s = { ...(s as any), pits: [0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0] };
  const r = play(s, 0, 5, rnd);
  // 2 graines semées en 6 et 7 : 6 passe à 2 mais 7 à 1 → la dernière case (7) n'est pas capturable.
  assert.equal(r.game === 'awale' && r.scores[0], 0);
  s = { ...(s as any), pits: [0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0] };
  const r2 = play(s, 0, 5, rnd);
  assert.equal(r2.game === 'awale' && r2.scores[0], 2, 'capture de 2');
});
