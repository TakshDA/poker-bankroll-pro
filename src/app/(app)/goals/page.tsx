import Link from "next/link";
import { AlertTriangle, CircleCheck, Info, ShieldCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { evaluateGoals, type Goal, type GoalProgress } from "@/lib/finance/goals";
import { minorUnits } from "@/lib/finance/currency";
import { minorToDecimal } from "@/lib/finance/money";
import { dateLabel } from "@/lib/format";
import { getAlerts } from "@/lib/server/alerts";
import { getFinance } from "@/lib/server/workspace";
import { cn } from "@/lib/utils";
import { AlertRulesForm, EditGoalDialog, GoalButtons, NewGoalDialog, type GoalOptions, type GoalValues } from "./goal-forms";
import { KIND_INFO, PERIOD_LABELS } from "./goal-meta";

export const metadata = { title: "Goals & limits" };

const STATUS: Record<GoalProgress["status"], { label: string; tone: "positive" | "warning" | "negative" | "neutral" | "gold" }> = {
  on_track: { label: "On track", tone: "neutral" },
  achieved: { label: "Achieved", tone: "positive" },
  warning: { label: "Close to limit", tone: "warning" },
  breached: { label: "Limit reached", tone: "negative" },
  unavailable: { label: "Needs a rate", tone: "neutral" },
};

function toValues(g: Goal): GoalValues {
  const cur = g.currency ?? "CAD";
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    period: g.period,
    target: g.targetMinor !== null ? minorToDecimal(g.targetMinor, minorUnits(cur)) : "",
    targetHours: g.targetMinutes ? String(Math.round((g.targetMinutes / 60) * 100) / 100) : "",
    targetCount: g.targetCount ? String(g.targetCount) : "",
    currency: cur,
    accountId: g.accountId ?? "",
    startDate: g.startDate ?? "",
    endDate: g.endDate ?? "",
    notes: g.notes ?? "",
  };
}

function periodText(g: Goal): string {
  if (g.kind === "daily_loss_limit") return "Every day";
  if (g.kind === "max_session_loss") return "Every session";
  if (g.kind === "min_bankroll") return "Always";
  if (g.period === "custom" && g.startDate && g.endDate) return `${dateLabel(g.startDate)} – ${dateLabel(g.endDate)}`;
  return PERIOD_LABELS[g.period] ?? g.period;
}

