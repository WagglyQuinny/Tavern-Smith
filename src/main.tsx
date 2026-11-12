import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { purgeBrowserRuntimeCaches } from './context/StoreContext';
import './index.css';

// Immediately purge any stale Service Workers and CacheStorage on startup
purgeBrowserRuntimeCaches();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
