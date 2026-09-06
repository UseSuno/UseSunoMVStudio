import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
// Native dialog supplies focus trapping, Escape handling and modal semantics.
export function Modal({ title, children, close, wide = false, busy = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} onCancel={e => { e.preventDefault(); if (!busy) close(); }} aria-label={title}><div className="modal-title"><h2>{title}</h2><button aria-label="关闭" disabled={busy} onClick={close}><X size={18}/></button></div>{children}</dialog>;
}
