"use server";
import { revalidatePath } from "next/cache";
import { gunzipSync } from "node:zlib";
import { requireUser } from "@/lib/auth";
import { BackupFileError, parseBackup, restoreBackup } from "@/lib/data/backup";
import { toActionState } from "@/lib/server/action";
import { withUser } from "@/lib/server/db";
import { getStorage } from "@/lib/storage";
import type { ActionState } from "@/lib/validation/common";

const MAX_UPLOAD = 4 * 1024 * 1024;
const MAX_JSON = 60 * 1024 * 1024;

/** Replace all of the signed-in user's data with an uploaded (gzipped) backup. */
export async function restoreBackupAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const fail = (message: string, field?: string): ActionState => ({ ok: false, ts: Date.now(), message, fieldErrors: field ? { [field]: [message] } : undefined });
  try {
    const user = await requireUser();
    if (fd.get("confirmText") !== "RESTORE") return fail("Type RESTORE in capitals to confirm.", "confirmText");
    const file = fd.get("file");
    if (!(file instanceof Blob) || file.size === 0) return fail("Choose a backup file.");
    if (file.size > MAX_UPLOAD) return fail("That backup is too large to upload.");
    let text: string;
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
      text = (isGzip ? gunzipSync(bytes, { maxOutputLength: MAX_JSON }) : bytes).toString("utf8");
    } catch {
      return fail("The file could not be read. Choose the .json file the app downloaded.");
    }
    let backup;
    try {
      backup = parseBackup(JSON.parse(text));
    } catch (e) {
      return fail(e instanceof BackupFileError ? e.message : "That file is not valid JSON.");
    }
    const summary = await withUser(user.id, (tx) => restoreBackup(tx, backup));
    // Files are removed only after the restore committed.
    await Promise.all(summary.orphanedFiles.map((p) => getStorage().remove(p).catch(() => {})));
    revalidatePath("/", "layout");
    const skipped = summary.skippedAttachments ? ` ${summary.skippedAttachments} attachment${summary.skippedAttachments === 1 ? " was" : "s were"} left out because the files are not stored here.` : "";
    return { ok: true, ts: Date.now(), message: `Restored ${summary.rows.toLocaleString()} records from the backup.${skipped}` };
  } catch (e) {
    const s = toActionState(e);
    return { ...s, message: s.message === "Something went wrong. Your changes were not saved." ? "The restore failed and nothing was changed. The backup may be damaged." : s.message };
  }
}
