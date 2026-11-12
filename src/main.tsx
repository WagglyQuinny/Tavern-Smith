import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}

try {
  if (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ) {
    window.addEventListener('load', () => {
      try {
        navigator.serviceWorker.register('./sw.js').catch(() => {
          // Service worker registration is optional in constrained preview contexts
        });
      } catch {
        // Ignore synchronous SecurityError in restricted environments
      }
    });
  }
} catch {
  // Ignore environment restrictions
}
