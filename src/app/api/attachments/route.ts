import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/server/origin";
import { isUuid, withUser } from "@/lib/server/db";
import { ALLOWED_TYPES, getStorage, MAX_ATTACHMENT_BYTES, safeFileName, sniffMatches } from "@/lib/storage";

const OWNER_TABLE = { session: "sessions", tournament: "tournaments", expense: "expenses" } as const;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  const file = form.get("file");
  const ownerType = String(form.get("ownerType") ?? "") as keyof typeof OWNER_TABLE;
  const ownerId = String(form.get("ownerId") ?? "");
  if (!(file instanceof File) || !(ownerType in OWNER_TABLE) || !isUuid(ownerId)) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: "Files must be between 1 byte and 10 MB" }, { status: 400 });
  const contentType = file.type;
  if (!ALLOWED_TYPES[contentType]) return NextResponse.json({ error: "Allowed: JPG, PNG, WebP, HEIC, PDF, TXT, CSV" }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  if (!sniffMatches(contentType, data)) return NextResponse.json({ error: "File content does not match its type" }, { status: 400 });

  const key = `${user.id}/${randomUUID()}`;
  try {
    const id = await withUser(user.id, async (tx) => {
      // RLS: the owner record must belong to this user.
      const owner = await tx`select 1 from ${tx(OWNER_TABLE[ownerType])} where id = ${ownerId}`;
      if (owner.length === 0) throw new Error("not-found");
      await getStorage().put(key, data, contentType);
      const row = {
        sessionId: ownerType === "session" ? ownerId : null,
        tournamentId: ownerType === "tournament" ? ownerId : null,
        expenseId: ownerType === "expense" ? ownerId : null,
        storagePath: key,
        fileName: safeFileName(file.name),
        contentType,
        sizeBytes: file.size,
      };
      return (await tx<{ id: string }[]>`insert into attachments ${tx(row)} returning id`)[0].id;
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ id });
  } catch (e) {
    await getStorage().remove(key).catch(() => {});
    if (e instanceof Error && e.message === "not-found") return NextResponse.json({ error: "Record not found" }, { status: 404 });
    console.error("[attachments] upload failed");
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
