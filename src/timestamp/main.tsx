import { createRoot } from 'react-dom/client';
import { TimestampApp } from './TimestampApp';
import '../i18n';
import './messages';
import { applyPreferences, loadPreferences } from '../domain/preferences';
import '../styles.css';
import './timestamp.css';
import { initAnalytics } from '../analytics';

initAnalytics();
applyPreferences(loadPreferences());
createRoot(document.getElementById('timestamp-root')!).render(<TimestampApp/>);
