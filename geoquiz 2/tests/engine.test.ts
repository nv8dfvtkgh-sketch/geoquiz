// Tests du moteur (sans réseau). Nécessite des données : npm run data:demo (ou npm run data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { matches, normalize } from '../src/server/text';
import { drawQuestions, newCode, Room, type Conn } from '../src/server/rooms';
import { CATEGORIES } from '../src/server/categories';
import { zones, countries, initData, ensureRegion } from '../src/server/data';
import type { ClientMsg, RoomKind, ServerMsg, Settings } from '../src/shared/protocol';

const BUILD = path.join(__dirname, '../data/build');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(BUILD, f), 'utf8'));
initData(read('world.json'), read('countries.json'), (iso) => (fs.existsSync(path.join(BUILD, `regions/${iso}.json`)) ? read(`regions/${iso}.json`) : null));

const rooms = new Map<string, Room>();
function create(kind: RoomKind, s: Settings, hostPlays = true) {
  const code = newCode((c) => rooms.has(c));
  const room = new Room(code, kind, s, hostPlays, () => rooms.delete(code));
  rooms.set(code, room);
  return room;
}
// Simule le routage /ws/<CODE> des plateformes.
function onMessage(conn: Conn, code: string, msg: ClientMsg) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return conn.send({ t: 'error', code: 'room.notFound' });
  room.connect(conn, msg);
}

function client() {
  const msgs: ServerMsg[] = [];
  const conn: Conn = { send: (m) => msgs.push(JSON.parse(JSON.stringify(m))) };
  const last = <T extends ServerMsg['t']>(t: T) => [...msgs].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  return { conn, msgs, last };
}
const settings = (s: Partial<Settings> = {}): Settings => ({ category: 'countries', zone: 'world', difficulty: 'hard', qtype: 'map', count: 5, timeLimit: 10, soloMode: 'training', ...s });

test('saisie : une ou deux fautes, sans confondre deux pays', () => {
  const all = ['maroc', 'mali', 'niger', 'nigeria', 'iran', 'irak', 'autriche', 'australie', 'cuba'];
  assert.ok(matches('Marok', ['Maroc'], all));
  assert.ok(matches('Marrok', ['Maroc'], all), 'deux fautes');
  assert.ok(!matches('Marrokk', ['Maroc'], all), 'trois fautes');
  assert.ok(matches('Cubaa', ['Cuba'], all), 'une faute sur un nom court');
  assert.ok(!matches('Niger', ['Nigeria'], all), 'Niger ≠ Nigeria');
  assert.ok(!matches('Iran', ['Irak'], all), 'Iran ≠ Irak');
  assert.ok(!matches('Autriche', ['Australie'], all));
  assert.ok(matches('Australi', ['Australie'], all));
});

test('« selon le niveau » : facile = QCM, difficile = saisie ; facile = pays connus', () => {
  const easy = drawQuestions(settings({ qtype: 'auto', difficulty: 'easy', count: 10 }));
  assert.ok(easy.every((q) => q.kind === 'mcq'));
  const hard = drawQuestions(settings({ qtype: 'auto', difficulty: 'hard', count: 10 }));
  assert.ok(hard.every((q) => q.kind === 'type'));
  const med = drawQuestions(settings({ qtype: 'auto', difficulty: 'medium', count: 30 }));
  assert.ok(new Set(med.map((q) => q.kind)).size > 1, 'mélange en intermédiaire');
  const pool = new Set(drawQuestions(settings({ difficulty: 'easy', count: 5 })).map((q) => q.target));
  assert.ok(!pool.has('LS') && !pool.has('MC'), 'pas de micro-États en facile');
});

test('saisie tolérante', () => {
  assert.ok(matches('etats unis', ['États-Unis']));
  assert.ok(matches('MAROC', ['Maroc']));
  assert.ok(matches('Marocc', ['Maroc']));
  assert.ok(matches('Allemagen', ['Allemagne']));
  assert.ok(!matches('Mali', ['Maroc']));
  assert.ok(matches('المغرب', ['المغرب']));
  assert.ok(matches('مغرب', ['المغرب']));
  assert.ok(matches('الجزائر', ['الجزائر']));
  assert.ok(matches('أسبانيا', ['اسبانيا']));
  assert.ok(matches("cote d'ivoire", ['Côte d’Ivoire']));
  assert.equal(normalize('La République Tchèque'), 'tcheque');
});

