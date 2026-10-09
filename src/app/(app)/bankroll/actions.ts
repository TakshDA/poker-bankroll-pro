"use server";
import { mutate, mutateById } from "@/lib/server/action";
import { isUuid } from "@/lib/server/db";
import { deleteAccount, saveAccount, saveTransaction, saveTransfer, setAccountArchived, softDelete } from "@/lib/data/money-records";
import { accountSchema, transactionSchema, transferSchema } from "@/lib/validation/schemas";
import type { ActionState } from "@/lib/validation/common";

const idOf = (fd: FormData) => {
  const id = fd.get("id");
  return typeof id === "string" && isUuid(id) ? id : undefined;
};

export async function saveAccountAction(_p: ActionState, fd: FormData) {
  const id = idOf(fd);
  return mutate(accountSchema, fd, (tx, input) => saveAccount(tx, input, id), id ? "Account updated" : "Account created");
}
export async function saveTransactionAction(_p: ActionState, fd: FormData) {
  const id = idOf(fd);
  return mutate(transactionSchema, fd, (tx, input) => saveTransaction(tx, input, id), id ? "Transaction updated" : "Transaction recorded");
}
export async function saveTransferAction(_p: ActionState, fd: FormData) {
  const id = idOf(fd);
  return mutate(transferSchema, fd, (tx, input) => saveTransfer(tx, input, id), id ? "Transfer updated" : "Transfer recorded");
}
export async function deleteTransactionAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => softDelete(tx, "transactions", i), "Transaction moved to Trash");
}
export async function deleteTransferAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => softDelete(tx, "transfers", i), "Transfer moved to Trash");
}
export async function archiveAccountAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => setAccountArchived(tx, i, true), "Account archived");
}
export async function unarchiveAccountAction(id: string): Promise<ActionState> {
  return mutateById(id, (tx, i) => setAccountArchived(tx, i, false), "Account restored");
}
export async function deleteAccountAction(id: string): Promise<ActionState> {
  return mutateById(id, deleteAccount, "Account deleted");
}
