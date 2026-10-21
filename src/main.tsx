import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import './styles.css';
import { initAnalytics } from './analytics';

// Single local-first entry point.
initAnalytics();
createRoot(document.getElementById('root')!).render(<App/>);
