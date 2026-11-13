// Installer Quizellige sur l'écran d'accueil (application web).
let prompt: any = null;
const KEY = 'gq.installHide';

export function initInstall() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    window.dispatchEvent(new CustomEvent('gq:install'));
  });
  window.addEventListener('appinstalled', () => { prompt = null; window.dispatchEvent(new CustomEvent('gq:install')); });
}

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
const hidden = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** Ce qu'on peut proposer : le bouton d'installation, l'astuce iPhone, ou rien. */
export function installOffer(): 'prompt' | 'ios' | null {
  if (standalone() || hidden()) return null;
  if (prompt) return 'prompt';
  return isIos() ? 'ios' : null;
}
export async function installNow() {
  if (!prompt) return;
  prompt.prompt();
  await prompt.userChoice.catch(() => null);
  prompt = null;
  window.dispatchEvent(new CustomEvent('gq:install'));
}
export function hideInstall() {
  try { localStorage.setItem(KEY, '1'); } catch { /* ignoré */ }
  window.dispatchEvent(new CustomEvent('gq:install'));
}
