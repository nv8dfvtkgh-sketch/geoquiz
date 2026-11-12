// Tests du moteur (sans réseau). Nécessite des données : npm run data:demo (ou npm run data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { matches, normalize } from '../src/server/text';
import { drawQuestions, newCode, Room, type Conn } from '../src/server/rooms';
import { CATEGORIES } from '../src/server/categories';
import { zones, countries, initData, ensureRegion, EXTRA_FILES } from '../src/server/data';
import type { ClientMsg, RoomKind, ServerMsg, Settings } from '../src/shared/protocol';

const BUILD = path.join(__dirname, '../data/build');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(BUILD, f), 'utf8'));
initData(read('world.json'), read('countries.json'), (iso) => (fs.existsSync(path.join(BUILD, `regions/${iso}.json`)) ? read(`regions/${iso}.json`) : null), Object.fromEntries(EXTRA_FILES.map((k) => [k, read(`${k}.json`)])));

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
    if (cat === 'custom' || cat === 'monuments') continue; // quiz créés, monuments (photos) : tests dédiés plus bas
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

test('nouveaux jeux : silhouettes, monnaies, langues, calcul mental', () => {
  // Silhouettes : la forme est recentrée (pas les coordonnées de la carte) et la réponse n'y figure pas.
  const sil = drawQuestions(settings({ category: 'silhouettes', qtype: 'mcq', count: 5 }));
  assert.ok(sil.length && sil.every((q) => q.shape && q.shape.w > 0 && !q.shape.d.includes(q.target)));
  // Monnaies : 4 monnaies différentes.
  const cur = drawQuestions(settings({ category: 'currencies', qtype: 'mcq', count: 10 }));
  for (const q of cur) {
    const codes = q.options!.map((o) => countries[o.target].currency!.code);
    assert.equal(new Set(codes).size, codes.length, 'pas deux fois la même monnaie');
  }
  const typed = drawQuestions(settings({ category: 'currencies', qtype: 'type', count: 30 })).find((q) => q.target === 'MA');
  if (typed) assert.ok(typed.check('dirham') && typed.check('Dirham marocain') && typed.check('درهم مغربي'));
  // Langues : salutation, accepte tous les pays où la langue est parlée.
  const lang = drawQuestions(settings({ category: 'languages', qtype: 'map', difficulty: 'hard', count: 50 }));
  const ar = lang.find((q) => q.target === 'ar');
  assert.ok(ar && ar.check('MA') && ar.check('EG') && !ar.check('FR'));
  const fr = drawQuestions(settings({ category: 'languages', qtype: 'type', difficulty: 'hard', count: 50 })).find((q) => q.target === 'fr');
  assert.ok(fr && fr.check('francais') && fr.check('French') && fr.check('الفرنسية'));
  // Calcul mental : réponse exacte, chiffres arabes acceptés.
  const calc = drawQuestions(settings({ category: 'calc', qtype: 'type', difficulty: 'medium', count: 10 }));
  for (const q of calc) {
    const v = q.answer.fr;
    assert.ok(q.check(v) && q.check(` ${v} `) && !q.check(String(+v + 1)));
    const arabic = v.replace(/\d/g, (c) => '٠١٢٣٤٥٦٧٨٩'[+c]);
    assert.ok(q.check(arabic), 'chiffres arabes ' + arabic);
  }
  const mcq = drawQuestions(settings({ category: 'calc', qtype: 'mcq', difficulty: 'easy', count: 10 }));
  assert.ok(mcq.every((q) => q.options!.length === 4 && new Set(q.options!.map((o) => o.target)).size === 4));
});

