"use server";
import { mutate, mutateById } from "@/lib/server/action";
import { isUuid } from "@/lib/server/db";
import { saveExpense, softDelete } from "@/lib/data/money-records";
import { expenseSchema } from "@/lib/validation/schemas";
import type { ActionState } from "@/lib/validation/common";

export async function saveExpenseAction(_p: ActionState, fd: FormData) {
  const raw = fd.get("id");
  const id = typeof raw === "string" && isUuid(raw) ? raw : undefined;
  return mutate(expenseSchema, fd, (tx, input) => saveExpense(tx, input, id), id ? "Expense updated" : "Expense recorded");
}

export async function deleteExpenseAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => softDelete(tx, "expenses", i), "Expense moved to Trash");
}
