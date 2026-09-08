import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
// The exported file is independently decoded by the browser for review before download.
export function VideoResult({ blob }: { blob: Blob }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  useEffect(() => { const value = URL.createObjectURL(blob); setUrl(value); return () => URL.revokeObjectURL(value); }, [blob]);
  return url ? <video className="export-video" controls playsInline preload="metadata" src={url} aria-label={t('aria.exportPreview')}/> : null;
}