test('Battle Royale : duels par paires, cœurs perdus, dernier survivant', async () => {
  const r = create('room', settings({ count: 20, timeLimit: 5, qtype: 'mcq', mode: 'battle' }), false);
  const host = client();
  onMessage(host.conn, r.code, { t: 'join', name: 'Prof', lang: 'fr' });
  const ps = ['Ana', 'Ben', 'Chloé'].map((n) => { const c = client(); onMessage(c.conn, r.code, { t: 'join', name: n, lang: 'fr' }); return c; });
  onMessage(host.conn, r.code, { t: 'start' });
  let snap = host.last('room')!.room;
  assert.equal(snap.pairs!.length, 2, '3 joueurs : un duel et un joueur seul');
  assert.ok(snap.players.every((p) => p.lives === 3));
  const anaId = ps[0].last('joined')!.you;
  // Ana répond toujours juste et vite, les autres se trompent : elle doit rester seule en vie.
  for (let i = 0; i < 6 && r.state !== 'finished'; i++) {
    const correct = r.round!.q.revealOption!;
    const wrong = r.round!.q.options!.find((o) => o.id !== correct)!.id;
    ps.forEach((c, k) => onMessage(c.conn, r.code, { t: 'answer', q: r.qIndex, value: k === 0 ? correct : wrong }));
    await new Promise((res) => setTimeout(res, 450));
    const rv = host.last('reveal')!;
    assert.ok(!rv.battle!.lost.includes(anaId), 'Ana ne perd jamais de cœur');
    onMessage(host.conn, r.code, { t: 'next' });
  }
  assert.equal(r.state, 'finished');
  const fin = host.last('finished')!;
  assert.equal(fin.players[0].id, anaId, 'la survivante est première');
  assert.ok(fin.players.slice(1).every((p) => p.out));
  r.destroy();
});

test('Équipes : répartition équilibrée et score par équipe', async () => {
  const r = create('room', settings({ count: 2, timeLimit: 5, qtype: 'mcq', mode: 'teams', teams: 2 }), true);
  const cs = ['A', 'B', 'C', 'D'].map((n) => { const c = client(); onMessage(c.conn, r.code, { t: 'join', name: n, lang: 'fr' }); return c; });
  onMessage(cs[0].conn, r.code, { t: 'start' });
  const snap = cs[0].last('room')!.room;
  const sizes = snap.teams!.map((t) => t.size).sort();
  assert.deepEqual(sizes, [2, 2]);
  const correct = r.round!.q.revealOption!;
  cs.forEach((c) => onMessage(c.conn, r.code, { t: 'answer', q: 0, value: correct }));
  await new Promise((res) => setTimeout(res, 450));
  const rv = cs[0].last('reveal')!;
  const total = rv.players.reduce((s, p) => s + p.score, 0);
  assert.equal(rv.teams!.reduce((s, t) => s + t.score, 0), total, 'le score des équipes = somme des joueurs');
  r.destroy();
});

test('Crée ton quiz : validation par l’admin, test solo du créateur, photo par jeton', async () => {
  const { QuizService } = await import('../src/server/quizzes');
  const { config } = await import('../src/server/rooms');
  const mem = new Map<string, unknown>();
  const svc = new QuizService({
    get: async (k) => mem.get(k) as any, put: async (k, v) => void mem.set(k, JSON.parse(JSON.stringify(v))),
    delete: async (k) => void mem.delete(k), list: async (p) => [...mem.keys()].filter((k) => k.startsWith(p)),
  });
  config.loadQuiz = (id, tok) => svc.playable(id, tok);
  const png = 'data:image/png;base64,' + Buffer.from('fausse image').toString('base64');
  const q = (text: string, image?: unknown) => ({ text, answers: ['A', 'B', 'C'], correct: 1, image });
  await assert.rejects(svc.create({ title: 'X', questions: [q('1'), q('2')] }), /quiz.tooFew/);
  const { id, token } = await svc.create({ title: 'Mon quiz', questions: [q('Un ?', { data: png }), q('Deux ?'), q('Trois ?')] });
  assert.equal((await svc.view(id))?.title, undefined, 'invisible avant validation');
  assert.equal((await svc.view(id, token))?.status, 'pending');
  assert.equal(await svc.playable(id), null, 'pas jouable par les autres');

  // Le créateur teste en solo son brouillon.
  const solo = create('solo', settings({ category: 'custom', zone: 'world', quiz: id } as any));
  solo.quizToken = token;
  const a = client();
  onMessage(a.conn, solo.code, { t: 'join', name: 'Ana', lang: 'ar' });
  await new Promise((res) => setTimeout(res, 20));
  const first = a.last('question')!.q;
  assert.equal(first.kind, 'mcq');
  assert.equal(first.options!.length, 3);
  assert.equal(first.params.title, 'Mon quiz');
  const withImg = solo.questions.find((x) => x.imageRef)!;
  assert.match(withImg.imageRef!, new RegExp(`^quiz:${id}:`));

  // Validation, puis modification : l'ancienne version reste jouable pendant la vérification.
  await svc.approve(id);
  assert.equal((await svc.view(id))?.title, 'Mon quiz');
  await svc.update(id, token, { title: 'Mon quiz v2', questions: [q('Un ?'), q('Deux ?'), q('Trois ?'), q('Quatre ?')] });
  assert.equal((await svc.view(id, token))?.status, 'pending');
  assert.equal((await svc.playable(id))?.title, 'Mon quiz', 'version validée toujours jouable');
  await svc.reject(id, 'Photo interdite');
  assert.equal((await svc.view(id, token))?.reason, 'Photo interdite');
  await assert.rejects(svc.update(id, 'mauvais', { title: 'x', questions: [] }), /quiz.forbidden/);
  solo.destroy();
});

