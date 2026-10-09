"use server";
import { mutate, mutateById } from "@/lib/server/action";
import { isUuid } from "@/lib/server/db";
import { deleteNote, deletePlannedSession, saveNote, savePlannedSession, setPlanStatus } from "@/lib/data/calendar";
import { noteSchema, plannedSessionSchema } from "@/lib/validation/schemas";
import type { ActionState } from "@/lib/validation/common";

const idOf = (fd: FormData) => {
  const id = fd.get("id");
  return typeof id === "string" && isUuid(id) ? id : undefined;
};

export async function savePlanAction(_p: ActionState, fd: FormData) {
  const id = idOf(fd);
  return mutate(plannedSessionSchema, fd, (tx, input) => savePlannedSession(tx, input, id), id ? "Plan updated" : "Session planned");
}
export async function planDoneAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => setPlanStatus(tx, i, "done"), "Marked as played");
}
export async function planSkipAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => setPlanStatus(tx, i, "skipped"), "Marked as skipped");
}
export async function planReopenAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => setPlanStatus(tx, i, "planned"), "Plan reopened");
}
export async function deletePlanAction(id: string): Promise<ActionState> {
  return mutateById(id, deletePlannedSession, "Plan deleted");
}
export async function saveNoteAction(_p: ActionState, fd: FormData) {
  const id = idOf(fd);
  return mutate(noteSchema, fd, (tx, input) => saveNote(tx, input, id), id ? "Note updated" : "Note added");
}
export async function deleteNoteAction(id: string): Promise<ActionState> {
  return mutateById(id, deleteNote, "Note deleted");
}
