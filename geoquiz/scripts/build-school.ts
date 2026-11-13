// Révisions : assemble data/school/<système>/<niveau>.txt en data/games/school.json.
// Format d'un fichier : « ## matière » puis une question par ligne :
//   Question | bonne réponse | piège | piège | piège
import fs from 'node:fs';
import path from 'node:path';
import { SCHOOL, type SchoolSystem } from '../src/shared/school';

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
    const seen = new Set<string>();
    fs.readFileSync(file, 'utf8').split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#') && !line.startsWith('##')) return;
      if (line.startsWith('##')) { sub = line.slice(2).trim(); if (!lv.subjects.includes(sub)) { console.error(`${file}:${i + 1} matière inconnue « ${sub} »`); errors++; } return; }
      const parts = line.split('|').map((x) => x.trim());
      const where = `${sys}/${lv.id}.txt:${i + 1}`;
      if (parts.length !== 5 || parts.some((x) => !x)) { console.error(`${where} : il faut 5 champs`); errors++; return; }
      if (new Set(parts.slice(1)).size !== 4) { console.error(`${where} : réponses en double`); errors++; return; }
      if (seen.has(parts[0])) { console.error(`${where} : question en double`); errors++; return; }
      seen.add(parts[0]);
      (lv2[sub] ??= []).push(parts);
      total++;
    });
  }
}
fs.writeFileSync(path.join(ROOT, 'data/games/school.json'), JSON.stringify(out));
console.log(`school.json : ${total} questions${errors ? `, ${errors} erreurs` : ''}`);
for (const [sys, lvs] of Object.entries(out)) for (const [lv, subs] of Object.entries(lvs)) console.log(`  ${sys} ${lv.padEnd(5)} ${Object.entries(subs).map(([s, l]) => `${s} ${l.length}`).join(' · ')}`);
if (errors) process.exit(1);
