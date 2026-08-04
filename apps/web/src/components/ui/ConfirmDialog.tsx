import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Awaited — the confirm button shows a spinner until it resolves. */
  onConfirm: () => void | Promise<unknown>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for deletions. */
  destructive?: boolean;
  children?: ReactNode;
}

/**
 * "Wirklich löschen?" confirmation. Closes itself when `onConfirm` resolves and
 * keeps the dialog open (with the error visible via a toast) when it rejects.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  destructive = false,
  children,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // The caller reports the failure (usually via useToast); keep the dialog open.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissable={!pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending} fullWidth>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={confirm}
            loading={pending}
            fullWidth
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
