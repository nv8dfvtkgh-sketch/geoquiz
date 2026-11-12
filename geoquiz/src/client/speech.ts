// Lecture à voix haute avec la voix de l'appareil (aucun service extérieur).
import type { Lang } from '../shared/protocol';

const VOICE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', ar: 'ar-SA' };
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Les symboles se lisent mal : « 4 × 5 » devient « 4 fois 5 ». */
const WORDS: Record<Lang, Record<string, string>> = {
  fr: { '×': ' fois ', '÷': ' divisé par ', '−': ' moins ', '+': ' plus ', '?': ' combien ', '→': ', ' },
  en: { '×': ' times ', '÷': ' divided by ', '−': ' minus ', '+': ' plus ', '?': ' what ', '→': ', ' },
  es: { '×': ' por ', '÷': ' entre ', '−': ' menos ', '+': ' más ', '?': ' cuánto ', '→': ', ' },
  ar: { '×': ' ضرب ', '÷': ' قسمة ', '−': ' ناقص ', '+': ' زائد ', '?': ' كم ', '→': '، ' },
};
const clean = (s: string, l: Lang) => s.replace(/[×÷−+→]|(?<=\s)\?(?=\s)/g, (c) => WORDS[l][c] ?? c).replace(/\p{Extended_Pictographic}/gu, '').trim();

export function speak(parts: string[], lang: Lang) {
  if (!canSpeak()) return false;
  speechSynthesis.cancel();
  const text = parts.filter(Boolean).map((p) => clean(p, lang)).filter(Boolean).join('. ');
  if (!text) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = VOICE[lang];
  const v = speechSynthesis.getVoices().find((x) => x.lang.replace('_', '-').startsWith(VOICE[lang].slice(0, 2)));
  if (v) u.voice = v;
  u.rate = 0.95;
  speechSynthesis.speak(u);
  return true;
}
export const stopSpeaking = () => { if (canSpeak()) speechSynthesis.cancel(); };

const KEY = 'gq.tts';
export const autoRead = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setAutoRead = (v: boolean) => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignoré */ } };
