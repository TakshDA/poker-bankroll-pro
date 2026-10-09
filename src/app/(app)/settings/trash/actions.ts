"use server";
import { getStorage } from "@/lib/storage";
import { mutateById } from "@/lib/server/action";
import { purge, restore, TRASHABLE, type Trashable } from "@/lib/data/money-records";
import type { ActionState } from "@/lib/validation/common";

const valid = (t: string): t is Trashable => (TRASHABLE as readonly string[]).includes(t);

export async function restoreAction(table: string, id: string): Promise<ActionState> {
  if (!valid(table)) return { ok: false, ts: Date.now(), message: "Invalid record" };
  return mutateById(id, (tx, i) => restore(tx, table, i), "Restored. All statistics now include it again.");
}

export async function purgeAction(table: string, id: string): Promise<ActionState> {
  if (!valid(table)) return { ok: false, ts: Date.now(), message: "Invalid record" };
  let paths: string[] = [];
  const state = await mutateById(id, async (tx, i) => (paths = await purge(tx, table, i)), "Deleted permanently");
  // Files are removed only after the database delete committed.
  if (state.ok) await Promise.all(paths.map((p) => getStorage().remove(p).catch(() => {})));
  return state;
}