test('aucune question ne contient la réponse', async () => {
  for (const z of zones.values()) if (z.region) await ensureRegion(z.region.iso);
  for (const cat of Object.keys(CATEGORIES)) {
    const zone = [...zones.values()].find((z) => z.info.categories.includes(cat))!;
    for (const qtype of ['map', 'mcq', 'type'] as const) {
      const qs = drawQuestions(settings({ category: cat, zone: zone.info.id, qtype }));
      assert.ok(qs.length > 0, `${cat}/${qtype}`);
      for (const q of qs) {
        if (q.kind === 'mcq') {
          assert.ok(q.options!.length >= 2 && q.options!.length <= 4);
          assert.equal(new Set(q.options!.map((o) => o.target)).size, q.options!.length, 'options distinctes');
        }
      }
    }
  }
});

test('« Iran » refusé pour « Irak » ; pièges du QCM plausibles', () => {
  const qs = drawQuestions(settings({ qtype: 'type', count: 30 }));
  const ma = qs.find((q) => q.target === 'MA');
  if (ma) {
    assert.ok(ma.check('Maroc') && ma.check('Morocco') && ma.check('المغرب') && ma.check('marruecos'));
    assert.ok(!ma.check('Mali'));
  }
  const dz = qs.find((q) => q.target === 'DZ');
  if (dz) assert.ok(!dz.check('Maroc'));
});

test('Maroc : tracé officiel, Sahara inclus', () => {
  assert.ok(countries.MA);
  assert.ok(!countries.EH);
  assert.ok(['MR', 'ML'].some((n) => countries.MA.neighbors.includes(n)), 'le Sahara est rattaché au Maroc');
  assert.ok(zones.has('r:MA:groups'));
});

test('solo entraînement : 3 essais sur la carte, puis la bonne zone est révélée', () => {
  const a = client();
  const solo = create('solo', settings({ count: 3 }));
  onMessage(a.conn, solo.code, { t: 'join', name: 'Ana', lang: 'fr' });
  const q = a.last('question')!.q;
  assert.equal(q.kind, 'map');
  assert.equal(q.attempts, 3);
  assert.ok(!('target' in q), 'pas de réponse dans la question');
  const wrong = q.map!.active.filter((id) => id !== a.conn.room!.round!.q.target);
  onMessage(a.conn, solo.code, { t: 'answer', q: 0, value: wrong[0] });
  assert.equal(a.last('feedback')!.attemptsLeft, 2);
  assert.equal(a.last('feedback')!.reveal, undefined, 'pas de révélation avant la fin');
  onMessage(a.conn, solo.code, { t: 'answer', q: 0, value: wrong[1] });
  onMessage(a.conn, solo.code, { t: 'answer', q: 0, value: wrong[2] });
  const fb = a.last('feedback')!;
  assert.ok(fb.done && !fb.correct && fb.reveal?.id);
  onMessage(a.conn, solo.code, { t: 'next' });
  assert.equal(a.last('question')!.q.index, 1);
});

test('duel : mêmes questions, points selon la justesse et la vitesse, revanche', async () => {
  const a = client(), b = client();
  const duel = create('duel', settings({ qtype: 'mcq', count: 3 }));
  onMessage(a.conn, duel.code, { t: 'join', name: 'Ana', lang: 'fr' });
  const code = a.last('joined')!.room.code;
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  onMessage(b.conn, code, { t: 'join', name: 'Ben', lang: 'ar' });
  await new Promise((r) => setTimeout(r, 1700));
  const qa = a.last('question')!.q, qb = b.last('question')!.q;
  assert.equal(qa.index, 0);
  assert.deepEqual(qa.options!.map((o) => o.id), qb.options!.map((o) => o.id));
  assert.notEqual(qa.options![0].label, qb.options![0].label, 'chaque joueur dans sa langue');
  const room = a.conn.room!;
  for (let i = 0; i < 3; i++) {
    const correct = room.round!.q.revealOption!;
    const wrong = room.round!.q.options!.find((o) => o.id !== correct)!.id;
    onMessage(a.conn, code, { t: 'answer', q: i, value: correct });
    onMessage(b.conn, code, { t: 'answer', q: i, value: wrong });
    await new Promise((r) => setTimeout(r, 450));
    const rv = a.last('reveal')!;
    assert.equal(rv.q, i);
    assert.equal(rv.reveal.optionId, correct);
    room.handle(a.conn, { t: 'next' });
  }
  await new Promise((r) => setTimeout(r, 100));
  const fin = a.last('finished')!;
  assert.equal(fin.players[0].name, 'Ana');
  assert.ok(fin.players[0].score >= 1500 && fin.players[1].score === 0);
  assert.equal(fin.recap.length, 3);
  onMessage(a.conn, code, { t: 'rematch' });
  assert.deepEqual(a.last('room')!.room.rematchVotes, [a.last('joined')!.you]);
  onMessage(b.conn, code, { t: 'rematch' });
  assert.equal(a.last('question')!.q.index, 0);
  room.destroy();
});

