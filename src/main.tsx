import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import './styles.css';
// Single local-first entry point.
createRoot(document.getElementById('root')!).render(<App/>);
