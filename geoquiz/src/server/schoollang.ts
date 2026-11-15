// Révisions de langues : questions fabriquées (conjugaison, pluriels, homophones, vocabulaire
// anglais, verbes irréguliers), pour que chaque chapitre ait assez de questions.
// Une graine donne toujours la même question. Format : [énoncé, bonne réponse, 3 pièges].
import { GRADE } from '../shared/mathtopics';

type R = () => number;
const pick = <T>(r: R, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const shuffle = <T>(r: R, xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function row(q: string, ok: string, bad: string[]): string[] | null {
  const b = [...new Set(bad.filter((x) => x && x !== ok))].slice(0, 3);
  return b.length === 3 ? [q, ok, ...b] : null;
}

// ---------------------------------------------------------------- conjugaison française
type Tense = 'present' | 'imparfait' | 'futur' | 'pc' | 'ps' | 'cond' | 'subj';
const TENSE_FR: Record<Tense, string> = { present: 'au présent', imparfait: "à l'imparfait", futur: 'au futur', pc: 'au passé composé', ps: 'au passé simple', cond: 'au conditionnel présent', subj: 'au subjonctif présent' };
const PRON = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];
const AVOIR = ['ai', 'as', 'a', 'avons', 'avez', 'ont'], ETRE = ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'];
const END: Record<string, string[]> = { imp: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'], fut: ['ai', 'as', 'a', 'ons', 'ez', 'ont'], cond: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'] };
interface Verb { inf: string; present: string[]; impStem: string; futStem: string; ps: string[]; pp: string; etre?: boolean; subj: string[] }
const er = (inf: string): Verb => {
  const s = inf.slice(0, -2);
  return { inf, present: ['e', 'es', 'e', 'ons', 'ez', 'ent'].map((e) => s + e), impStem: s, futStem: inf, ps: ['ai', 'as', 'a', 'âmes', 'âtes', 'èrent'].map((e) => s + e), pp: `${s}é`, subj: ['e', 'es', 'e', 'ions', 'iez', 'ent'].map((e) => s + e) };
};
const ir = (inf: string): Verb => {
  const s = inf.slice(0, -2);
  return { inf, present: ['is', 'is', 'it', 'issons', 'issez', 'issent'].map((e) => s + e), impStem: `${s}iss`, futStem: inf, ps: ['is', 'is', 'it', 'îmes', 'îtes', 'irent'].map((e) => s + e), pp: `${s}i`, subj: ['isse', 'isses', 'isse', 'issions', 'issiez', 'issent'].map((e) => s + e) };
};
const VERBS: Verb[] = [
  ...['chanter', 'jouer', 'parler', 'regarder', 'danser', 'marcher', 'porter', 'donner', 'écouter', 'travailler', 'dessiner', 'sauter', 'trouver', 'aimer', 'chercher', 'fermer', 'raconter', 'oublier', 'crier', 'gagner'].map(er),
  ...['finir', 'choisir', 'grandir', 'réussir', 'remplir', 'obéir', 'rougir', 'bâtir', 'punir', 'réfléchir'].map(ir),
  { inf: 'être', present: ETRE, impStem: 'ét', futStem: 'ser', ps: ['fus', 'fus', 'fut', 'fûmes', 'fûtes', 'furent'], pp: 'été', subj: ['sois', 'sois', 'soit', 'soyons', 'soyez', 'soient'] },
  { inf: 'avoir', present: AVOIR, impStem: 'av', futStem: 'aur', ps: ['eus', 'eus', 'eut', 'eûmes', 'eûtes', 'eurent'], pp: 'eu', subj: ['aie', 'aies', 'ait', 'ayons', 'ayez', 'aient'] },
  { inf: 'aller', present: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'], impStem: 'all', futStem: 'ir', ps: ['allai', 'allas', 'alla', 'allâmes', 'allâtes', 'allèrent'], pp: 'allé', etre: true, subj: ['aille', 'ailles', 'aille', 'allions', 'alliez', 'aillent'] },
  { inf: 'faire', present: ['fais', 'fais', 'fait', 'faisons', 'faites', 'font'], impStem: 'fais', futStem: 'fer', ps: ['fis', 'fis', 'fit', 'fîmes', 'fîtes', 'firent'], pp: 'fait', subj: ['fasse', 'fasses', 'fasse', 'fassions', 'fassiez', 'fassent'] },
  { inf: 'pouvoir', present: ['peux', 'peux', 'peut', 'pouvons', 'pouvez', 'peuvent'], impStem: 'pouv', futStem: 'pourr', ps: ['pus', 'pus', 'put', 'pûmes', 'pûtes', 'purent'], pp: 'pu', subj: ['puisse', 'puisses', 'puisse', 'puissions', 'puissiez', 'puissent'] },
  { inf: 'vouloir', present: ['veux', 'veux', 'veut', 'voulons', 'voulez', 'veulent'], impStem: 'voul', futStem: 'voudr', ps: ['voulus', 'voulus', 'voulut', 'voulûmes', 'voulûtes', 'voulurent'], pp: 'voulu', subj: ['veuille', 'veuilles', 'veuille', 'voulions', 'vouliez', 'veuillent'] },
  { inf: 'venir', present: ['viens', 'viens', 'vient', 'venons', 'venez', 'viennent'], impStem: 'ven', futStem: 'viendr', ps: ['vins', 'vins', 'vint', 'vînmes', 'vîntes', 'vinrent'], pp: 'venu', etre: true, subj: ['vienne', 'viennes', 'vienne', 'venions', 'veniez', 'viennent'] },
  { inf: 'prendre', present: ['prends', 'prends', 'prend', 'prenons', 'prenez', 'prennent'], impStem: 'pren', futStem: 'prendr', ps: ['pris', 'pris', 'prit', 'prîmes', 'prîtes', 'prirent'], pp: 'pris', subj: ['prenne', 'prennes', 'prenne', 'prenions', 'preniez', 'prennent'] },
  { inf: 'dire', present: ['dis', 'dis', 'dit', 'disons', 'dites', 'disent'], impStem: 'dis', futStem: 'dir', ps: ['dis', 'dis', 'dit', 'dîmes', 'dîtes', 'dirent'], pp: 'dit', subj: ['dise', 'dises', 'dise', 'disions', 'disiez', 'disent'] },
  { inf: 'voir', present: ['vois', 'vois', 'voit', 'voyons', 'voyez', 'voient'], impStem: 'voy', futStem: 'verr', ps: ['vis', 'vis', 'vit', 'vîmes', 'vîtes', 'virent'], pp: 'vu', subj: ['voie', 'voies', 'voie', 'voyions', 'voyiez', 'voient'] },
];
function form(v: Verb, t: Tense, p: number): string {
  switch (t) {
    case 'present': return v.present[p];
    case 'imparfait': return v.impStem + END.imp[p];
    case 'futur': return (v.futStem.endsWith('e') && v.futStem.endsWith('re') ? v.futStem.slice(0, -1) : v.futStem) + END.fut[p];
    case 'cond': return (v.futStem.endsWith('re') ? v.futStem.slice(0, -1) : v.futStem) + END.cond[p];
    case 'ps': return v.ps[p];
    case 'subj': return v.subj[p];
    case 'pc': {
      const aux = v.etre ? ETRE[p] : AVOIR[p];
      const pp = v.etre && p >= 3 ? `${v.pp}s` : v.pp;
      return `${aux} ${pp}`;
    }
  }
}
const withPron = (p: number, f: string, t: Tense) => {
  const pron = PRON[p];
  const s = t === 'subj' ? `que ${pron === 'je' && /^[aeiouéèêh]/i.test(f) ? "j'" : `${pron} `}` : pron === 'je' && /^[aeiouéèêâh]/i.test(f) ? "j'" : `${pron} `;
  return (s.startsWith('que ') && (pron === 'il' || pron === 'ils') ? s.replace('que il', "qu'il") : s) + f;
};
function tensesFor(g: number): Tense[] {
  const t: Tense[] = ['present'];
  if (g >= 3) t.push('futur', 'imparfait', 'pc');
  if (g >= 4) t.push('ps');
  if (g >= 5) t.push('cond');
  if (g >= 7) t.push('subj');
  return t;
}
function conjugation(r: R, g: number): string[] | null {
  const pool = g <= 2 ? VERBS.filter((v) => v.inf.endsWith('er') && !['aller'].includes(v.inf) || ['être', 'avoir', 'aller'].includes(v.inf)) : VERBS;
  const v = pick(r, pool), t = pick(r, tensesFor(g));
  const p = t === 'ps' && g < 6 ? pick(r, [2, 5]) : Math.floor(r() * 6);
  const ok = withPron(p, form(v, t, p), t);
  const others = tensesFor(Math.max(g, 4)).filter((x) => x !== t);
  const bad = [
    withPron(p, form(v, pick(r, others), p), t),
    withPron((p + 3) % 6, form(v, t, (p + 3) % 6), t).replace(/^(que )?(qu')?(j'|je |tu |il |nous |vous |ils )/, (m) => m) ,
    withPron(p, form(v, t, p === 2 ? 5 : p === 5 ? 2 : p === 0 ? 1 : 0), t),
    withPron(p, form(v, pick(r, others), p), t),
    withPron(p, form(v, t, p).replace(/ent$/, 'e').replace(/ons$/, 'ont').replace(/ez$/, 'é').replace(/ais$/, 'ait').replace(/ai$/, 'ais'), t),
  ];
  // Le piège « autre personne » doit garder le même pronom pour être plausible.
  bad[1] = withPron(p, form(v, t, (p + 3) % 6), t);
  return row(`Conjugue « ${v.inf} » ${TENSE_FR[t]} avec « ${PRON[p]} ».`, ok, shuffle(r, bad));
}

// ---------------------------------------------------------------- pluriels et homophones
const PLURALS: [string, string, string[]][] = [
  ['un cheval', 'des chevaux', ['des chevals', 'des chevaus', 'des chevales']], ['un journal', 'des journaux', ['des journals', 'des journauxs', 'des journales']],
  ['un animal', 'des animaux', ['des animals', 'des animales', 'des animaus']], ['un hôpital', 'des hôpitaux', ['des hôpitals', 'des hôpitales', 'des hôpitaus']],
  ['un festival', 'des festivals', ['des festivaux', 'des festivales', 'des festivaus']], ['un bal', 'des bals', ['des baux', 'des bales', 'des bauxs']],
  ['un carnaval', 'des carnavals', ['des carnavaux', 'des carnavales', 'des carnavaus']], ['un bateau', 'des bateaux', ['des bateaus', 'des bateau', 'des bateauxs']],
  ['un gâteau', 'des gâteaux', ['des gâteaus', 'des gâteau', 'des gâteaues']], ['un cheveu', 'des cheveux', ['des cheveus', 'des cheveu', 'des chevaux']],
  ['un jeu', 'des jeux', ['des jeus', 'des jeu', 'des jeues']], ['un pneu', 'des pneus', ['des pneux', 'des pneu', 'des pneues']],
  ['un bleu', 'des bleus', ['des bleux', 'des bleu', 'des bleues']], ['un tuyau', 'des tuyaux', ['des tuyaus', 'des tuyau', 'des tuyals']],
  ['un bijou', 'des bijoux', ['des bijous', 'des bijou', 'des bijoues']], ['un caillou', 'des cailloux', ['des caillous', 'des caillou', 'des cailles']],
  ['un genou', 'des genoux', ['des genous', 'des genou', 'des genoues']], ['un hibou', 'des hiboux', ['des hibous', 'des hibou', 'des hiboues']],
  ['un chou', 'des choux', ['des chous', 'des chou', 'des choues']], ['un clou', 'des clous', ['des cloux', 'des clou', 'des cloues']],
  ['un trou', 'des trous', ['des troux', 'des trou', 'des troues']], ['un fou', 'des fous', ['des foux', 'des fou', 'des foues']],
  ['un travail', 'des travaux', ['des travails', 'des travaille', 'des travaus']], ['un vitrail', 'des vitraux', ['des vitrails', 'des vitraille', 'des vitraus']],
  ['un éventail', 'des éventails', ['des éventaux', 'des éventailles', 'des éventaus']], ['un détail', 'des détails', ['des détaux', 'des détailles', 'des détaus']],
  ['un nez', 'des nez', ['des nezs', 'des nés', 'des nezes']], ['une souris', 'des souris', ['des souriss', 'des sourises', 'des sourix']],
  ['un prix', 'des prix', ['des prixs', 'des prises', 'des pris']], ['un œil', 'des yeux', ['des œils', 'des œuils', 'des yeuxs']],
  ['un landau', 'des landaus', ['des landaux', 'des landau', 'des landeaux']],
];
const FEM: [string, string, string[]][] = [
  ['un acteur', 'une actrice', ['une acteuse', 'une acteure', 'une actresse']], ['un chanteur', 'une chanteuse', ['une chantrice', 'une chanteure', 'une chantresse']],
  ['un lion', 'une lionne', ['une lione', 'une lionesse', 'une lionnette']], ['un boulanger', 'une boulangère', ['une boulangerre', 'une boulangeuse', 'une boulangeresse']],
  ['un prince', 'une princesse', ['une princette', 'une prince', 'une princière']], ['un loup', 'une louve', ['une loupe', 'une loupette', 'une loupine']],
  ['un coq', 'une poule', ['une coquette', 'une coquine', 'une cane']], ['un directeur', 'une directrice', ['une directeuse', 'une directeure', 'une directresse']],
  ['un vendeur', 'une vendeuse', ['une vendrice', 'une vendeure', 'une venderesse']], ['un chat', 'une chatte', ['une chate', 'une chatonne', 'une chatesse']],
  ['un cousin', 'une cousine', ['une cousinne', 'une cousinière', 'une cousinette']], ['un roi', 'une reine', ['une roine', 'une roie', 'une royale']],
  ['un héros', 'une héroïne', ['une héros', 'une héroïsse', 'une héroe']], ['un dieu', 'une déesse', ['une dieue', 'une dieuse', 'une divine']],
];
// Phrases à trou : [phrase avec …, bonne réponse, pièges]
const HOMO: [string, string, string[]][] = [
  ['Il … un vélo rouge.', 'a', ['à', 'as', 'ah']], ['Nous allons … la piscine.', 'à', ['a', 'as', 'ha']], ['Elle … faim.', 'a', ['à', 'as', 'ha']], ['Il pense … ses vacances.', 'à', ['a', 'as', 'ah']],
  ['Le chat … le chien jouent.', 'et', ['est', 'ai', 'es']], ['La soupe … chaude.', 'est', ['et', 'ai', 'es']], ['Il … grand … fort.', 'est / et', ['et / est', 'est / est', 'et / et']],
  ['Ils … partis tôt.', 'sont', ['son', 'sons', "s'ont"]], ['Il a perdu … cartable.', 'son', ['sont', 'sons', 'çon']], ['Mes amis … contents.', 'sont', ['son', 'sons', 'sonts']],
  ['Les élèves … fini.', 'ont', ['on', 'onts', 'hon']], ['… mange à midi.', 'On', ['Ont', 'Om', 'Hon']], ['Ils … gagné le match.', 'ont', ['on', 'ons', 'onts']],
  ['Tu veux du thé … du café ?', 'ou', ['où', 'houx', 'août']], ['… habites-tu ?', 'Où', ['Ou', 'Houx', 'Hou']], ['La ville … je suis né.', 'où', ['ou', 'houx', 'hou']],
  ['Regarde … belles fleurs !', 'ces', ['ses', "c'est", "s'est"]], ['Il range … jouets (à lui).', 'ses', ['ces', "c'est", "s'est"]], ['… mon frère.', "C'est", ["S'est", 'Ces', 'Ses']],
  ['Elle … coupée au doigt.', "s'est", ["c'est", 'ses', 'ces']], ['Je … donne un livre (à eux).', 'leur', ['leurs', 'leure', 'leures']], ['Ils prennent … vélos.', 'leurs', ['leur', 'leure', 'leures']],
  ['… garçon est sage.', 'Ce', ['Se', 'Ceux', 'Ses']], ['Il … lave les mains.', 'se', ['ce', 'ceux', 'ses']], ['Il fait froid … matin.', 'ce', ['se', 'ceux', 'ses']],
  ['Il est parti … dire au revoir.', 'sans', ["s'en", 'sens', 'cent']], ['Il y a … élèves dans le collège.', 'cent', ['sans', "s'en", 'sang']], ['Il … va demain.', "s'en", ['sans', 'cent', 'sens']],
  ['… il pleut, je prends mon parapluie.', 'Quand', ['Quant', "Qu'en", 'Camp']], ['… à moi, je reste.', 'Quant', ['Quand', "Qu'en", 'Kant']],
  ['Je ne sais pas … il viendra.', "s'il", ['cil', 'si il', 'scil']],
];
const homophone = (r: R) => { const [s, ok, bad] = pick(r, HOMO); return row(`Complète : « ${s} »`, ok, bad); };
const plural = (r: R) => { const [s, ok, bad] = pick(r, PLURALS); return row(`Quel est le pluriel de « ${s} » ?`, ok, bad); };
const feminine = (r: R) => { const [s, ok, bad] = pick(r, FEM); return row(`Quel est le féminin de « ${s} » ?`, ok, bad); };

// ---------------------------------------------------------------- vocabulaire anglais (fr → en / en → fr)
// [thème, français, anglais, niveau minimal (CP = 1 … 3e = 9)]
const VOC: [string, string, string, number][] = ([
  ['couleurs', 'rouge', 'red', 1], ['couleurs', 'bleu', 'blue', 1], ['couleurs', 'vert', 'green', 1], ['couleurs', 'jaune', 'yellow', 1], ['couleurs', 'noir', 'black', 1], ['couleurs', 'blanc', 'white', 1], ['couleurs', 'rose', 'pink', 1], ['couleurs', 'violet', 'purple', 2], ['couleurs', 'marron', 'brown', 2], ['couleurs', 'gris', 'grey', 2],
  ['animaux', 'chat', 'cat', 1], ['animaux', 'chien', 'dog', 1], ['animaux', 'oiseau', 'bird', 1], ['animaux', 'poisson', 'fish', 1], ['animaux', 'cheval', 'horse', 2], ['animaux', 'vache', 'cow', 2], ['animaux', 'lapin', 'rabbit', 2], ['animaux', 'souris', 'mouse', 2], ['animaux', 'mouton', 'sheep', 3], ['animaux', 'cochon', 'pig', 2], ['animaux', 'singe', 'monkey', 3], ['animaux', 'ours', 'bear', 3], ['animaux', 'serpent', 'snake', 4], ['animaux', 'éléphant', 'elephant', 2],
  ['famille', 'mère', 'mother', 1], ['famille', 'père', 'father', 1], ['famille', 'frère', 'brother', 2], ['famille', 'sœur', 'sister', 2], ['famille', 'grand-mère', 'grandmother', 3], ['famille', 'grand-père', 'grandfather', 3], ['famille', 'oncle', 'uncle', 4], ['famille', 'tante', 'aunt', 4], ['famille', 'cousin', 'cousin', 4], ['famille', 'bébé', 'baby', 2],
  ['corps', 'tête', 'head', 2], ['corps', 'main', 'hand', 2], ['corps', 'pied', 'foot', 2], ['corps', 'œil', 'eye', 2], ['corps', 'oreille', 'ear', 3], ['corps', 'bouche', 'mouth', 3], ['corps', 'nez', 'nose', 3], ['corps', 'bras', 'arm', 3], ['corps', 'jambe', 'leg', 3], ['corps', 'dents', 'teeth', 4], ['corps', 'cheveux', 'hair', 3],
  ['nourriture', 'pomme', 'apple', 1], ['nourriture', 'pain', 'bread', 2], ['nourriture', 'lait', 'milk', 2], ['nourriture', 'eau', 'water', 2], ['nourriture', 'fromage', 'cheese', 3], ['nourriture', 'poulet', 'chicken', 3], ['nourriture', 'gâteau', 'cake', 2], ['nourriture', 'œuf', 'egg', 3], ['nourriture', 'riz', 'rice', 4], ['nourriture', 'jus', 'juice', 3], ['nourriture', 'beurre', 'butter', 4], ['nourriture', 'fraise', 'strawberry', 4], ['nourriture', 'légumes', 'vegetables', 5],
  ['école', 'livre', 'book', 2], ['école', 'stylo', 'pen', 2], ['école', 'crayon', 'pencil', 2], ['école', 'cartable', 'school bag', 3], ['école', 'règle', 'ruler', 3], ['école', 'gomme', 'rubber', 3], ['école', 'professeur', 'teacher', 3], ['école', 'cahier', 'exercise book', 4], ['école', 'récréation', 'break time', 5], ['école', 'cantine', 'canteen', 5], ['école', 'bibliothèque', 'library', 6], ['école', 'emploi du temps', 'timetable', 6],
  ['jours', 'lundi', 'Monday', 2], ['jours', 'mardi', 'Tuesday', 2], ['jours', 'mercredi', 'Wednesday', 3], ['jours', 'jeudi', 'Thursday', 3], ['jours', 'vendredi', 'Friday', 2], ['jours', 'samedi', 'Saturday', 2], ['jours', 'dimanche', 'Sunday', 2],
  ['mois', 'janvier', 'January', 3], ['mois', 'février', 'February', 3], ['mois', 'mars', 'March', 4], ['mois', 'avril', 'April', 4], ['mois', 'mai', 'May', 4], ['mois', 'juin', 'June', 4], ['mois', 'juillet', 'July', 4], ['mois', 'août', 'August', 4], ['mois', 'septembre', 'September', 4], ['mois', 'octobre', 'October', 4], ['mois', 'novembre', 'November', 4], ['mois', 'décembre', 'December', 4],
  ['météo', 'pluie', 'rain', 3], ['météo', 'soleil', 'sun', 2], ['météo', 'neige', 'snow', 3], ['météo', 'vent', 'wind', 4], ['météo', 'nuage', 'cloud', 4], ['météo', 'orage', 'storm', 5], ['météo', 'chaud', 'hot', 3], ['météo', 'froid', 'cold', 3],
  ['vêtements', 'chaussures', 'shoes', 3], ['vêtements', 'chapeau', 'hat', 3], ['vêtements', 'pantalon', 'trousers', 4], ['vêtements', 'robe', 'dress', 4], ['vêtements', 'manteau', 'coat', 4], ['vêtements', 'jupe', 'skirt', 4], ['vêtements', 'chaussettes', 'socks', 4], ['vêtements', 'écharpe', 'scarf', 5],
  ['maison', 'cuisine', 'kitchen', 3], ['maison', 'chambre', 'bedroom', 3], ['maison', 'salle de bains', 'bathroom', 4], ['maison', 'jardin', 'garden', 4], ['maison', 'salon', 'living room', 4], ['maison', 'porte', 'door', 4], ['maison', 'fenêtre', 'window', 4], ['maison', 'escalier', 'stairs', 5],
  ['ville', 'gare', 'station', 5], ['ville', 'boulangerie', 'bakery', 5], ['ville', 'hôpital', 'hospital', 5], ['ville', 'pont', 'bridge', 6], ['ville', 'rue', 'street', 5], ['ville', 'magasin', 'shop', 5], ['ville', 'musée', 'museum', 6], ['ville', 'mairie', 'town hall', 6],
  ['verbes', 'manger', 'to eat', 4], ['verbes', 'boire', 'to drink', 4], ['verbes', 'dormir', 'to sleep', 4], ['verbes', 'courir', 'to run', 4], ['verbes', 'nager', 'to swim', 4], ['verbes', 'chanter', 'to sing', 4], ['verbes', 'lire', 'to read', 5], ['verbes', 'écrire', 'to write', 5], ['verbes', 'acheter', 'to buy', 6], ['verbes', 'apprendre', 'to learn', 6], ['verbes', 'voyager', 'to travel', 6], ['verbes', 'se réveiller', 'to wake up', 6], ['verbes', 'gagner', 'to win', 7], ['verbes', 'emprunter', 'to borrow', 8], ['verbes', 'se plaindre', 'to complain', 9],
  ['sentiments', 'heureux', 'happy', 3], ['sentiments', 'triste', 'sad', 3], ['sentiments', 'fatigué', 'tired', 4], ['sentiments', 'en colère', 'angry', 5], ['sentiments', 'effrayé', 'scared', 6], ['sentiments', 'fier', 'proud', 7], ['sentiments', 'inquiet', 'worried', 7], ['sentiments', 'gêné', 'embarrassed', 8],
  ['adjectifs', 'grand', 'big', 2], ['adjectifs', 'petit', 'small', 2], ['adjectifs', 'rapide', 'fast', 4], ['adjectifs', 'lent', 'slow', 4], ['adjectifs', 'facile', 'easy', 5], ['adjectifs', 'difficile', 'difficult', 5], ['adjectifs', 'cher', 'expensive', 6], ['adjectifs', 'ennuyeux', 'boring', 6], ['adjectifs', 'bruyant', 'noisy', 7], ['adjectifs', 'dangereux', 'dangerous', 7],
  ['faux-amis', 'actuellement', 'currently', 8], ['faux-amis', 'en fait', 'actually', 8], ['faux-amis', 'librairie', 'bookshop', 8], ['faux-amis', 'sensible', 'sensitive', 9], ['faux-amis', 'raisonnable', 'sensible', 9], ['faux-amis', 'éventuellement', 'possibly', 10], ['faux-amis', 'finalement', 'eventually', 10], ['faux-amis', 'location', 'rental', 10],
  ['société', 'chômage', 'unemployment', 10], ['société', 'environnement', 'environment', 9], ['société', 'réchauffement climatique', 'global warming', 9], ['société', 'droits', 'rights', 9], ['société', 'élection', 'election', 9], ['société', 'loi', 'law', 10], ['société', 'pauvreté', 'poverty', 10], ['société', 'inégalités', 'inequality', 11], ['société', 'lanceur d’alerte', 'whistleblower', 12], ['société', 'énergies renouvelables', 'renewable energy', 11],
] as [string, string, string, number][]);
function vocab(r: R, g: number): string[] | null {
  const pool = VOC.filter((v) => v[3] <= Math.max(1, g) && v[3] >= Math.max(1, g - 4));
  const w = pick(r, pool.length ? pool : VOC);
  const same = shuffle(r, VOC.filter((v) => v[0] === w[0] && v !== w));
  const other = shuffle(r, VOC.filter((v) => v !== w && v[3] <= g + 1));
  const alt = [...same, ...other];
  if (r() < 0.5) return row(`Comment dit-on « ${w[1]} » en anglais ?`, w[2], alt.map((v) => v[2]));
  return row(`Que veut dire « ${w[2]} » ?`, w[1], alt.map((v) => v[1]));
}

// ---------------------------------------------------------------- verbes irréguliers anglais
const IRR: [string, string, string, string][] = [
  ['be', 'was / were', 'been', 'être'], ['have', 'had', 'had', 'avoir'], ['go', 'went', 'gone', 'aller'], ['do', 'did', 'done', 'faire'], ['see', 'saw', 'seen', 'voir'], ['eat', 'ate', 'eaten', 'manger'],
  ['drink', 'drank', 'drunk', 'boire'], ['come', 'came', 'come', 'venir'], ['take', 'took', 'taken', 'prendre'], ['give', 'gave', 'given', 'donner'], ['write', 'wrote', 'written', 'écrire'], ['read', 'read', 'read', 'lire'],
  ['buy', 'bought', 'bought', 'acheter'], ['bring', 'brought', 'brought', 'apporter'], ['think', 'thought', 'thought', 'penser'], ['teach', 'taught', 'taught', 'enseigner'], ['catch', 'caught', 'caught', 'attraper'], ['fight', 'fought', 'fought', 'se battre'],
  ['swim', 'swam', 'swum', 'nager'], ['sing', 'sang', 'sung', 'chanter'], ['begin', 'began', 'begun', 'commencer'], ['run', 'ran', 'run', 'courir'], ['speak', 'spoke', 'spoken', 'parler'], ['break', 'broke', 'broken', 'casser'],
  ['choose', 'chose', 'chosen', 'choisir'], ['forget', 'forgot', 'forgotten', 'oublier'], ['get', 'got', 'got', 'obtenir'], ['know', 'knew', 'known', 'savoir, connaître'], ['grow', 'grew', 'grown', 'grandir'], ['fly', 'flew', 'flown', 'voler (dans les airs)'],
  ['drive', 'drove', 'driven', 'conduire'], ['ride', 'rode', 'ridden', 'monter (vélo, cheval)'], ['sleep', 'slept', 'slept', 'dormir'], ['feel', 'felt', 'felt', 'ressentir'], ['leave', 'left', 'left', 'partir, quitter'], ['meet', 'met', 'met', 'rencontrer'],
  ['make', 'made', 'made', 'fabriquer, faire'], ['say', 'said', 'said', 'dire'], ['tell', 'told', 'told', 'raconter, dire'], ['find', 'found', 'found', 'trouver'], ['lose', 'lost', 'lost', 'perdre'], ['win', 'won', 'won', 'gagner'],
  ['pay', 'paid', 'paid', 'payer'], ['sell', 'sold', 'sold', 'vendre'], ['send', 'sent', 'sent', 'envoyer'], ['spend', 'spent', 'spent', 'dépenser, passer (du temps)'], ['build', 'built', 'built', 'construire'], ['put', 'put', 'put', 'poser, mettre'],
  ['cut', 'cut', 'cut', 'couper'], ['hit', 'hit', 'hit', 'frapper'], ['let', 'let', 'let', 'laisser'], ['wear', 'wore', 'worn', 'porter (un vêtement)'], ['steal', 'stole', 'stolen', 'voler (dérober)'], ['hide', 'hid', 'hidden', 'cacher'],
  ['understand', 'understood', 'understood', 'comprendre'], ['stand', 'stood', 'stood', 'être debout'], ['fall', 'fell', 'fallen', 'tomber'], ['throw', 'threw', 'thrown', 'lancer'], ['draw', 'drew', 'drawn', 'dessiner'], ['shake', 'shook', 'shaken', 'secouer'],
];
const regularPast = (v: string) => (v.endsWith('e') ? `${v}d` : /[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ied` : `${v}ed`);
function irregular(r: R, g: number, lang: 'fr' | 'en'): string[] | null {
  const pool = g <= 7 ? IRR.slice(0, 30) : IRR;
  const v = pick(r, pool), o = shuffle(r, IRR.filter((x) => x !== v));
  const kind = g >= 8 ? pick(r, ['past', 'pp', 'mean']) : pick(r, ['past', 'past', 'mean']);
  if (kind === 'past') return row(lang === 'fr' ? `Quel est le prétérit de « ${v[0]} » ?` : `What is the past tense of "${v[0]}"?`, v[1], [regularPast(v[0]), v[2] !== v[1] ? v[2] : `${v[0]}s`, o[0][1], `${v[1]}ed`]);
  const pp = lang === 'en' && v[0] === 'get' ? 'gotten' : v[2]; // anglais américain
  if (kind === 'pp') return row(lang === 'fr' ? `Quel est le participe passé de « ${v[0]} » ?` : `What is the past participle of "${v[0]}"?`, pp, [regularPast(v[0]), v[1] !== v[2] ? v[1] : `${v[0]}ing`, o[0][2], `${v[0]}en`]);
  if (lang === 'en') return null;
  return row(`Que veut dire « to ${v[0]} » ?`, v[3], o.slice(0, 3).map((x) => x[3]));
}

// ---------------------------------------------------------------- ELA (États-Unis)
const PLURAL_EN: [string, string, string[]][] = [
  ['child', 'children', ['childs', 'childes', 'childrens']], ['mouse', 'mice', ['mouses', 'mices', 'meese']], ['foot', 'feet', ['foots', 'feets', 'footes']], ['tooth', 'teeth', ['tooths', 'teeths', 'toothes']],
  ['man', 'men', ['mans', 'mens', 'manes']], ['woman', 'women', ['womans', 'womens', 'womanes']], ['goose', 'geese', ['gooses', 'geeses', 'goosies']],
  ['sheep', 'sheep', ['sheeps', 'sheepes', 'shoop']], ['fish', 'fish', ['fishs', 'fishies', 'fishen']], ['deer', 'deer', ['deers', 'deeres', 'dear']], ['leaf', 'leaves', ['leafs', 'leafes', 'leavs']],
  ['knife', 'knives', ['knifes', 'knifs', 'knive']], ['wolf', 'wolves', ['wolfs', 'wolfes', 'wolvs']], ['box', 'boxes', ['boxs', 'boxies', 'boxen']], ['baby', 'babies', ['babys', 'babyes', 'babis']],
  ['city', 'cities', ['citys', 'cityes', 'citis']], ['bus', 'buses', ['buss', 'busies', 'bus’s']], ['potato', 'potatoes', ['potatos', 'potatoies', 'potato’s']], ['hero', 'heroes', ['heros', 'heroies', 'hero’s']],
  ['life', 'lives', ['lifes', 'lifs', 'livs']], ['half', 'halves', ['halfs', 'halfes', 'halvs']], ['ox', 'oxen', ['oxes', 'oxs', 'oxies']],
];
const SYN: [string, string, string, number][] = [
  ['big', 'large', 'tiny', 1], ['happy', 'glad', 'sad', 1], ['fast', 'quick', 'slow', 1], ['begin', 'start', 'finish', 2], ['shout', 'yell', 'whisper', 2], ['smart', 'clever', 'foolish', 2],
  ['scared', 'afraid', 'brave', 2], ['angry', 'mad', 'calm', 2], ['tired', 'sleepy', 'energetic', 3], ['easy', 'simple', 'difficult', 3], ['huge', 'enormous', 'minute', 4], ['ancient', 'old', 'modern', 4],
  ['brave', 'courageous', 'cowardly', 4], ['rich', 'wealthy', 'poor', 4], ['abundant', 'plentiful', 'scarce', 5], ['generous', 'giving', 'selfish', 5], ['rapid', 'swift', 'sluggish', 6], ['reluctant', 'hesitant', 'eager', 7],
  ['benevolent', 'kind', 'cruel', 8], ['candid', 'frank', 'deceptive', 9], ['ephemeral', 'fleeting', 'permanent', 10], ['ubiquitous', 'widespread', 'rare', 11], ['meticulous', 'careful', 'careless', 10], ['obsolete', 'outdated', 'current', 9],
  ['diligent', 'hardworking', 'lazy', 8], ['frugal', 'thrifty', 'wasteful', 9], ['ambiguous', 'unclear', 'clear', 9], ['mitigate', 'lessen', 'worsen', 10], ['tranquil', 'peaceful', 'chaotic', 7], ['vivid', 'bright', 'dull', 6],
];
// Mots de même sens : jamais proposés comme pièges l'un de l'autre.
const SAME = [
  'big large huge enormous', 'tiny minute small', 'happy glad', 'fast quick rapid swift', 'slow sluggish', 'scared afraid', 'brave courageous',
  'angry mad', 'calm tranquil peaceful', 'easy simple', 'ancient old', 'modern current', 'rich wealthy', 'kind benevolent generous giving',
  'careful meticulous', 'diligent hardworking', 'frugal thrifty', 'vivid bright', 'smart clever bright', 'obsolete outdated', 'ubiquitous widespread',
  'rare scarce', 'ephemeral fleeting', 'abundant plentiful', 'unclear ambiguous', 'candid frank', 'mitigate lessen', 'tired sleepy', 'reluctant hesitant',
].map((x) => new Set(x.split(' ')));
const alike = (a: string, b: string) => a === b || SAME.some((g) => g.has(a) && g.has(b));
function ela(r: R, g: number, chapter: string): string[] | null {
  if (chapter === 'grammar') {
    if (r() < 0.5) { const [s, ok, bad] = pick(r, PLURAL_EN.slice(0, g <= 3 ? 16 : PLURAL_EN.length)); return row(`What is the plural of "${s}"?`, ok, bad); }
    return irregular(r, Math.max(g, 4), 'en');
  }
  const pool = SYN.filter((x) => x[3] <= Math.max(1, g) && x[3] >= g - 4);
  const w = pick(r, pool.length ? pool : SYN), o = shuffle(r, SYN.filter((x) => x !== w));
  if (r() < 0.5) return row(`Which word is a synonym of "${w[0]}"?`, w[1], [w[2], ...o.map((x) => x[2])].filter((x) => !alike(x, w[1]) && !alike(x, w[0])));
  return row(`Which word is an antonym of "${w[0]}"?`, w[2], [w[1], ...o.map((x) => x[1])].filter((x) => !alike(x, w[2])));
}

/** Chapitres qui ont des questions fabriquées, par système, matière et niveau (min, max). */
export const GEN_CHAPTERS: Record<string, Record<string, Record<string, [number, number]>>> = {
  fr: {
    francais: { conjugaison: [2, 10], orthographe: [2, 7] },
    anglais: { vocabulaire: [1, 12], verbes: [6, 12] },
  },
  us: { ela: { grammar: [1, 8], vocabulary: [1, 12] } },
};
export function hasGen(sys: string, level: string, subject: string, chapter: string): boolean {
  const g = GRADE[level], range = GEN_CHAPTERS[sys]?.[subject]?.[chapter];
  return !!range && g >= range[0] && g <= range[1];
}

function seeded(seed: number): R {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Une question fabriquée pour ce chapitre, toujours la même pour une même graine. */
export function langQuestion(sys: string, level: string, subject: string, chapter: string, seed: number): string[] | null {
  if (!hasGen(sys, level, subject, chapter)) return null;
  const g = GRADE[level];
  const r = seeded(seed);
  for (let i = 0; i < 30; i++) {
    let q: string[] | null = null;
    if (subject === 'francais' && chapter === 'conjugaison') q = conjugation(r, g);
    else if (subject === 'francais' && chapter === 'orthographe') q = g >= 4 ? pick(r, [plural, homophone, homophone, feminine])(r) : pick(r, [plural, homophone, feminine])(r);
    else if (subject === 'anglais' && chapter === 'vocabulaire') q = vocab(r, g);
    else if (subject === 'anglais' && chapter === 'verbes') q = irregular(r, g, 'fr');
    else if (subject === 'ela') q = ela(r, g, chapter);
    if (q && new Set(q.slice(1)).size === 4) return q;
  }
  return null;
}
