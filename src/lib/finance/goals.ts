/**
 * Goals, responsible-play limits and bankroll alerts.
 *
 * Alerts are designed to support discipline: when a limit is breached the
 * advice is always to stop, take a break or move DOWN in stakes — never to
 * play more or higher to recover losses.
 */
import { resolveRange, todayIn, type DateRange } from "./dates";
import { accountBalances } from "./ledger";
import type { FinanceContext } from "./metrics";
import { computeDashboard } from "./metrics";
import { divRoundMinor, percent, type Minor } from "./money";
import { money } from "../format";

export type GoalKind = "profit" | "hours" | "expense_budget" | "max_session_loss" | "daily_loss_limit" | "min_bankroll" | "session_count";
export type GoalPeriod = "per_session" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

export interface Goal {
  id: string;
  name: string;
  kind: GoalKind;
  period: GoalPeriod;
  targetMinor: Minor | null;
  targetMinutes: number | null;
  targetCount: number | null;
  currency: string | null;
  accountId: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  notes: string | null;
}

export interface GoalProgress {
  goal: Goal;
  range: DateRange | null;
  /** Current measured value in the goal's unit (minor units, minutes or count). */
  current: number;
  target: number;
  pct: number | null;
  status: "on_track" | "achieved" | "warning" | "breached" | "unavailable";
  summary: string;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  href?: string;
}

export interface AlertSettings {
  cashBuyInsRequired: number;
  cashBuyInBigBlinds: number;
  tournamentBuyInsRequired: number;
  cooldownMinutes: number;
}

function periodRange(goal: Goal, ctx: FinanceContext, now: Date): DateRange | null {
  const { timezone, weekStartsOn } = ctx.ds.settings;
  switch (goal.period) {
    case "daily":
      return resolveRange("today", timezone, weekStartsOn, undefined, now);
    case "weekly":
      return resolveRange("week", timezone, weekStartsOn, undefined, now);
    case "monthly":
      return resolveRange("month", timezone, weekStartsOn, undefined, now);
    case "yearly":
      return resolveRange("year", timezone, weekStartsOn, undefined, now);
    case "custom":
      return resolveRange("custom", timezone, weekStartsOn, { from: goal.startDate, to: goal.endDate }, now);
    default:
      return null;
  }
}

/** Target expressed in the base currency (null when no rate is available). */
function targetInBase(goal: Goal, ctx: FinanceContext, today: string): Minor | null {
  if (goal.targetMinor === null) return null;
  const cur = goal.currency ?? ctx.ds.settings.baseCurrency;
  const c = ctx.rates.convert(goal.targetMinor, cur, ctx.ds.settings.baseCurrency, today);
  return c ? c.amount : null;
}

