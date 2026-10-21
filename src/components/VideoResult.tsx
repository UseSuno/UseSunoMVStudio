import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
// The exported file is independently decoded by the browser for review before download.
export function VideoResult({ blob, className, transparent }: { blob: Blob; className?: string; transparent?: boolean }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  useEffect(() => { const value = URL.createObjectURL(blob); setUrl(value); return () => URL.revokeObjectURL(value); }, [blob]);
  return url ? (
    <div className={`export-video-wrap${transparent ? ' is-transparent' : ''}`}>
      <video className={`export-video ${className ?? ''}`} controls playsInline preload="metadata" src={url} aria-label={t('aria.exportPreview')}/>
    </div>
  ) : null;
}
