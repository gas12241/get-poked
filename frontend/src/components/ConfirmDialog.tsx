import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  // When set, the confirm button stays disabled until this exact text is
  // typed into an input the dialog renders — extra friction for an action
  // more serious than the usual "are you sure" (e.g. account deletion).
  confirmationPhrase?: string;
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
  confirmationPhrase,
}: ConfirmDialogProps) {
  const messageId = useId();
  const phraseInputId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const phraseInputRef = useRef<HTMLInputElement>(null);
  const [typedPhrase, setTypedPhrase] = useState('');

  // Cancel starts focused, matching window.confirm()'s own default (Enter
  // on a freshly-opened native dialog cancels, not confirms) — the safer
  // default for a dialog that exists specifically to guard a destructive
  // action. When a confirmation phrase is required, the input starts
  // focused instead, so there's somewhere to type right away.
  useEffect(() => {
    if (confirmationPhrase) {
      phraseInputRef.current?.focus();
    } else {
      cancelRef.current?.focus();
    }
  }, [confirmationPhrase]);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onCancel();
  }

  const confirmDisabled = Boolean(
    confirmationPhrase && typedPhrase !== confirmationPhrase,
  );

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
        {confirmationPhrase && (
          <div className="confirm-dialog-phrase">
            <label htmlFor={phraseInputId}>Confirmation phrase</label>
            <span id={`${phraseInputId}-hint`}>
              Type <strong>{confirmationPhrase}</strong> to confirm.
            </span>
            <input
              ref={phraseInputRef}
              id={phraseInputId}
              type="text"
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              aria-describedby={`${phraseInputId}-hint`}
              autoComplete="off"
            />
          </div>
        )}
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog-confirm"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