export default async function GoalsPage() {
  const [{ ws, ctx }, alerts] = await Promise.all([getFinance(), getAlerts()]);
  const base = ws.settings.baseCurrency;
  const progress = new Map(evaluateGoals(ws.goals, ctx).map((p) => [p.goal.id, p]));
  const active = ws.goals.filter((g) => g.active);
  const limits = active.filter((g) => KIND_INFO[g.kind]?.limit);
  const goals = active.filter((g) => !KIND_INFO[g.kind]?.limit);
  const paused = ws.goals.filter((g) => !g.active);
  const options: GoalOptions = {
    currencies: Array.from(new Set([base, ...ws.settings.enabledCurrencies.map((c) => c.trim())])),
    accounts: ws.dataset.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
  };
  const blank = (kind: string): GoalValues => ({ name: "", kind, period: "monthly", target: "", targetHours: "", targetCount: "", currency: base, accountId: "", startDate: "", endDate: "", notes: "" });
  const shownAlerts = alerts.filter((a) => a.severity !== "info" || a.id === "fx-missing");

  const card = (g: Goal) => (
    <GoalCard key={g.id} goal={g} progress={progress.get(g.id)} base={base} actions={<><EditGoalDialog values={toValues(g)} options={options} /><GoalButtons id={g.id} name={g.name} active={g.active} /></>} />
  );

  return (
    <>
      <PageHeader title="Goals & limits" description="Set targets to aim for and limits that tell you when to stop. Progress uses the same numbers as your dashboard." actions={<NewGoalDialog values={blank("daily_loss_limit")} options={options} />} />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-surface-1 p-4 text-sm text-fg-muted">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden />
        <p>Limits are there to protect your bankroll. When one is reached, the app will suggest stopping, taking a break or moving down in stakes. It never suggests playing more to win losses back.</p>
      </div>

      {shownAlerts.length ? (
        <section aria-labelledby="alerts-heading" className="mb-5">
          <h2 id="alerts-heading" className="mb-2 text-sm font-semibold">
            Alerts right now
          </h2>
          <ul className="space-y-2">
            {shownAlerts.map((a) => {
              const Icon = a.severity === "critical" ? AlertTriangle : a.severity === "warning" ? AlertTriangle : Info;
              return (
                <li key={a.id} className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm", a.severity === "critical" ? "border-negative/40 bg-negative-soft" : a.severity === "warning" ? "border-warning/40 bg-warning-soft" : "border-border bg-surface-1")}>
                  <Icon className={cn("mt-0.5 size-4 shrink-0", a.severity === "critical" ? "text-negative" : a.severity === "warning" ? "text-warning" : "text-fg-muted")} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-fg-muted">{a.message}</p>
                    {a.href && a.href !== "/goals" ? (
                      <Link href={a.href} className="text-xs underline">
                        View
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {ws.goals.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="No goals or limits yet"
          description="A daily loss limit is a good first one: it tells you when to call it a day. You can also track profit, hours or an expense budget."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <NewGoalDialog values={{ ...blank("daily_loss_limit"), name: "Daily loss limit" }} options={options} label="Daily loss limit" variant="secondary" />
              <NewGoalDialog values={{ ...blank("profit"), name: "Monthly profit goal" }} options={options} label="Monthly profit goal" variant="secondary" />
            </div>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section aria-labelledby="limits-heading" className="min-w-0">
            <h2 id="limits-heading" className="mb-2 text-sm font-semibold">
              Limits
            </h2>
            {limits.length ? <div className="space-y-3">{limits.map(card)}</div> : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-fg-muted">No active limits. A daily loss limit or a stop-loss per session helps you stop at the right time.</p>}
          </section>
          <section aria-labelledby="goals-heading" className="min-w-0">
            <h2 id="goals-heading" className="mb-2 text-sm font-semibold">
              Goals
            </h2>
            {goals.length ? <div className="space-y-3">{goals.map(card)}</div> : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-fg-muted">No active goals. Add a profit, hours or sessions target.</p>}
          </section>
          {paused.length ? (
            <section aria-labelledby="paused-heading" className="min-w-0 lg:col-span-2">
              <h2 id="paused-heading" className="mb-2 text-sm font-semibold text-fg-muted">
                Paused
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">{paused.map(card)}</div>
            </section>
          ) : null}
        </div>
      )}

      <Card className="mt-5">
        <CardHeader className="flex-col gap-1">
          <CardTitle>Bankroll rules</CardTitle>
          <CardDescription>Used for the &quot;enough buy-ins&quot; warnings on each account and the cooldown reminder.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertRulesForm values={ws.settings} />
        </CardContent>
      </Card>
    </>
  );
}

function GoalCard({ goal, progress, base, actions }: { goal: Goal; progress?: GoalProgress; base: string; actions: React.ReactNode }) {
  const info = KIND_INFO[goal.kind];
  const status = progress ? STATUS[progress.status] : null;
  const pct = progress?.pct ?? null;
  const fill = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const barColor = !progress ? "bg-surface-3" : progress.status === "breached" ? "bg-negative" : progress.status === "warning" ? "bg-warning" : info?.limit ? "bg-fg-subtle" : progress.status === "achieved" ? "bg-positive" : "bg-gold";
  return (
    <Card className={cn(!goal.active && "opacity-70")}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{goal.name}</p>
            <p className="text-xs text-fg-subtle">
              {info?.label} · {periodText(goal)}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            {goal.active && status ? (
              <Badge tone={status.tone} className="mr-1">
                {status.tone === "positive" ? <CircleCheck className="size-3" aria-hidden /> : null}
                {status.label}
              </Badge>
            ) : !goal.active ? (
              <Badge tone="outline" className="mr-1">
                Paused
              </Badge>
            ) : null}
            {actions}
          </div>
        </div>
        {goal.active && progress ? (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill)} aria-label={`${goal.name} progress`}>
              <div className={cn("h-full rounded-full", barColor)} style={{ width: `${fill}%` }} />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              {progress.summary}
              {pct !== null && progress.status !== "unavailable" ? <span className="num text-fg-subtle"> · {Math.round(pct)}%</span> : null}
            </p>
            {goal.currency && goal.currency !== base && progress.status !== "unavailable" ? <p className="text-xs text-fg-subtle">Shown in {base} using your exchange rates.</p> : null}
          </>
        ) : null}
        {goal.notes ? <p className="mt-2 text-xs text-fg-subtle">{goal.notes}</p> : null}
      </CardContent>
    </Card>
  );
}
