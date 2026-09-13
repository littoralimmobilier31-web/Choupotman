'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * Dialog built on the native <dialog> element: we get the top layer, the
 * backdrop, Esc-to-close and focus trapping from the platform instead of
 * reimplementing them.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself) closes.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-line bg-surface-raised p-0 text-fg shadow-raised',
        'backdrop:bg-ink-950/50 backdrop:backdrop-blur-sm open:animate-scale-in',
        'm-auto',
        widths[size],
      )}
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {(title || description) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 id="modal-title" className="text-[0.9375rem] font-semibold text-fg">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-muted">{description}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
            <X className="size-4" />
          </Button>
        </header>
      )}
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <footer className="flex flex-wrap justify-end gap-2.5 border-t border-line px-5 py-3.5">{footer}</footer>}
    </dialog>
  );
}

/** Destructive-action guard used before every delete / send / finalise. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'danger',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} disabled={busy}>
            {busy ? '…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[0.875rem] leading-relaxed text-fg-muted">{message}</p>
    </Modal>
  );
}
