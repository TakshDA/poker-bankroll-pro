"use client";
import { Check, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/forms";
import type { ActionState } from "@/lib/validation/common";
import { deleteNoteAction, deletePlanAction, planDoneAction, planReopenAction, planSkipAction } from "./actions";

function Act({ action, id, label, children }: { action: (id: string) => Promise<ActionState>; id: string; label: string; children: React.ReactNode }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await action(id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message ?? "Could not update");
        })
      }
    >
      {children}
    </Button>
  );
}

export function PlanButtons({ id, status }: { id: string; status: string }) {
  return (
    <div className="flex shrink-0">
      {status === "planned" ? (
        <>
          <Act action={planDoneAction} id={id} label="Mark as played">
            <Check />
          </Act>
          <Act action={planSkipAction} id={id} label="Mark as skipped">
            <SkipForward />
          </Act>
        </>
      ) : (
        <Act action={planReopenAction} id={id} label="Reopen plan">
          <RotateCcw />
        </Act>
      )}
      <ConfirmAction action={deletePlanAction} id={id} title="Delete this plan?" confirmLabel="Delete" triggerSize="icon">
        <Trash2 aria-label="Delete plan" />
      </ConfirmAction>
    </div>
  );
}

export function DeleteNoteButton({ id }: { id: string }) {
  return (
    <ConfirmAction action={deleteNoteAction} id={id} title="Delete this note?" confirmLabel="Delete" triggerSize="icon">
      <Trash2 aria-label="Delete note" />
    </ConfirmAction>
  );
}
