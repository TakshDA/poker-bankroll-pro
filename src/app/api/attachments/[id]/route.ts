import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/server/origin";
import { isUuid, withUser } from "@/lib/server/db";
import { getStorage } from "@/lib/storage";

/** Stream a private attachment to its owner only (RLS-checked lookup). */
export async function GET(_req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const row = await withUser(user.id, async (tx) => (await tx<{ storagePath: string; fileName: string; contentType: string }[]>`select storage_path, file_name, content_type from attachments where id = ${id}`)[0]);
  if (!row) return new NextResponse("Not found", { status: 404 });
  const data = await getStorage().get(row.storagePath);
  const inline = row.contentType.startsWith("image/") || row.contentType === "application/pdf";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": row.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${row.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const path = await withUser(user.id, async (tx) => (await tx<{ storagePath: string }[]>`delete from attachments where id = ${id} returning storage_path`)[0]?.storagePath);
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await getStorage().remove(path).catch(() => {});
  return NextResponse.json({ ok: true });
}
