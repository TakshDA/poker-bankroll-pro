/** Planned sessions (with optional in-app reminders) and day notes. */
import type { Tx } from "../server/db";
import type { PlannedSessionInput } from "../validation/schemas";
import { assertOwned, NotFoundError } from "./common";

export async function savePlannedSession(tx: Tx, input: PlannedSessionInput, existingId?: string): Promise<string> {
  await assertOwned(tx, "venues", input.venueId, "venueId");
  await assertOwned(tx, "platforms", input.platformId, "platformId");
  await assertOwned(tx, "game_types", input.gameTypeId, "gameTypeId");
  await assertOwned(tx, "stake_levels", input.stakeLevelId, "stakeLevelId");
  const online = input.setting === "online";
  const row = {
    plannedDate: input.plannedDate,
    startTime: input.startTime ?? null,
    kind: input.kind,
    setting: input.setting,
    title: input.title ?? null,
    venueId: online ? null : (input.venueId ?? null),
    platformId: online ? (input.platformId ?? null) : null,
    gameTypeId: input.gameTypeId ?? null,
    stakeLevelId: input.kind === "cash" ? (input.stakeLevelId ?? null) : null,
    notes: input.notes ?? null,
    // A reminder needs a start time to count back from.
    reminderMinutesBefore: input.startTime ? (input.reminderMinutesBefore ?? null) : null,
  };
  if (existingId) {
    const r = await tx`update planned_sessions set ${tx(row)} where id = ${existingId} returning id`;
    if (!r.length) throw new NotFoundError("Plan not found");
    return existingId;
  }
  return (await tx<{ id: string }[]>`insert into planned_sessions ${tx(row)} returning id`)[0].id;
}

export async function setPlanStatus(tx: Tx, id: string, status: "planned" | "done" | "skipped") {
  const r = await tx`update planned_sessions set status = ${status} where id = ${id} returning id`;
  if (!r.length) throw new NotFoundError("Plan not found");
}

export async function deletePlannedSession(tx: Tx, id: string) {
  const r = await tx`delete from planned_sessions where id = ${id} returning id`;
  if (!r.length) throw new NotFoundError("Plan not found");
}

export async function saveNote(tx: Tx, input: { noteDate: string; title?: string; body: string }, existingId?: string): Promise<string> {
  const row = { noteDate: input.noteDate, title: input.title ?? null, body: input.body };
  if (existingId) {
    const r = await tx`update notes set ${tx(row)} where id = ${existingId} returning id`;
    if (!r.length) throw new NotFoundError("Note not found");
    return existingId;
  }
  return (await tx<{ id: string }[]>`insert into notes ${tx(row)} returning id`)[0].id;
}

export async function deleteNote(tx: Tx, id: string) {
  const r = await tx`delete from notes where id = ${id} returning id`;
  if (!r.length) throw new NotFoundError("Note not found");
}