test('salle : code, pseudos en double, animateur, reconnexion', async () => {
  const host = client(), p1 = client(), p2 = client(), p3 = client();
  const r = create('room', settings({ count: 2, timeLimit: 5 }), false);
  onMessage(host.conn, r.code, { t: 'join', name: 'Prof', lang: 'fr' });
  const code = host.last('joined')!.room.code;
  onMessage(p1.conn, code.toLowerCase(), { t: 'join', name: 'Sami', lang: 'fr' });
  onMessage(p2.conn, code, { t: 'join', name: 'sami', lang: 'en' });
  assert.equal(p2.last('joined')!.room.players.find((p) => p.id === p2.last('joined')!.you)!.name, 'sami 2');
  onMessage(p3.conn, 'ZZZZZZ', { t: 'join', name: 'X', lang: 'fr' });
  assert.equal(p3.last('error')!.code, 'room.notFound');
  onMessage(p1.conn, code, { t: 'start' });
  assert.equal(p1.last('question'), undefined, 'seul l’hôte lance');
  onMessage(host.conn, code, { t: 'start' });
  assert.equal(host.last('room')!.room.players.length, 2, "l'animateur ne joue pas");
  const token = p1.last('joined')!.token;
  p1.conn.room!.detach(p1.conn); // coupure réseau
  const p1b = client();
  onMessage(p1b.conn, code, { t: 'resume', token, lang: 'es' });
  assert.equal(p1b.last('question')!.q.index, 0, 'reprend la question en cours');
  const room = host.conn.room!;
  onMessage(p1b.conn, code, { t: 'answer', q: 0, value: room.round!.q.target });
  onMessage(p2.conn, code, { t: 'answer', q: 0, value: 'XX' });
  assert.equal(host.last('progress')!.answered, 1);
  onMessage(host.conn, code, { t: 'next' }); // l'animateur clôt la question
  const rv = host.last('reveal')!;
  assert.equal(rv.players[0].id, p1b.last('joined')!.you);
  room.destroy();
});

test('régions : la carte se charge avant la première question', async () => {
  const a = client();
  const r = create('solo', settings({ category: 'regions', zone: 'r:MA:groups', qtype: 'mcq', count: 3 }));
  onMessage(a.conn, r.code, { t: 'join', name: 'Ana', lang: 'ar' });
  await new Promise((res) => setTimeout(res, 20));
  const q = a.last('question')!.q;
  assert.equal(q.map!.map, 'region:MA:groups');
  assert.ok(q.options!.every((o) => o.label && /[؀-ۿ]/.test(o.label)), 'options en arabe');
  r.destroy();
  assert.ok(!rooms.has(r.code));
});

test('partie rapide : deux joueurs sont associés dans un duel', async () => {
  const { QuickQueue } = await import('../src/server/quick');
  const q = new QuickQueue((s) => create('duel', s).code);
  const a = client(), b = client();
  await q.handle(a.conn, { t: 'quick', settings: settings() });
  assert.ok(a.last('quickWaiting'));
  await q.handle(b.conn, { t: 'quick', settings: settings() });
  const code = a.last('matched')!.code;
  assert.equal(b.last('matched')!.code, code);
  assert.equal(rooms.get(code)!.kind, 'duel');
});