test('Cuisine, Animaux, Vrai ou faux : données et questions cohérentes', async () => {
  const { extras } = await import('../src/server/data');
  for (const k of ['food', 'animals'] as const) {
    // Les données de démo n'ont qu'une partie des pays : les éléments sans pays connu sont écartés.
    const raw = read(`${k}.json`) as { id: string; countries: string[] }[];
    assert.equal(extras[k].length, raw.filter((x) => x.countries.some((c) => countries[c])).length);
    for (const x of extras[k]) for (const c of x.countries) assert.ok(countries[c]);
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const qs = drawQuestions(settings({ category: k, zone: 'world', difficulty: d, qtype: 'mix', count: 20 }));
      assert.ok(qs.length >= Math.min(10, extras[k].length), `${k}/${d}`);
      for (const q of qs) {
        const item = extras[k].find((x) => x.id === q.target)!;
        if (q.kind === 'mcq') {
          const good = q.options!.filter((o) => item.countries.includes(o.target));
          assert.equal(good.length, 1, 'une seule bonne réponse parmi les choix');
          assert.ok(q.check(q.revealOption!));
        }
        if (q.kind === 'map') assert.ok(q.check(item.countries[0]));
        if (q.kind === 'type') assert.ok(q.check(countries[item.countries[0]].names.fr));
      }
    }
  }
  const couscous = drawQuestions(settings({ category: 'food', zone: 'world', qtype: 'type', difficulty: 'easy', count: 50 })).find((q) => q.target === 'couscous')!;
  assert.ok(couscous.check('Maroc') && !couscous.check('Égypte'));
  if (countries.DZ) assert.ok(couscous.check('Algérie'));

  const tf = drawQuestions(settings({ category: 'truefalse', zone: 'world', difficulty: 'hard', qtype: 'auto', count: 50 }));
  assert.ok(tf.length >= 20 && tf.every((q) => q.kind === 'mcq' && q.options!.length === 2));
  assert.ok(tf.some((q) => q.target.startsWith('cap:')) && tf.some((q) => q.target.startsWith('cur:')));
  for (const q of tf) {
    const truth = q.revealOption === 'o0';
    if (q.target.startsWith('f:')) assert.equal(truth, extras.truefalse.find((x) => `f:${x.id}` === q.target)!.answer);
    if (q.target.startsWith('cap:')) {
      const c = countries[q.target.slice(4)];
      assert.equal(truth, q.promptName!.fr.endsWith(`— ${c.capital!.names.fr}`), q.promptName!.fr);
    }
  }
});

