import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Dexie from 'dexie';
import { App } from './App';
import { dadosMudaram, pedirPersistencia } from './ui/avisoBackup';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: deixa o app abrir sem internet depois do primeiro acesso.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Pede ao navegador para não apagar o IndexedDB quando faltar espaço.
pedirPersistencia();
// Lembrete de backup: anota quando os dados mudaram depois do último backup.
Dexie.on('storagemutated', () => dadosMudaram());
