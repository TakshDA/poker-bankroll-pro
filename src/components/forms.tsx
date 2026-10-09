"use client";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button, type ButtonProps } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./ui/dialog";
import type { ActionState } from "@/lib/validation/common";

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

/** Show a toast whenever an action returns a new state. */
export function useActionToast(state: ActionState, opts: { onSuccess?: (s: ActionState) => void; silentSuccess?: boolean } = {}) {
  const last = React.useRef<number | undefined>(undefined);
  const { onSuccess, silentSuccess } = opts;
  React.useEffect(() => {
    if (!state.ts || state.ts === last.current) return;
    last.current = state.ts;
    if (state.ok) {
      if (!silentSuccess && state.message) toast.success(state.message);
      onSuccess?.(state);
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, onSuccess, silentSuccess]);
}

export function FormError({ state }: { state: ActionState }) {
  if (state.ok || !state.message) return null;
  return (
    <p role="alert" className="rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative">
      {state.message}
    </p>
  );
}

export function errorsFor(state: ActionState, field: string) {
  return state.fieldErrors?.[field];
}

/** A button that asks for confirmation, then calls a server action with an id. */
export function ConfirmAction({
  action,
  id,
  title,
  description,
  confirmLabel = "Confirm",
  children,
  variant = "destructive",
  triggerVariant = "ghost",
  triggerSize = "sm",
  onDone,
}: {
  action: (id: string) => Promise<ActionState>;
  id: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  onDone?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant={variant}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await action(id);
                if (res.ok) {
                  toast.success(res.message ?? "Done");
                  setOpen(false);
                  onDone?.();
                } else toast.error(res.message ?? "Failed");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
