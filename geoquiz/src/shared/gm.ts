// Geo Masters : le concours de géographie de Quizellige, une saison par mois.
// 1) Qualification en ligne pendant le mois (50 QCM en 20 minutes, une seule tentative) ;
// 2) le dernier samedi : manche en direct au buzzer pour les mieux classés ;
// 3) une demi-heure après : finale des 8 meilleurs de la manche.
import type { AgeGroup } from './protocol';

export const GM_DIVISIONS = ['primaire', 'college', 'lycee', 'adultes'] as const;
export type GmDivision = (typeof GM_DIVISIONS)[number];
export type GmStage = 'semi' | 'final';

export const GM_QUALIF = { questions: 50, minutes: 20, good: 2, pass: 0, bad: -1 };
export const GM_LIVE = { semi: 20, final: 15, finalists: 8, maxSemi: 50 };
/** Heure de la manche en direct (heure du Maroc) le dernier samedi, par division ; la finale suit 35 min après. */
export const GM_HOURS: Record<GmDivision, number> = { primaire: 15, college: 16, lycee: 17, adultes: 18 };
export const GM_FINAL_AFTER = 35 * 60_000;
export const GM_OPEN_BEFORE = 15 * 60_000;

/** Divisions ouvertes à une tranche d'âge (un adulte ne joue pas contre des enfants). */
export function gmDivisionsFor(age?: AgeGroup | null): GmDivision[] {
  if (age === '18+') return ['adultes'];
  if (age === '13-17') return ['college', 'lycee'];
  if (age === 'u13') return ['primaire', 'college'];
  return [...GM_DIVISIONS];
}

export interface GmCalendar {
  season: string; // « 2026-11 »
  qualifyEnd: number; // fin de la qualification (dernier samedi, 0 h)
  semi: Record<GmDivision, number>;
  final: Record<GmDivision, number>;
  next: string; // saison suivante
}

/** Nombre de qualifiés pour la manche en direct : la moitié du classement, au moins 8, au plus 50. */
export const gmSemiSpots = (players: number) => Math.min(GM_LIVE.maxSemi, Math.max(GM_LIVE.finalists, Math.ceil(players / 2)));
