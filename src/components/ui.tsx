import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ErrorBox({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="error-box" role="alert">
      {t('common.error', { message })}
    </div>
  );
}

export function Spinner() {
  const { t } = useTranslation();
  return (
    <div className="spinner-wrap" role="status">
      <div className="spinner" />
      <span className="sr-only">{t('app.loading')}</span>
    </div>
  );
}

export function EmptyState({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return <div className="empty">{children ?? t('common.empty')}</div>;
}

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

// Diàleg modal basat en <dialog> natiu: gestiona el focus i la tecla Esc.
export function Modal({ title, open, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="modal-head">
        <h2>{title}</h2>
        <button className="btn-icon" onClick={onClose} aria-label="×">
          ×
        </button>
      </header>
      <div className="modal-body">{open && children}</div>
    </dialog>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function ColorSwatch({ color }: { color: string | null | undefined }) {
  if (!color) return null;
  return <span className="swatch" style={{ background: color }} />;
}