export function evaluateGoals(goals: Goal[], ctx: FinanceContext, now = new Date()): GoalProgress[] {
  const base = ctx.ds.settings.baseCurrency;
  const today = todayIn(ctx.ds.settings.timezone, now);
  const fmt = (v: Minor) => money(v, base);
  const out: GoalProgress[] = [];

  for (const goal of goals.filter((g) => g.active)) {
    const range = periodRange(goal, ctx, now);
    const m = range ? computeDashboard(ctx, range, now) : null;
    const tgtMoney = targetInBase(goal, ctx, today);
    const unavailable = (summary: string): GoalProgress => ({ goal, range, current: 0, target: 0, pct: null, status: "unavailable", summary });

    switch (goal.kind) {
      case "profit": {
        if (!m || tgtMoney === null) {
          out.push(unavailable("Add an exchange rate for this goal's currency"));
          break;
        }
        const pct = percent(m.netPokerProfitMinor, tgtMoney);
        out.push({
          goal,
          range,
          current: m.netPokerProfitMinor,
          target: tgtMoney,
          pct,
          status: m.netPokerProfitMinor >= tgtMoney ? "achieved" : "on_track",
          summary: `${fmt(m.netPokerProfitMinor)} of ${fmt(tgtMoney)} net profit`,
        });
        break;
      }
      case "hours": {
        if (!m || !goal.targetMinutes) break;
        out.push({
          goal,
          range,
          current: m.totalMinutes,
          target: goal.targetMinutes,
          pct: percent(m.totalMinutes, goal.targetMinutes),
          status: m.totalMinutes >= goal.targetMinutes ? "achieved" : "on_track",
          summary: `${(m.totalMinutes / 60).toFixed(1)}h of ${(goal.targetMinutes / 60).toFixed(1)}h played`,
        });
        break;
      }
      case "session_count": {
        if (!m || !goal.targetCount) break;
        out.push({
          goal,
          range,
          current: m.completedCount,
          target: goal.targetCount,
          pct: percent(m.completedCount, goal.targetCount),
          status: m.completedCount >= goal.targetCount ? "achieved" : "on_track",
          summary: `${m.completedCount} of ${goal.targetCount} sessions`,
        });
        break;
      }
      case "expense_budget": {
        if (!m || tgtMoney === null) {
          out.push(unavailable("Add an exchange rate for this goal's currency"));
          break;
        }
        const pct = percent(m.expensesMinor, tgtMoney);
        out.push({
          goal,
          range,
          current: m.expensesMinor,
          target: tgtMoney,
          pct,
          status: m.expensesMinor > tgtMoney ? "breached" : (pct ?? 0) >= 80 ? "warning" : "on_track",
          summary: `${fmt(m.expensesMinor)} of ${fmt(tgtMoney)} budget spent`,
        });
        break;
      }
      case "daily_loss_limit": {
        const day = resolveRange("today", ctx.ds.settings.timezone, 1, undefined, now);
        const dm = computeDashboard(ctx, day, now);
        if (tgtMoney === null) {
          out.push(unavailable("Add an exchange rate for this goal's currency"));
          break;
        }
        const loss = Math.max(0, -(dm.cashProfitMinor + dm.tournamentProfitMinor));
        out.push({
          goal,
          range: day,
          current: loss,
          target: tgtMoney,
          pct: percent(loss, tgtMoney),
          status: loss >= tgtMoney ? "breached" : loss >= tgtMoney * 0.75 ? "warning" : "on_track",
          summary: loss > 0 ? `Down ${fmt(loss)} today (limit ${fmt(tgtMoney)})` : `No losses today (limit ${fmt(tgtMoney)})`,
        });
        break;
      }
      case "max_session_loss": {
        if (tgtMoney === null) {
          out.push(unavailable("Add an exchange rate for this goal's currency"));
          break;
        }
        const stat = ctx.allResults.filter((r) => r.countsInStats);
        const last = stat.at(-1);
        const lastLoss = last ? Math.max(0, -last.netMinor) : 0;
        const breaches = stat.filter((r) => -r.netMinor > tgtMoney).length;
        out.push({
          goal,
          range: null,
          current: lastLoss,
          target: tgtMoney,
          pct: percent(lastLoss, tgtMoney),
          status: lastLoss > tgtMoney ? "breached" : "on_track",
          summary: `Last session ${last ? money(last.netMinor, base, { signed: true }) : "—"} · ${breaches} session(s) over the ${fmt(tgtMoney)} limit`,
        });
        break;
      }
      case "min_bankroll": {
        if (tgtMoney === null) {
          out.push(unavailable("Add an exchange rate for this goal's currency"));
          break;
        }
        let current: Minor;
        if (goal.accountId) {
          const acc = ctx.ds.accounts.find((a) => a.id === goal.accountId);
          const bal = accountBalances(ctx.ds, ctx.ledger).get(goal.accountId) ?? 0;
          const c = acc ? ctx.rates.convert(bal, acc.currency, base, today) : null;
          if (!c) {
            out.push(unavailable("Account currency has no exchange rate"));
            break;
          }
          current = c.amount;
        } else {
          current = computeDashboard(ctx, resolveRange("all", ctx.ds.settings.timezone), now).currentBankroll.amountMinor;
        }
        out.push({
          goal,
          range: null,
          current,
          target: tgtMoney,
          pct: percent(current, tgtMoney),
          status: current < tgtMoney ? "breached" : current < tgtMoney * 1.1 ? "warning" : "on_track",
          summary: `Bankroll ${fmt(current)} (minimum ${fmt(tgtMoney)})`,
        });
        break;
      }
    }
  }
  return out;
}

