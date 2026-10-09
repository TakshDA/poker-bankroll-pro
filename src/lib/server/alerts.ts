import "server-only";
import { cache } from "react";
import { computeAlerts } from "../finance/goals";
import { getFinance } from "./workspace";

export const getAlerts = cache(async () => {
  const { ws, ctx } = await getFinance();
  return computeAlerts(ws.goals, ctx, ws.settings);
});
