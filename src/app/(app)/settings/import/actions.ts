"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { MAX_IMPORT_ROWS, runImport, undoImport, type ImportOutcome, type ImportPayload } from "@/lib/data/imports";
import { IMPORT_ENTITIES } from "@/lib/import/spec";
import { mutateById, toActionState } from "@/lib/server/action";
import { withUser } from "@/lib/server/db";
import { getStorage } from "@/lib/storage";
import type { ActionState } from "@/lib/validation/common";

const payloadSchema = z.object({
  entity: z.enum(IMPORT_ENTITIES),
  fileName: z.string().max(255),
  headers: z.array(z.string().max(200)).min(1).max(100),
  rows: z.array(z.array(z.string().max(4000)).max(100)).min(1, "The file has no data rows").max(MAX_IMPORT_ROWS, `Import up to ${MAX_IMPORT_ROWS} rows at a time`),
  mapping: z.record(z.string().max(40), z.number().int().min(-1).max(99)),
  options: z.object({
    dateOrder: z.enum(["ymd", "mdy", "dmy"]),
    decimalMark: z.enum([".", ","]),
    defaultAccountId: z.union([z.uuid(), z.literal("")]),
    defaultSetting: z.enum(["live_casino", "online"]),
    defaultCategoryId: z.union([z.uuid(), z.literal("")]),
    includeDuplicates: z.boolean(),
  }),
});

export type ImportResult = ({ ok: true } & ImportOutcome) | { ok: false; message: string };

class Rollback extends Error {
  constructor(public outcome: ImportOutcome) {
    super("rollback");
  }
}

async function run(raw: unknown, commit: boolean): Promise<ImportResult> {
  try {
    const user = await requireUser();
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid file" };
    const payload = parsed.data as ImportPayload;
    if (!commit) {
      // Do everything for real, then roll it all back.
      try {
        await withUser(user.id, async (tx) => {
          throw new Rollback(await runImport(tx, payload));
        });
      } catch (e) {
        if (e instanceof Rollback) return { ok: true, ...e.outcome, batchId: undefined };
        throw e;
      }
    }
    const outcome = await withUser(user.id, (tx) => runImport(tx, payload));
    revalidatePath("/", "layout");
    return { ok: true, ...outcome };
  } catch (e) {
    const s = toActionState(e);
    return { ok: false, message: s.message ?? "Import failed" };
  }
}

export async function previewImportAction(payload: unknown): Promise<ImportResult> {
  return run(payload, false);
}

export async function commitImportAction(payload: unknown): Promise<ImportResult> {
  return run(payload, true);
}

export async function undoImportAction(id: string): Promise<ActionState> {
  let paths: string[] = [];
  let removed = 0;
  const state = await mutateById(id, async (tx, i) => ({ paths, removed } = await undoImport(tx, i)), "Import undone");
  if (state.ok) {
    await Promise.all(paths.map((p) => getStorage().remove(p).catch(() => {})));
    return { ...state, message: `Import undone: ${removed} record${removed === 1 ? "" : "s"} removed` };
  }
  return state;
}
