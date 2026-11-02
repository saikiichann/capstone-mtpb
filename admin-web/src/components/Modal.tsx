import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { JSX } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

export type ModalProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** false: no close button, Escape or outside click (must finish inside). */
  dismissible?: boolean;
};

export default function Modal({
  title,
  onClose,
  children,
  dismissible = true,
}: ModalProps): JSX.Element {
  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissible) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, dismissible]);

  // Rendered into <body> so a page's own scoped .modal-* styles
  // (e.g. ".record-page .modal-overlay") can't leak into it.
  return createPortal(
    <div className="modal-overlay" onClick={dismissible ? onClose : undefined}>
      <div
        className="modal-panel"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          {dismissible && (
            <button
              className="modal-close"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
