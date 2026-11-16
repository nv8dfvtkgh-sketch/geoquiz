import { initInstall } from './install';
import { createRoot } from 'react-dom/client';
import { App } from './App';

import { detectLang, loadLang } from './i18n';

initInstall();
// La langue du joueur est chargée avant le premier affichage (le français est déjà là).
void loadLang(detectLang()).then(() => createRoot(document.getElementById('root')!).render(<App />));
