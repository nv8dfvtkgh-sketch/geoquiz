// Révisions : assemble data/school/<système>/<niveau>.txt en data/games/school.json.
// Format d'un fichier : « ## matière » puis une question par ligne :
//   Question | bonne réponse | piège | piège | piège
import fs from 'node:fs';
import path from 'node:path';
import { MATH_SUBJECT, SCHOOL, type SchoolSystem } from '../src/shared/school';
import { topicFor } from '../src/shared/mathtopics';
import { chapterFor, chaptersOf } from '../src/shared/chapters';
import { GEN_CHAPTERS, hasGen } from '../src/server/schoollang';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out: Record<string, Record<string, Record<string, string[][]>>> = {};
let errors = 0, total = 0;
for (const sys of ['fr', 'us'] as SchoolSystem[]) {
  out[sys] = {};
  for (const lv of SCHOOL[sys].levels) {
    const file = path.join(ROOT, 'data/school', sys, `${lv.id}.txt`);
    if (!fs.existsSync(file)) continue;
    const lv2: Record<string, string[][]> = (out[sys][lv.id] = {});
    let sub = '';
    let head = ''; // « ### chapitre » : chapitre imposé pour les questions qui suivent
    const seen = new Set<string>();
    fs.readFileSync(file, 'utf8').split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (line.startsWith('###')) { head = line.slice(3).trim(); if (!chaptersOf(sub, lv.id).some((c) => c.id === head)) { console.error(`${file}:${i + 1} chapitre inconnu « ${head} »`); errors++; } return; }
      if (!line || line.startsWith('#') && !line.startsWith('##')) return;
      if (line.startsWith('##')) { head = ''; sub = line.slice(2).trim(); if (!lv.subjects.includes(sub)) { console.error(`${file}:${i + 1} matière inconnue « ${sub} »`); errors++; } return; }
      const parts = line.split('|').map((x) => x.trim());
      const where = `${sys}/${lv.id}.txt:${i + 1}`;
      if (parts.length !== 5 || parts.some((x) => !x)) { console.error(`${where} : il faut 5 champs`); errors++; return; }
      if (new Set(parts.slice(1)).size !== 4) { console.error(`${where} : réponses en double`); errors++; return; }
      if (seen.has(parts[0])) { console.error(`${where} : question en double`); errors++; return; }
      seen.add(parts[0]);
      // Maths : la notion du programme (« puissances »…) devinée d'après l'énoncé.
      const tp = MATH_SUBJECT.has(sub) ? topicFor(lv.id, parts[0]) : head || chapterFor(sub, parts[0], parts[1], lv.id);
      (lv2[sub] ??= []).push(tp ? [...parts, tp] : parts);
      total++;
    });
  }
}
fs.writeFileSync(path.join(ROOT, 'data/games/school.json'), JSON.stringify(out));
// Chapitres disponibles (avec leur nombre de questions écrites) : liste montrée dans l'application.
const MIN = 6;
const chapters: Record<string, Record<string, Record<string, Record<string, number>>>> = {};
for (const [sys, lvs] of Object.entries(out)) for (const [lv, subs] of Object.entries(lvs)) for (const [sb, rows] of Object.entries(subs)) {
  if (MATH_SUBJECT.has(sb)) continue;
  const n: Record<string, number> = {};
  for (const r of rows) if (r[5]) n[r[5]] = (n[r[5]] ?? 0) + 1;
  // Un chapitre est proposé s'il a assez de questions écrites, ou des questions fabriquées (conjugaison…).
  const keep = Object.fromEntries(chaptersOf(sb, lv).filter((c) => (n[c.id] ?? 0) >= MIN || hasGen(sys, lv, sb, c.id)).map((c) => [c.id, n[c.id] ?? 0]));
  if (Object.keys(keep).length >= 2) (((chapters[sys] ??= {})[lv] ??= {})[sb] = keep);
}
fs.writeFileSync(path.join(ROOT, 'src/shared/revchapters.json'), JSON.stringify(chapters, null, 0) + '\n');
console.log(`school.json : ${total} questions${errors ? `, ${errors} erreurs` : ''}`);
if (process.argv.includes('--chapters')) for (const [sys, lvs] of Object.entries(out)) for (const [lv, subs] of Object.entries(lvs)) for (const [sb, rows] of Object.entries(subs)) {
  if (MATH_SUBJECT.has(sb)) continue;
  const n: Record<string, number> = {};
  for (const r of rows) n[r[5] ?? '-'] = (n[r[5] ?? '-'] ?? 0) + 1;
  const kept = Object.keys(chapters[sys]?.[lv]?.[sb] ?? {});
  console.log(`  ${sys} ${lv.padEnd(5)} ${sb.padEnd(9)} ${Object.entries(n).map(([k, v]) => `${kept.includes(k) ? '✓' : ' '}${k}:${v}`).join(' ')}${kept.filter((k) => !n[k]).map((k) => ` ✓${k}:gen`).join('')}`);
}
void GEN_CHAPTERS;
for (const [sys, lvs] of Object.entries(out)) for (const [lv, subs] of Object.entries(lvs)) console.log(`  ${sys} ${lv.padEnd(5)} ${Object.entries(subs).map(([s, l]) => `${s} ${l.length}`).join(' · ')}`);
if (errors) process.exit(1);