test('Rébus emojis et Monuments (photos Wikipédia simulées)', async () => {
  const { extras } = await import('../src/server/data');
  const { ensurePhotos, photoFor, resetPhotos } = await import('../src/server/photos');
  // Rébus : un seul bon choix, pièges du même thème, saisie dans toutes les langues.
  const emo = drawQuestions(settings({ category: 'emoji', zone: 'world', difficulty: 'hard', qtype: 'mix', count: 50 }));
  assert.ok(emo.length >= 30);
  for (const q of emo) {
    const item = extras.emoji.find((x) => x.id === q.target)!;
    if (q.kind === 'mcq') {
      assert.ok(q.options!.every((o) => extras.emoji.find((x) => x.id === o.target)!.theme === item.theme));
      assert.ok(q.check(q.revealOption!));
    } else assert.ok(q.check(q.answer.fr) && q.check(q.answer.en), q.answer.fr);
  }
  const lion = drawQuestions(settings({ category: 'emoji', zone: 'world', difficulty: 'easy', qtype: 'type', count: 50 })).find((q) => q.target === 'f-lionking')!;
  assert.ok(lion.check('le roi lion') && lion.check('The Lion King') && lion.check('الأسد الملك') && !lion.check('Titanic'));

  // Monuments : Wikipédia simulé (un monument sans photo libre).
  resetPhotos();
  const calls: string[] = [];
  const fake = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const titles = u.searchParams.get('titles')!.split('|');
    if (u.searchParams.get('prop') === 'pageimages') {
      return new Response(JSON.stringify({ query: {
        normalized: titles.filter((t) => t.includes('_')).map((t) => ({ from: t, to: t.replace(/_/g, ' ') })),
        pages: titles.filter((t) => t !== 'Atomium').map((t) => ({ title: t.replace(/_/g, ' '), pageimage: `${t.replace(/ /g, '_')}.jpg`, thumbnail: { source: `https://upload.example/${encodeURIComponent(t)}.jpg` } })),
      } }));
    }
    return new Response(JSON.stringify({ query: {
      normalized: titles.map((t) => ({ from: t, to: t.replace(/_/g, ' ') })),
      pages: titles.map((t) => ({ title: t.replace(/_/g, ' '), imageinfo: [{ extmetadata: { Artist: { value: '<a href="x">Jean Photo</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] })),
    } }));
  };
  assert.ok(await ensurePhotos(extras.monuments, fake as any));
  assert.ok(await ensurePhotos(extras.monuments, fake as any));
  assert.ok(calls.length <= 6, 'chargé une seule fois');
  assert.equal(photoFor('atomium'), undefined);
  assert.equal(photoFor('eiffel')?.credit, 'Jean Photo · CC BY-SA 4.0 · Wikimedia Commons');
  const mons = drawQuestions(settings({ category: 'monuments', zone: 'world', difficulty: 'hard', qtype: 'mix', count: 50 }));
  assert.ok(mons.length >= Math.min(20, extras.monuments.length - 1) && !mons.some((q) => q.target === 'atomium'));
  for (const q of mons) {
    const m = extras.monuments.find((x) => x.id === q.target)!;
    assert.equal(q.imageRef, `wiki:${m.id}`);
    assert.ok(q.credit);
    if (q.kind === 'map') assert.ok(q.check(m.country));
    if (q.kind === 'mcq') assert.ok(q.check(q.revealOption!));
    if (q.kind === 'type') assert.ok(q.check(countries[m.country].names.fr) && q.check(m.names.en));
  }
});

test('Comptes : inscription, connexion, progression, badges, classement, admin', async () => {
  const { AccountService, accountRoute, levelOf } = await import('../src/server/accounts');
  const store = new Map<string, unknown>();
  const kv = {
    get: async (k: string) => (store.has(k) ? structuredClone(store.get(k)) : undefined) as any,
    put: async (k: string, v: unknown) => { store.set(k, structuredClone(v)); },
    delete: async (k: string) => { store.delete(k); },
    list: async (p: string) => [...store.keys()].filter((k) => k.startsWith(p)),
  };
  let now = Date.UTC(2026, 10, 12, 10);
  const svc = new AccountService(kv, () => now);
  const err = async (f: () => Promise<unknown>) => { try { await f(); return ''; } catch (e) { return (e as Error).message; } };

  assert.equal(await err(() => svc.register({ pseudo: 'ab', password: 'secret1', age: '18+', email: 'a@b.co' })), 'account.pseudoFormat');
  assert.equal(await err(() => svc.register({ pseudo: 'Gros Connard', password: 'secret1', age: '18+', email: 'a@b.co' })), 'account.pseudoRefused');
  assert.equal(await err(() => svc.register({ pseudo: 'Yasmine', password: 'secret1', age: '18+' })), 'account.emailInvalid');
  assert.equal(await err(() => svc.register({ pseudo: 'Yasmine', password: '123', age: '18+', email: 'y@x.ma' })), 'account.passwordShort');
  const y = await svc.register({ pseudo: 'Yasmine', password: 'secret1', age: '18+', email: 'Y@X.ma', country: 'MA', avatar: '🐪', optin: true });
  assert.equal(y.me.email, 'y@x.ma');
  assert.equal(await err(() => svc.register({ pseudo: 'yasmine', password: 'secret1', age: '13-17', email: 'z@x.ma' })), 'account.pseudoTaken');
  // Moins de 13 ans : pas d'e-mail gardé, pas d'accord nouveautés.
  const kid = await svc.register({ pseudo: 'Petit Lion', password: 'lion12', age: 'u13', email: 'kid@x.ma', optin: true });
  assert.equal(kid.me.email, undefined);
  assert.equal(kid.me.optin, false);

  assert.equal(await err(() => svc.login({ pseudo: 'Yasmine', password: 'mauvais' })), 'account.wrong');
  const log = await svc.login({ pseudo: 'YASMINE', password: 'secret1' });
  assert.ok((await svc.byToken(log.token))?.pseudo === 'Yasmine');

  // Partie : XP, badges, meilleur score, déblocage.
  const base = { category: 'flags', difficulty: 'easy' as const, kind: 'solo' as const, mode: 'classic' as const, zone: 'world', lang: 'fr', players: 1, rank: 1 };
  const r1 = (await svc.record(log.token, { ...base, total: 10, correct: 10, accuracy: 100 }))!;
  assert.equal(r1.xp, 10 * 10 + 10 + 25);
  assert.deepEqual(r1.badges.sort(), ['first', 'perfect']);
  assert.equal(r1.unlocked, 'medium');
  assert.equal(r1.best, 100);
  const r2 = (await svc.record(log.token, { ...base, kind: 'room', players: 4, total: 10, correct: 5, accuracy: 50, difficulty: 'medium' }))!;
  assert.ok(r2.badges.includes('winner'));
  assert.equal(r2.unlocked, undefined);
  assert.equal(await svc.record('0'.repeat(48), { ...base, total: 10, correct: 10, accuracy: 100 }), null);
  // Jours d'affilée.
  now += 86400000; await svc.record(log.token, { ...base, total: 5, correct: 1, accuracy: 20 });
  now += 86400000; const r3 = (await svc.record(log.token, { ...base, total: 5, correct: 1, accuracy: 20 }))!;
  assert.ok(r3.badges.includes('streak3'));
  const me = await svc.me((await svc.byToken(log.token))!);
  assert.equal(me.games, 4);
  assert.equal(me.cats.flags.best.easy, 100);
  assert.equal(me.level, levelOf(me.xp).level);

  const lb = await svc.leaderboard(log.token);
  assert.equal(lb.top[0].pseudo, 'Yasmine');
  assert.equal(lb.me?.rank, 1);

  // Routes et admin.
  const q = new URLSearchParams();
  assert.equal((await accountRoute(svc, 'GET', '/api/account', q, async () => ({}), 'x', null))!.status, 401);
  assert.equal((await accountRoute(svc, 'GET', '/api/admin/users', q, async () => ({}), 'x', false))!.status, 401);
  const users = (await accountRoute(svc, 'GET', '/api/admin/users', q, async () => ({}), 'pw', true))!.json as any;
  assert.equal(users.stats.users, 2);
  assert.equal(users.stats.optin, 1);
  const csv = (await accountRoute(svc, 'GET', '/api/admin/users.csv', q, async () => ({}), 'pw', true))!.text!;
  assert.ok(csv.includes('"y@x.ma","oui"') && csv.includes('"Petit Lion",""'));
  const reset = await svc.adminReset(kid.me.id);
  assert.ok((await svc.login({ pseudo: 'Petit Lion', password: reset.password })).token);
  // Suppression par le joueur.
  const acct = (await svc.byToken(log.token))!;
  assert.equal(await err(() => svc.remove(acct, 'non')), 'account.wrong');
  await svc.remove((await svc.byToken(log.token))!, 'secret1');
  assert.equal(await svc.byToken(log.token), null);
  assert.ok(!(await kv.get('pseudo:yasmine')) && !(await kv.get('email:y@x.ma')));
});

test('Fin de partie : les joueurs connectés reçoivent leur progression', async () => {
  const { config } = await import('../src/server/rooms');
  const calls: any[] = [];
  const prev = config.recordGame;
  config.recordGame = async (token, result) => { calls.push({ token, result }); return { xp: 42, total: 42, level: 1, levelUp: false, levelXp: 42, levelNeed: 100, title: 0, badges: ['first'] }; };
  const c = client();
  const room = create('solo', settings({ category: 'flags', zone: 'world', count: 3, qtype: 'mcq' }));
  onMessage(c.conn, room.code, { t: 'join', name: 'Fab', lang: 'fr' });
  onMessage(c.conn, room.code, { t: 'auth', token: 'a'.repeat(48) });
  for (let i = 0; i < 3; i++) {
    const q = c.last('question')!.q;
    assert.equal(q.index, i);
    onMessage(c.conn, room.code, { t: 'answer', q: i, value: q.options![0].id });
    onMessage(c.conn, room.code, { t: 'next' });
  }
  for (let i = 0; i < 20 && !c.last('reward'); i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].token, 'a'.repeat(48));
  assert.equal(calls[0].result.total, 3);
  assert.equal(calls[0].result.category, 'flags');
  assert.equal(c.last('reward')!.reward.xp, 42);
  config.recordGame = prev;
});

test('Page Géographie : éléments trouvés retenus sans doublon, nombre à trouver par zone', async () => {
  const { AccountService } = await import('../src/server/accounts');
  const { poolCounts } = await import('../src/server/categories');
  const store = new Map<string, unknown>();
  const kv = { get: async (k: string) => structuredClone(store.get(k)) as any, put: async (k: string, v: unknown) => { store.set(k, structuredClone(v)); }, delete: async (k: string) => { store.delete(k); }, list: async (p: string) => [...store.keys()].filter((k) => k.startsWith(p)) };
  const svc = new AccountService(kv);
  const { token } = await svc.register({ pseudo: 'Carto', password: 'secret1', age: '18+', email: 'c@x.ma' });
  const base = { category: 'flags', difficulty: 'easy' as const, kind: 'solo' as const, mode: 'classic' as const, zone: 'world', lang: 'fr', players: 1, rank: 1, total: 5, correct: 2, accuracy: 40 };
  await svc.record(token, { ...base, found: ['MA', 'FR'] });
  await svc.record(token, { ...base, found: ['MA', 'ES'] });
  const me = await svc.me((await svc.byToken(token))!);
  assert.deepEqual(me.cats.flags.found!.sort(), ['ES', 'FR', 'MA']);
  const pools = poolCounts();
  assert.ok(pools.world.countries > 0 && pools.world.capitals <= pools.world.countries);
  assert.ok(Object.keys(pools).some((z) => z.startsWith('c:')));
});

test('Connexion Google / Facebook : inscription, reconnexion, liaison par e-mail, 13 ans et plus', async () => {
  const { AccountService, accountRoute } = await import('../src/server/accounts');
  const store = new Map<string, unknown>();
  const kv = { get: async (k: string) => structuredClone(store.get(k)) as any, put: async (k: string, v: unknown) => { store.set(k, structuredClone(v)); }, delete: async (k: string) => { store.delete(k); }, list: async (p: string) => [...store.keys()].filter((k) => k.startsWith(p)) };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  let gUser = { sub: 'g-123', email: 'Amine@Gmail.com', email_verified: true, name: 'Amine El Fassi', aud: 'gid' };
  const fake = async (url: string) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ id_token: `x.${b64(gUser)}.y` }));
    if (url.includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'fbtok' }));
    if (url.startsWith('https://graph.facebook.com/me')) return new Response(JSON.stringify({ id: 'fb-9', name: 'Sara', email: 'sara@x.ma' }));
    return new Response('{}', { status: 404 });
  };
  const svc = new AccountService(kv, undefined, { google: { id: 'gid', secret: 's' }, facebook: { id: 'fid', secret: 's' } }, fake as any);
  const O = 'https://quizellige.test';
  const q = new URLSearchParams();
  const start = (await accountRoute(svc, 'GET', '/api/auth/google/start', q, async () => ({}), '', null, O))!;
  assert.equal(start.status, 302);
  const state = new URL(start.location!).searchParams.get('state')!;
  assert.ok(start.location!.includes('redirect_uri=https%3A%2F%2Fquizellige.test%2Fapi%2Fauth%2Fgoogle%2Fcallback'));
  // État inconnu : refusé.
  assert.ok((await svc.oauthCallback('google', new URLSearchParams({ code: 'c', state: 'f'.repeat(32) }), O)).includes('#autherr='));
  const cb = await svc.oauthCallback('google', new URLSearchParams({ code: 'c', state }), O);
  const ticket = cb.split('#oauth=')[1];
  assert.ok(ticket, cb);
  assert.deepEqual(await svc.oauthTicket(ticket), { provider: 'google', email: 'amine@gmail.com', name: 'Amine El Fassi' });
  const err = async (f: () => Promise<unknown>) => { try { await f(); return ''; } catch (e) { return (e as Error).message; } };
  assert.equal(await err(() => svc.oauthComplete({ ticket, pseudo: 'Amine', age: 'u13' })), 'account.ageMissing');
  const done = await svc.oauthComplete({ ticket, pseudo: 'Amine', age: '18+', optin: true });
  assert.equal(done.me.email, 'amine@gmail.com');
  assert.equal(done.me.hasPassword, false);
  assert.deepEqual(done.me.linked, ['google']);
  assert.equal(await err(() => svc.oauthComplete({ ticket, pseudo: 'Amine2', age: '18+' })), 'account.ticketExpired');
  // Reconnexion : directement connecté.
  const s2 = new URL((await svc.oauthStart('google', O))).searchParams.get('state')!;
  assert.ok((await svc.oauthCallback('google', new URLSearchParams({ code: 'c', state: s2 }), O)).includes('#auth='));
  // Compte classique existant avec le même e-mail : Facebook s'y relie.
  await svc.register({ pseudo: 'Sara', password: 'secret1', age: '13-17', email: 'sara@x.ma' });
  const s3 = new URL((await svc.oauthStart('facebook', O))).searchParams.get('state')!;
  const fb = await svc.oauthCallback('facebook', new URLSearchParams({ code: 'c', state: s3 }), O);
  const tok = fb.split('#auth=')[1];
  assert.ok(tok, fb);
  const sara = await svc.me((await svc.byToken(tok))!);
  assert.equal(sara.pseudo, 'Sara');
  assert.deepEqual(sara.linked, ['facebook']);
  // Un jeton Google destiné à une autre appli est refusé.
  gUser = { ...gUser, sub: 'g-999', aud: 'autre' };
  const s4 = new URL((await svc.oauthStart('google', O))).searchParams.get('state')!;
  assert.ok((await svc.oauthCallback('google', new URLSearchParams({ code: 'c', state: s4 }), O)).includes('#autherr=account.providerFailed'));
  // Suppression d'un compte sans mot de passe : il faut retaper son pseudo.
  const amine = (await svc.byToken(done.token))!;
  assert.equal(await err(() => svc.remove(amine, 'non')), 'account.wrong');
  await svc.remove(amine, 'amine');
  assert.equal(await kv.get('oauth:google:g-123'), undefined);
});

