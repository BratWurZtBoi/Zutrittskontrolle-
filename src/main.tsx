import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { unlockAudio } from './lib/feedback';
import { requestPersistentStorage, setupPwa } from './pwa';
import './styles.css';

// Töne sind erst nach einer Benutzeraktion erlaubt.
window.addEventListener('pointerdown', unlockAudio, { once: true });

void setupPwa();
void requestPersistentStorage();

const root = document.getElementById('root');
if (!root) throw new Error('#root fehlt');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
