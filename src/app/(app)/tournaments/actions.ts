"use server";
import { mutate, mutateById } from "@/lib/server/action";
import { isUuid } from "@/lib/server/db";
import { duplicateTournament, saveTournament, softDeleteTournament } from "@/lib/data/tournaments";
import { tournamentSchema } from "@/lib/validation/schemas";
import type { ActionState } from "@/lib/validation/common";

/**
 * The tournament form has nested lists (entries, playing days), so the client
 * posts them as one JSON field; it is validated by the same Zod schema.
 */
export async function saveTournamentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const existing = typeof id === "string" && isUuid(id) ? id : undefined;
  const payload = formData.get("payload");
  let raw: unknown;
  try {
    raw = typeof payload === "string" && payload.length < 200_000 ? JSON.parse(payload) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, ts: Date.now(), message: "The form could not be read. Please try again." };
  return mutate(tournamentSchema, raw as Record<string, unknown>, (tx, input) => saveTournament(tx, input, existing), existing ? "Tournament updated" : "Tournament saved");
}

export async function duplicateTournamentAction(id: string): Promise<ActionState> {
  let newId: string | undefined;
  const res = await mutateById(id, async (tx, tid) => {
    newId = await duplicateTournament(tx, tid);
  }, "Draft copy created");
  return { ...res, id: newId };
}

export async function deleteTournamentAction(id: string): Promise<ActionState> {
  return mutateById(id, softDeleteTournament, "Tournament moved to Trash");
}
