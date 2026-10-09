"use server";
import { mutate, mutateById } from "@/lib/server/action";
import { duplicateCashSession, saveCashSession, softDeleteSession } from "@/lib/data/sessions";
import { cashSessionSchema } from "@/lib/validation/schemas";
import type { ActionState } from "@/lib/validation/common";
import { isUuid } from "@/lib/server/db";

export async function saveSessionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const existing = typeof id === "string" && isUuid(id) ? id : undefined;
  return mutate(cashSessionSchema, formData, (tx, input) => saveCashSession(tx, input, existing), existing ? "Session updated" : "Session saved");
}

export async function duplicateSessionAction(id: string): Promise<ActionState> {
  let newId: string | undefined;
  const res = await mutateById(id, async (tx, sid) => {
    newId = await duplicateCashSession(tx, sid);
  }, "Draft copy created");
  return { ...res, id: newId };
}

export async function deleteSessionAction(id: string): Promise<ActionState> {
  return mutateById(id, softDeleteSession, "Session moved to Trash");
}
