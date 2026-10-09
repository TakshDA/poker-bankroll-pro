"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/forms";
import { deleteSessionAction, duplicateSessionAction } from "../actions";

export function SessionActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await duplicateSessionAction(id);
            if (res.ok && res.id) {
              toast.success("Draft copy created — finish it below");
              router.push(`/sessions/${res.id}/edit`);
            } else toast.error(res.message ?? "Could not duplicate");
          })
        }
      >
        <Copy /> Duplicate
      </Button>
      <ConfirmAction
        action={deleteSessionAction}
        id={id}
        title="Delete this session?"
        description="It moves to the Trash (Settings → Trash) and is removed from all statistics. You can restore it later."
        confirmLabel="Move to Trash"
        triggerVariant="ghost"
        onDone={() => router.push("/sessions")}
      >
        <Trash2 /> Delete
      </ConfirmAction>
    </>
  );
}
