import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Accessible label for the modal — required for screen readers */
  ariaLabel?: string;
  /** ID of the element that labels this modal (e.g., the title h2 id) */
  ariaLabelledBy?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, ariaLabel, ariaLabelledBy, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (open && !el.open) {
      // Remember what had focus before the modal opened so we can restore it
      previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      el.showModal();
      // Focus the first focusable element inside the modal
      const focusable = el.querySelector<HTMLElement>(
        'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
    if (!open && el.open) {
      el.close();
      previousFocusRef.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClose={onClose}
      onClick={e => {
        // Click on backdrop (outside the dialog content) closes
        if (e.target === ref.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
