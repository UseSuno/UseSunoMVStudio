import { AudioLines, FolderOpen, Play, Upload } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguagePicker } from './LanguagePicker';
export function WelcomeOverlay({ upload, demo, openProject, close }: { upload: () => void; demo: () => void; openProject: () => void; close?: () => void }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null), initialFocus = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal(); initialFocus.current?.focus({ preventScroll: true });
    return () => {
      node?.close();
      const target = previousFocus?.isConnected && previousFocus !== document.body ? previousFocus : document.querySelector<HTMLElement>('[data-tour="audio-import"]');
      target?.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="welcome-overlay" aria-labelledby="welcome-title" onCancel={event => { event.preventDefault(); close?.(); }}><div className="welcome-card"><div className="welcome-top"><span className="welcome-mark"><AudioLines size={21}/></span><LanguagePicker/></div><p className="welcome-eyebrow">{t('welcome.eyebrow')}</p><h1 id="welcome-title">{t('welcome.title')}</h1><p className="welcome-copy">{t('welcome.body')}</p><div className="welcome-actions"><button ref={initialFocus} className="primary welcome-primary" onClick={upload}><Upload size={17}/>{t('welcome.upload')}</button><button onClick={demo}><Play size={15}/>{t('welcome.demo')}</button><button onClick={openProject}><FolderOpen size={15}/>{t('welcome.project')}</button></div><p className="welcome-support">{t('welcome.support')}</p></div></dialog>;
}
