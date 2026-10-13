"use client";
import { Download, FileUp, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { errorsFor, FormError, SubmitButton, useActionToast, useFormAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { restoreBackupAction } from "./actions";

interface Picked {
  name: string;
  blob: Blob;
  exportedAt: string;
  counts: { label: string; n: number }[];
}

const LABELS: Record<string, string> = { bankroll_accounts: "Accounts", sessions: "Sessions", tournaments: "Tournaments", transactions: "Deposits & withdrawals", transfers: "Transfers", expenses: "Expenses", goals: "Goals & limits", exchange_rates: "Exchange rates", attachments: "Attachments" };

async function gzip(file: File): Promise<Blob> {
  if (typeof CompressionStream === "undefined") return file;
  return new Response(file.stream().pipeThrough(new CompressionStream("gzip"))).blob();
}

export function RestoreForm() {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [state, onSubmit, pending] = useFormAction(async (prev, fd) => {
    if (picked) fd.set("file", picked.blob, `${picked.name}.gz`);
    return restoreBackupAction(prev, fd);
  });
  useActionToast(state, {
    onSuccess: () => {
      setPicked(null);
      router.refresh();
    },
  });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.format !== "poker-bankroll-pro/backup") throw new Error();
      const counts = Object.entries(LABELS)
        .map(([k, label]) => ({ label, n: Array.isArray(data.tables?.[k]) ? data.tables[k].length : 0 }))
        .filter((c) => c.n > 0);
      setPicked({ name: f.name, blob: await gzip(f), exportedAt: String(data.exportedAt ?? ""), counts });
    } catch {
      toast.error("That is not a Poker Bankroll Pro backup file.");
    }
  };

  return (
    <>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]">
        <FileUp className="size-4" aria-hidden /> Choose backup file
        <input type="file" accept=".json,application/json" className="sr-only" aria-label="Backup file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent title="Replace everything with this backup?" description={picked ? `${picked.name}${picked.exportedAt ? `, made ${new Date(picked.exportedAt).toLocaleString()}` : ""}` : undefined}>
          {picked ? (
            <form onSubmit={onSubmit} className="grid gap-4">
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {picked.counts.map((c) => (
                  <li key={c.label} className="flex justify-between gap-2">
                    <span className="text-fg-muted">{c.label}</span>
                    <span className="num">{c.n.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-fg-muted">Everything currently in your account is deleted and replaced by the backup. Your login and password do not change.</p>
              <Button asChild variant="secondary" size="sm" className="justify-self-start">
                <a href="/api/export?entity=backup&format=json" download>
                  <Download /> Download what is here now first
                </a>
              </Button>
              <Field label="Type RESTORE to confirm" htmlFor="rs-confirm" error={errorsFor(state, "confirmText")}>
                <Input id="rs-confirm" name="confirmText" autoComplete="off" required pattern="RESTORE" />
              </Field>
              <FormError state={state} />
              <SubmitButton pending={pending} pendingText="Restoring…" variant="destructive">
                <RotateCcw /> Replace my data
              </SubmitButton>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
