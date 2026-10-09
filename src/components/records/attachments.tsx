"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface AttachmentRow {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export function AttachmentsPanel({ ownerType, ownerId, items }: { ownerType: "session" | "tournament" | "expense"; ownerId: string; items: AttachmentRow[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  async function upload(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("ownerType", ownerType);
    fd.set("ownerId", ownerId);
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) toast.error(json.error ?? "Upload failed");
    else {
      toast.success("Attachment added");
      start(() => router.refresh());
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Could not delete attachment");
    else start(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="size-4 text-fg-muted" /> Attachments
        </CardTitle>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <Upload /> {busy ? "Uploading…" : "Upload"}
        </Button>
        <input
          ref={input}
          type="file"
          className="sr-only"
          aria-label="Upload attachment"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,text/plain,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-fg-subtle">Receipts, screenshots or hand histories (private, max 10 MB).</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-fg-muted" />
                <a className="min-w-0 flex-1 truncate hover:underline" href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">
                  {a.fileName}
                </a>
                <span className="text-xs text-fg-subtle">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</span>
                <Button variant="ghost" size="icon" aria-label={`Delete ${a.fileName}`} onClick={() => remove(a.id)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
