/** Goals, responsible-play limits and bankroll requirement rules. */
import type { GoalKind } from "../finance/goals";
import type { Tx } from "../server/db";
import { FieldError, toMinor } from "../validation/common";
import type { AlertRulesInput, GoalInput } from "../validation/schemas";
import { NotFoundError, requireAccount } from "./common";

export const MONEY_GOALS: GoalKind[] = ["profit", "expense_budget", "max_session_loss", "daily_loss_limit", "min_bankroll"];
/** Kinds whose measuring period the user chooses; the rest have a fixed meaning. */
export const PERIOD_GOALS: GoalKind[] = ["profit", "hours", "session_count", "expense_budget"];
const FIXED_PERIOD: Partial<Record<GoalKind, "per_session" | "daily">> = { max_session_loss: "per_session", daily_loss_limit: "daily", min_bankroll: "per_session" };

export async function saveGoal(tx: Tx, input: GoalInput, baseCurrency: string, existingId?: string): Promise<string> {
  const kind = input.kind as GoalKind;
  const period = FIXED_PERIOD[kind] ?? (input.period === "per_session" || input.period === "daily" ? "monthly" : input.period);
  if (period === "custom") {
    if (!input.startDate) throw new FieldError("startDate", "Choose a start date");
    if (!input.endDate) throw new FieldError("endDate", "Choose an end date");
    if (input.endDate < input.startDate) throw new FieldError("endDate", "End date must be on or after the start date");
  }
  // Only a minimum-bankroll goal is tied to one account; its amount is in that account's currency.
  const account = kind === "min_bankroll" && input.accountId ? await requireAccount(tx, input.accountId) : null;
  const currency = MONEY_GOALS.includes(kind) ? (account?.currency ?? input.currency ?? baseCurrency) : null;
  let targetMinor: number | null = null;
  let targetMinutes: number | null = null;
  let targetCount: number | null = null;
  if (currency) {
    targetMinor = toMinor(input.target, currency, "target", { required: true });
    if (targetMinor <= 0) throw new FieldError("target", "Enter an amount greater than 0");
  } else if (kind === "hours") {
    if (!input.targetHours) throw new FieldError("targetHours", "Enter the number of hours");
    targetMinutes = Math.round(input.targetHours * 60);
  } else {
    if (!input.targetCount) throw new FieldError("targetCount", "Enter the number of sessions");
    targetCount = input.targetCount;
  }
  const row = {
    name: input.name,
    kind,
    period,
    targetMinor,
    targetMinutes,
    targetCount,
    currency,
    accountId: account?.id ?? null,
    startDate: period === "custom" ? input.startDate! : null,
    endDate: period === "custom" ? input.endDate! : null,
    notes: input.notes ?? null,
  };
  if (existingId) {
    const r = await tx`update goals set ${tx(row)} where id = ${existingId} returning id`;
    if (!r.length) throw new NotFoundError("Goal not found");
    return existingId;
  }
  return (await tx<{ id: string }[]>`insert into goals ${tx(row)} returning id`)[0].id;
}

export async function setGoalActive(tx: Tx, id: string, active: boolean) {
  const r = await tx`update goals set active = ${active} where id = ${id} returning id`;
  if (!r.length) throw new NotFoundError("Goal not found");
}

export async function deleteGoal(tx: Tx, id: string) {
  const r = await tx`delete from goals where id = ${id} returning id`;
  if (!r.length) throw new NotFoundError("Goal not found");
}

export async function saveAlertRules(tx: Tx, input: AlertRulesInput) {
  await tx`update user_settings set ${tx(input, "cashBuyInsRequired", "cashBuyInBigBlinds", "tournamentBuyInsRequired", "cooldownMinutes")} where user_id = (select auth.uid())`;
}
