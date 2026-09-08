import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// Native dialog supplies focus trapping, Escape handling and modal semantics.
export function Modal({ title, children, close, wide = false, busy = false, className = '' }: { title: string; children: ReactNode; close: () => void; wide?: boolean; busy?: boolean; className?: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`modal${wide ? ' wide' : ''}${className ? ` ${className}` : ''}`} onCancel={e => { e.preventDefault(); if (!busy) close(); }} aria-label={title}><div className="modal-title"><h2>{title}</h2><button className="icon-button" data-tooltip={t('common.close')} aria-label={t('common.close')} disabled={busy} onClick={close}><X size={18}/></button></div>{children}</dialog>;
}
