// Révisions scolaires : choisir le programme (France ou États-Unis), la classe (ou le cycle),
// puis la matière (ou toutes). La partie s'ouvre ensuite comme n'importe quel jeu.
import { useState } from 'react';
import { revId, SCHOOL, type SchoolSystem } from '../../shared/school';
import { useApp } from '../state';
import { PuzzleBack } from './Puzzles';

let chosen: SchoolSystem = 'fr';
/** Programme choisi depuis l'accueil (l'écran « revision » s'ouvre ensuite). */
export const chooseSystem = (s: SchoolSystem) => { chosen = s; };

const KEY = 'gq.rev';
function loadLast(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}

export function RevisionScreen() {
  const { t, openGame } = useApp();
  const [sys, setSys] = useState<SchoolSystem>(chosen);
  const [level, setLevel] = useState<string | null>(() => loadLast()[chosen] ?? null);
  const S = SCHOOL[sys];
  const cls = S.levels.find((l) => l.id === level);
  const cyc = S.cycles.find((c) => c.id === level);
  const subjects = cls ? cls.subjects : cyc ? [...new Set(S.levels.filter((l) => cyc.levels.includes(l.id)).flatMap((l) => l.subjects))] : [];
  const pickLevel = (id: string) => {
    setLevel(id);
    try { localStorage.setItem(KEY, JSON.stringify({ ...loadLast(), [sys]: id })); } catch { /* ignoré */ }
    requestAnimationFrame(() => document.getElementById('rev-subjects')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const switchSys = (s: SchoolSystem) => { chosen = s; setSys(s); setLevel(loadLast()[s] ?? null); };
  return (
    <div className="rev panel">
      <PuzzleBack to="home" />
      <h1>{t('rev.title')}</h1>
      <p className="muted">{t('rev.hint')}</p>
      <div className="seg rev-sys" role="group">
        {(['fr', 'us'] as SchoolSystem[]).map((s) => <button type="button" key={s} aria-pressed={sys === s} onClick={() => switchSys(s)}>{s === 'fr' ? '🇫🇷' : '🇺🇸'} {t(`rev.sys.${s}`)}</button>)}
      </div>

      <h2 className="rev-h">{t('rev.byClass')}</h2>
      <div className="rev-levels">
        {S.levels.map((l) => (
          <button type="button" key={l.id} className={level === l.id ? 'on' : ''} onClick={() => pickLevel(l.id)}>
            <strong>{sys === 'us' ? l.name.replace('Grade ', '').replace('Kindergarten', 'K') : ({ '2nde': '2nde', '1re': '1re', tle: 'Tle' } as Record<string, string>)[l.id] ?? l.name}</strong>
            {sys === 'us' ? <small>{l.id === 'k' ? 'Kinder.' : 'Grade'}</small> : l.cycle === 'lycee' && <small>{l.name}</small>}
          </button>
        ))}
      </div>

      <h2 className="rev-h">{t('rev.byCycle')}</h2>
      <div className="rev-cycles">
        {S.cycles.map((c) => (
          <button type="button" key={c.id} className={level === c.id ? 'on' : ''} onClick={() => pickLevel(c.id)}>
            <strong>{c.name.replace(/ \(.*\)$/, '')}</strong><small>{/\((.*)\)/.exec(c.name)?.[1]}</small>
          </button>
        ))}
      </div>

      {level && (
        <section id="rev-subjects" className="rev-subjects">
          <h2 className="rev-h">{t('rev.subjectFor', { level: cls?.name ?? cyc?.name.replace(/ \(.*\)$/, '') ?? '' })}</h2>
          <div className="rev-subs">
            <button type="button" className="rev-sub all" onClick={() => openGame(revId(sys, level, 'all'))}>
              <span aria-hidden="true">🎒</span><strong>{sys === 'fr' ? 'Toutes les matières' : 'All subjects'}</strong><small>{t('rev.mixed')}</small>
            </button>
            {subjects.map((sub) => (
              <button type="button" key={sub} className="rev-sub" onClick={() => openGame(revId(sys, level, sub))}>
                <span aria-hidden="true">{S.subjects[sub].emoji}</span><strong>{S.subjects[sub].name}</strong>
              </button>
            ))}
          </div>
        </section>
      )}
      <p className="muted small rev-src">{t(`rev.src.${sys}`)}</p>
    </div>
  );
}
