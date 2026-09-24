import { useEffect, useId, useRef } from 'react';
import Icon from '../ui/Icon';

export default function RosterDialog({ title, children, onClose, busy = false, compact = false }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => { element.close(); };
  }, []);
  return <dialog ref={dialog} className={'dialog roster-dialog' + (compact ? ' player-profile-dialog' : '')} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Cerrar ventana"><Icon name="close" /></button></div>
    {children}
  </dialog>;
}