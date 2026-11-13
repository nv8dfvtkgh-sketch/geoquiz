import { initInstall } from './install';
import { createRoot } from 'react-dom/client';
import { App } from './App';

initInstall();
createRoot(document.getElementById('root')!).render(<App />);
