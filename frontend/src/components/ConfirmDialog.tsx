import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';

interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// App-styled stand-in for window.confirm() — same one-shot "are you sure"
// gate, but themed like the rest of the app instead of an OS-styled popup.
// Generic (message/labels are caller-supplied) rather than hardcoded to any
// one action, matching how NameAutocomplete is shared across quiz modes.
function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Cancel starts focused, matching window.confirm()'s own default (Enter
  // on a freshly-opened native dialog cancels, not confirms) — the safer
  // default for a dialog that exists specifically to guard a destructive
  // action.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onCancel();
  }

  return (
    <div
      className="confirm-dialog-backdrop"
      // Clicking outside the dialog panel cancels, same as window.confirm()
      // offering no "click elsewhere" affordance at all — here it just maps
      // to the safe (non-destructive) action instead of being a no-op.
      onMouseDown={onCancel}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-describedby={messageId}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <p id={messageId}>{message}</p>
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog-confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