test('Cinéma (texte) : 4 types de questions, une bonne réponse, pas de co-vedette en piège', async () => {
  const { extras } = await import('../src/server/data');
  const seen = new Set<string>();
  for (let k = 0; k < 15; k++) {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const qs = drawQuestions(settings({ category: 'cinema', zone: 'world', difficulty: d, qtype: 'auto', count: 20 }));
      assert.ok(qs.length >= 10);
      assert.equal(new Set(qs.map((q) => q.target.split('|')[0])).size, qs.length, 'un film une seule fois');
      for (const q of qs) {
        const [id, kind] = q.target.split('|');
        seen.add(kind);
        const f = extras.cinema.films.find((x) => x.id === id)!;
        assert.equal(q.kind, 'mcq');
        assert.equal(q.options!.length, 4);
        assert.equal(new Set(q.options!.map((o) => o.label.fr)).size, 4, 'choix distincts');
        assert.ok(q.check(q.revealOption!));
        const good = q.options!.find((o) => o.id === q.revealOption)!;
        if (kind === 'actor') { assert.equal(good.target, f.actor); assert.ok(!q.options!.some((o) => f.cast?.includes(o.target))); }
        if (kind === 'director') assert.equal(good.target, f.director);
        if (kind === 'year') assert.equal(good.target, String(f.year));
        if (kind === 'character') assert.equal(good.target, f.id);
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['actor', 'character', 'director', 'year']);
  const tales = drawQuestions(settings({ category: 'emoji', zone: 'world', difficulty: 'hard', qtype: 'type', count: 400 })).filter((q) => q.target.startsWith('t-'));
  assert.ok(tales.length >= 10);
  const red = tales.find((q) => q.target === 't-redridinghood')!;
  assert.ok(red.check('le petit chaperon rouge') && red.check('Caperucita Roja') && !red.check('Les Trois Petits Cochons'));
});

test('Rébus : thème Séries TV, pièges du même thème, titres locaux acceptés', () => {
  const { extras } = require('../src/server/data');
  const theme = (id: string) => extras.emoji.find((x: any) => x.id === id).theme;
  const all = drawQuestions(settings({ category: 'emoji', zone: 'world', difficulty: 'hard', qtype: 'mcq', count: 300 }));
  for (const th of ['series', 'cartoon', 'character']) assert.ok(all.filter((q) => theme(q.target) === th).length >= 20, th);
  for (const q of all) assert.ok(q.options!.every((o) => theme(o.target) === theme(q.target)), 'pièges du même thème');
  const typed0 = drawQuestions(settings({ category: 'emoji', zone: 'world', difficulty: 'hard', qtype: 'type', count: 300 }));
  const bond = typed0.find((q) => q.target === 'h-bond')!;
  assert.ok(bond.check('James Bond') && bond.check('007') && bond.check('جيمس بوند'));
  const juha = typed0.find((q) => q.target === 'h-juha')!;
  assert.ok(juha.check('جحا') && juha.check('Goha'));
  const typed = drawQuestions(settings({ category: 'emoji', zone: 'world', difficulty: 'hard', qtype: 'type', count: 300 }));
  const majid = typed.find((q) => q.target === 's-tsubasa')!;
  assert.ok(majid.check('Olive et Tom') && majid.check('Captain Majid') && majid.check('الكابتن ماجد') && !majid.check('Naruto'));
  const casa = typed.find((q) => q.target === 's-casapapel')!;
  assert.ok(casa.check('la casa de papel') && casa.check('Money Heist'));
});
