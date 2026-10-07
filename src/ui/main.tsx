import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import { initPrefs } from './prefs';

void initPrefs().then(() => createRoot(document.getElementById('root')!).render(<App />));
