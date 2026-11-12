// Lecture à voix haute avec la voix de l'appareil (aucun service extérieur).
// Les voix arrivent avec retard (événement « voiceschanged ») et certaines sont des voix
// « gadget » (robot, chuchotement, bulles…) : on choisit une vraie voix de la bonne langue,
// et sans voix correcte pour la langue, on ne lit pas (plutôt qu'avec un mauvais accent).
import type { Lang } from '../shared/protocol';

const VOICE: Record<Lang, string[]> = { fr: ['fr-FR', 'fr-CA', 'fr'], en: ['en-GB', 'en-US', 'en'], es: ['es-ES', 'es-MX', 'es-US', 'es'], ar: ['ar-SA', 'ar-MA', 'ar'] };
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

// Voix fantaisie d'Apple et autres voix à éviter.
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|fred|junior|ralph|kathy|princess|vicki|victoria/i;
// Voix réputées naturelles, préférées quand elles existent.
const GOOD = /google|natural|neural|premium|enhanced|siri|samantha|daniel|karen|moira|serena|mónica|monica|paulina|jorge|juan|majed|maged|tarik|laila|hoda|naayf|amélie|thomas|audrey/i;

let voices: SpeechSynthesisVoice[] = [];
function refresh() { if (canSpeak()) voices = speechSynthesis.getVoices(); }
if (canSpeak()) {
  refresh();
  speechSynthesis.addEventListener?.('voiceschanged', refresh);
}

/** Meilleure voix disponible pour la langue, ou null s'il n'y en a pas. */
export function voiceFor(lang: Lang): SpeechSynthesisVoice | null {
  if (!voices.length) refresh();
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
  const want = VOICE[lang].map((x) => x.toLowerCase());
  const ok = voices.filter((v) => want.some((w) => norm(v) === w || norm(v).startsWith(`${w.slice(0, 2)}-`) || norm(v) === w.slice(0, 2)) && !NOVELTY.test(v.name));
  if (!ok.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    let s = 0;
    const i = want.findIndex((w) => norm(v) === w);
    s += i >= 0 ? 30 - i * 5 : 0; // région préférée (fr-FR, en-GB, es-ES, ar-SA)
    if (GOOD.test(v.name)) s += 20;
    if (v.localService) s += 5;
    if (v.default) s += 3;
    return s;
  };
  return ok.sort((a, b) => score(b) - score(a))[0];
}
/** Une voix correcte existe-t-elle pour cette langue sur cet appareil ? */
export const hasVoice = (lang: Lang) => canSpeak() && !!voiceFor(lang);

/** Les symboles se lisent mal : « 4 × 5 » devient « 4 fois 5 ». */
const WORDS: Record<Lang, Record<string, string>> = {
  fr: { '×': ' fois ', '÷': ' divisé par ', '−': ' moins ', '+': ' plus ', '?': ' combien ', '→': ', ' },
  en: { '×': ' times ', '÷': ' divided by ', '−': ' minus ', '+': ' plus ', '?': ' what ', '→': ', ' },
  es: { '×': ' por ', '÷': ' entre ', '−': ' menos ', '+': ' más ', '?': ' cuánto ', '→': ', ' },
  ar: { '×': ' ضرب ', '÷': ' قسمة ', '−': ' ناقص ', '+': ' زائد ', '?': ' كم ', '→': '، ' },
};
const clean = (s: string, l: Lang) => s.replace(/[×÷−+→]|(?<=\s)\?(?=\s)/g, (c) => WORDS[l][c] ?? c).replace(/\p{Extended_Pictographic}/gu, '').replace(/[«»“”"]/g, '').trim();

export function speak(parts: string[], lang: Lang) {
  if (!canSpeak()) return false;
  const v = voiceFor(lang);
  if (!v) return false; // pas de voix pour cette langue : on ne lit pas avec un mauvais accent
  speechSynthesis.cancel();
  const text = parts.filter(Boolean).map((p) => clean(p, lang)).filter(Boolean).join('. ');
  if (!text) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v;
  u.lang = v.lang;
  u.rate = lang === 'ar' ? 0.9 : 0.95;
  speechSynthesis.speak(u);
  return true;
}
export const stopSpeaking = () => { if (canSpeak()) speechSynthesis.cancel(); };

const KEY = 'gq.tts';
export const autoRead = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setAutoRead = (v: boolean) => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignoré */ } };
