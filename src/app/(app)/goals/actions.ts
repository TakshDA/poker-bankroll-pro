"use server";
import { deleteGoal, saveAlertRules, saveGoal, setGoalActive } from "@/lib/data/goals";
import { getSettings } from "@/lib/data/workspace";
import { mutate, mutateById } from "@/lib/server/action";
import { isUuid } from "@/lib/server/db";
import type { ActionState } from "@/lib/validation/common";
import { alertRulesSchema, goalSchema } from "@/lib/validation/schemas";

export async function saveGoalAction(_p: ActionState, fd: FormData) {
  const raw = fd.get("id");
  const id = typeof raw === "string" && isUuid(raw) ? raw : undefined;
  return mutate(goalSchema, fd, async (tx, input) => saveGoal(tx, input, (await getSettings(tx)).baseCurrency, id), id ? "Goal updated" : "Goal added");
}
export async function pauseGoalAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => setGoalActive(tx, i, false), "Paused");
}
export async function resumeGoalAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => setGoalActive(tx, i, true), "Resumed");
}
export async function deleteGoalAction(id: string): Promise<ActionState> {
  return mutateById(id, deleteGoal, "Deleted");
}
export async function saveAlertRulesAction(_p: ActionState, fd: FormData) {
  return mutate(alertRulesSchema, fd, (tx, input) => saveAlertRules(tx, input), "Bankroll rules saved");
}
