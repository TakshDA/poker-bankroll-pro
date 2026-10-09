import "server-only";
import { cache } from "react";
import { requireUser } from "../auth";
import { loadWorkspace, type Workspace } from "../data/workspace";
import { createContext, type FinanceContext } from "../finance/metrics";
import { withUser } from "./db";

/** Per-request memoised workspace for the signed-in user. */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const user = await requireUser();
  return withUser(user.id, loadWorkspace);
});

/** Per-request finance context (ledger + normalised results). */
export const getFinance = cache(async (): Promise<{ ws: Workspace; ctx: FinanceContext }> => {
  const ws = await getWorkspace();
  return { ws, ctx: createContext(ws.dataset) };
});

/** Run a read-only query as the signed-in user. */
export async function readAsUser<T>(fn: Parameters<typeof withUser<T>>[1]): Promise<T> {
  const user = await requireUser();
  return withUser(user.id, fn);
}