export function computeAlerts(goals: Goal[], ctx: FinanceContext, settings: AlertSettings, now = new Date()): Alert[] {
  const alerts: Alert[] = [];
  const base = ctx.ds.settings.baseCurrency;
  const balances = accountBalances(ctx.ds, ctx.ledger);

  for (const a of ctx.ds.accounts) {
    if (a.archived || a.minBalanceMinor === null) continue;
    const bal = balances.get(a.id) ?? 0;
    if (bal < a.minBalanceMinor) {
      alerts.push({
        id: `acct-min-${a.id}`,
        severity: "critical",
        title: `${a.name} is below its minimum`,
        message: `Balance ${money(bal, a.currency)} is under the ${money(a.minBalanceMinor, a.currency)} threshold. Consider pausing or moving down in stakes until it is rebuilt.`,
        href: `/bankroll/${a.id}`,
      });
    }
  }

  for (const p of evaluateGoals(goals, ctx, now)) {
    if (p.status === "breached") {
      const advice: Record<string, string> = {
        daily_loss_limit: "You have reached today's loss limit. Stop for today — chasing losses rarely ends well.",
        max_session_loss: "Your last session went past your stop-loss. Take a break before the next session.",
        expense_budget: "This period's expense budget is exceeded.",
        min_bankroll: "Your bankroll is below the minimum you set. Consider lower stakes until it recovers.",
      };
      alerts.push({ id: `goal-${p.goal.id}`, severity: "critical", title: p.goal.name, message: `${p.summary}. ${advice[p.goal.kind] ?? ""}`.trim(), href: "/goals" });
    } else if (p.status === "warning" && (p.goal.kind === "daily_loss_limit" || p.goal.kind === "expense_budget" || p.goal.kind === "min_bankroll")) {
      alerts.push({ id: `goal-${p.goal.id}`, severity: "warning", title: p.goal.name, message: p.summary, href: "/goals" });
    }
  }

  // Cooldown reminder after a losing session.
  if (settings.cooldownMinutes > 0) {
    const lastCash = [...ctx.ds.cashSessions].filter((s) => s.status === "completed" && s.endedAt).sort((x, y) => (x.endedAt! < y.endedAt! ? 1 : -1))[0];
    const lastResult = lastCash ? ctx.allResults.find((r) => r.id === lastCash.id) : undefined;
    if (lastCash && lastResult && lastResult.netMinor < 0) {
      const until = new Date(Date.parse(lastCash.endedAt!) + settings.cooldownMinutes * 60000);
      if (until > now) {
        alerts.push({
          id: "cooldown",
          severity: "warning",
          title: "Cooldown in effect",
          message: `Your last session was a loss. Your cooldown rule suggests not playing again until ${until.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: ctx.ds.settings.timezone })}.`,
        });
      }
    }
  }

  // Bankroll requirement rules per account.
  for (const a of ctx.ds.accounts) {
    if (a.archived) continue;
    const bal = balances.get(a.id) ?? 0;
    const cashOnAcc = ctx.ds.cashSessions.filter((s) => s.accountId === a.id && s.status === "completed" && s.bigBlindMinor);
    const latest = cashOnAcc.sort((x, y) => (x.startedAt < y.startedAt ? 1 : -1))[0];
    if (latest?.bigBlindMinor) {
      const buyIn = latest.bigBlindMinor * settings.cashBuyInBigBlinds;
      const have = bal > 0 ? Math.floor(bal / buyIn) : 0;
      if (have < settings.cashBuyInsRequired) {
        alerts.push({
          id: `cash-req-${a.id}`,
          severity: "warning",
          title: `${a.name}: below your cash-game bankroll rule`,
          message: `${have} buy-ins of ${money(buyIn, a.currency)} (${settings.cashBuyInBigBlinds}bb at your latest stake) — your rule is ${settings.cashBuyInsRequired}. Consider a lower stake until the roll is rebuilt.`,
          href: `/bankroll/${a.id}`,
        });
      }
    }
    const tOnAcc = ctx.allResults.filter((r) => r.kind === "tournament" && r.accountId === a.id && r.countsInStats).slice(-20);
    if (tOnAcc.length >= 3) {
      // average face buy-in in the account currency (approximate via original amounts)
      const t = ctx.ds.tournaments.filter((x) => tOnAcc.some((r) => r.id === x.id));
      const faces = t.map((x) => (x.entries[0] ? x.entries[0].buyInMinor + x.entries[0].feeMinor : 0)).filter((v) => v > 0);
      if (faces.length) {
        const avg = divRoundMinor(faces.reduce((s, v) => s + v, 0), faces.length);
        const have = bal > 0 ? Math.floor(bal / avg) : 0;
        if (have < settings.tournamentBuyInsRequired) {
          alerts.push({
            id: `mtt-req-${a.id}`,
            severity: "warning",
            title: `${a.name}: below your tournament bankroll rule`,
            message: `${have} buy-ins at your recent average of ${money(avg, a.currency)} — your rule is ${settings.tournamentBuyInsRequired}. Consider smaller buy-ins until the roll is rebuilt.`,
            href: `/bankroll/${a.id}`,
          });
        }
      }
    }
  }

  if (ctx.missingCurrencies.length) {
    alerts.push({
      id: "fx-missing",
      severity: "info",
      title: "Exchange rate needed",
      message: `Records in ${ctx.missingCurrencies.join(", ")} are excluded from ${base} totals until you add a rate in Settings → Currencies.`,
      href: "/settings/currencies",
    });
  }
  return alerts;
}
