import { createRoot } from 'react-dom/client';
import { TimestampApp } from './TimestampApp';
import '../styles.css';
import './timestamp.css';

createRoot(document.getElementById('timestamp-root')!).render(<TimestampApp/>);
