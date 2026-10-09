"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/forms";
import { deleteTournamentAction, duplicateTournamentAction } from "../actions";

export function TournamentActions({ id }: { id: string }) {
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
            const res = await duplicateTournamentAction(id);
            if (res.ok && res.id) {
              toast.success("Draft copy created. Finish it below.");
              router.push(`/tournaments/${res.id}/edit`);
            } else toast.error(res.message ?? "Could not duplicate");
          })
        }
      >
        <Copy /> Duplicate
      </Button>
      <ConfirmAction
        action={deleteTournamentAction}
        id={id}
        title="Delete this tournament?"
        description="It moves to the Trash (Settings → Trash) with its entries and playing days, and is removed from all statistics. You can restore it later."
        confirmLabel="Move to Trash"
        onDone={() => router.push("/tournaments")}
      >
        <Trash2 /> Delete
      </ConfirmAction>
    </>
  );
}
