import Link from "next/link";
import { BellRing, ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Stat } from "@/components/stat";
import { addDays, todayIn, weekStart } from "@/lib/finance/dates";
import { sumMinor } from "@/lib/finance/money";
import type { PokerResult } from "@/lib/finance/results";
import { dateLabel, duration, money, monthLabel, SETTING_LABELS, STATUS_LABELS } from "@/lib/format";
import { sp, validDate } from "@/lib/server/search-params";
import { getFinance } from "@/lib/server/workspace";
import { cn } from "@/lib/utils";
import type { DayNote, PlannedSession, Workspace } from "@/lib/data/workspace";
import { EditPlanDialog, NewPlanDialog, NoteDialog, type PlanOptions, type PlanValues } from "./forms";
import { DeleteNoteButton, PlanButtons } from "./plan-buttons";

export const metadata = { title: "Calendar" };

type View = "month" | "week" | "day";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = sp(await searchParams);
  const { ws, ctx } = await getFinance();
  const tz = ws.settings.timezone;
  const today = todayIn(tz);
  const view: View = params.view === "week" || params.view === "day" ? params.view : "month";
  const anchor = validDate(params.date) ?? today;
  const base = ws.settings.baseCurrency;
  const wso = ws.settings.weekStartsOn;

  const byDate = <T,>(items: T[], dateOf: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of items) m.set(dateOf(x), [...(m.get(dateOf(x)) ?? []), x]);
    return m;
  };
  const results = byDate(ctx.allResults, (r) => r.date);
  const plans = byDate(ws.planned, (p) => p.plannedDate);
  const notes = byDate(ws.notes, (n) => n.noteDate);

  let from: string;
  let to: string;
  let prev: string;
  let next: string;
  let heading: string;
  if (view === "month") {
    from = `${anchor.slice(0, 7)}-01`;
    to = addDays(`${nextMonth(anchor)}-01`, -1);
    prev = `${prevMonth(anchor)}-01`;
    next = `${nextMonth(anchor)}-01`;
    heading = monthLabel(anchor.slice(0, 7));
  } else if (view === "week") {
    from = weekStart(anchor, wso);
    to = addDays(from, 6);
    prev = addDays(from, -7);
    next = addDays(from, 7);
    heading = `${dateLabel(from, { month: "short", day: "numeric" })} – ${dateLabel(to, { month: "short", day: "numeric", year: "numeric" })}`;
  } else {
    from = to = anchor;
    prev = addDays(anchor, -1);
    next = addDays(anchor, 1);
    heading = dateLabel(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  const inPeriod = ctx.allResults.filter((r) => r.date >= from && r.date <= to);
  const periodNet = sumMinor(inPeriod.map((r) => r.netMinor));
  const periodMinutes = inPeriod.reduce((a, r) => a + r.minutes, 0);
  const winningDays = new Set(inPeriod.map((r) => r.date));
  const dayTotals = [...winningDays].map((d) => sumMinor((results.get(d) ?? []).map((r) => r.netMinor)));

  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ view, date: anchor, ...patch });
    if (q.get("view") === "month") q.delete("view");
    if (q.get("date") === today) q.delete("date");
    return `/calendar${q.size ? `?${q}` : ""}`;
  };

  const planOptions: PlanOptions = {
    venues: ws.venues.filter((v) => !v.archivedAt).map((v) => ({ id: v.id, name: v.name })),
    platforms: ws.platforms.filter((v) => !v.archivedAt).map((v) => ({ id: v.id, name: v.name })),
    gameTypes: ws.gameTypes.filter((v) => !v.archivedAt).map((v) => ({ id: v.id, name: v.name })),
    stakeLevels: ws.stakeLevels.filter((v) => !v.archivedAt).map((v) => ({ id: v.id, name: v.label })),
  };
  const blankPlan = (date: string): PlanValues => ({ plannedDate: date, startTime: "", kind: "cash", setting: "live_casino", title: "", venueId: "", platformId: "", gameTypeId: "", stakeLevelId: "", notes: "", reminderMinutesBefore: "" });

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Results, planned sessions and notes by day. Amounts in your base currency."
        actions={
          <>
            <NewPlanDialog values={blankPlan(view === "day" ? anchor : today < from || today > to ? from : today)} options={planOptions} />
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon">
            <Link href={href({ date: prev })} aria-label="Previous">
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon">
            <Link href={href({ date: next })} aria-label="Next">
              <ChevronRight />
            </Link>
          </Button>
          <h2 className="ml-1 text-lg font-semibold">{heading}</h2>
          {anchor !== today ? (
            <Button asChild variant="secondary" size="sm" className="ml-2">
              <Link href={href({ date: today })}>Today</Link>
            </Button>
          ) : null}
        </div>
        <nav aria-label="Calendar view" className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {(["month", "week", "day"] as const).map((v) => (
            <Link key={v} href={href({ view: v })} aria-current={view === v ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-xs font-medium capitalize", view === v ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}>
              {v}
            </Link>
          ))}
        </nav>
      </div>

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net result" value={money(periodNet, base, { signed: true })} tone={periodNet > 0 ? "positive" : periodNet < 0 ? "negative" : "neutral"} />
        <Stat label="Sessions & tournaments" value={String(inPeriod.length)} />
        <Stat label="Time played" value={duration(periodMinutes)} />
        <Stat label="Winning days" value={dayTotals.length ? `${dayTotals.filter((d) => d > 0).length} of ${dayTotals.length}` : "—"} />
      </section>

      {view === "month" ? (
        <MonthGrid from={from} to={to} today={today} wso={wso} results={results} plans={plans} notes={notes} base={base} dayHref={(d) => href({ view: "day", date: d })} />
      ) : (
        <div className="space-y-3">
          {Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => addDays(from, i)).map((d) => (
            <DayCard key={d} date={d} today={today} ws={ws} base={base} results={results.get(d) ?? []} plans={plans.get(d) ?? []} notes={notes.get(d) ?? []} planOptions={planOptions} blankPlan={blankPlan(d)} dayHref={view === "week" ? href({ view: "day", date: d }) : null} />
          ))}
        </div>
      )}
    </>
  );
}

function prevMonth(d: string) {
  const [y, m] = d.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function nextMonth(d: string) {
  const [y, m] = d.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MonthGrid({
  from,
  to,
  today,
  wso,
  results,
  plans,
  notes,
  base,
  dayHref,
}: {
  from: string;
  to: string;
  today: string;
  wso: number;
  results: Map<string, PokerResult[]>;
  plans: Map<string, PlannedSession[]>;
  notes: Map<string, DayNote[]>;
  base: string;
  dayHref: (d: string) => string;
}) {
  const start = weekStart(from, wso);
  const days: string[] = [];
  for (let d = start; d <= to || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="py-2">
            {DOW[(wso + i) % 7]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const rs = results.get(d) ?? [];
          const net = rs.length ? sumMinor(rs.map((r) => r.netMinor)) : null;
          const pl = (plans.get(d) ?? []).filter((p) => p.status === "planned");
          const nt = notes.get(d) ?? [];
          const outside = d < from || d > to;
          return (
            <Link
              key={d}
              href={dayHref(d)}
              aria-label={`${dateLabel(d)}${net !== null ? `, result ${money(net, base, { signed: true })}` : ""}${pl.length ? `, ${pl.length} planned` : ""}`}
              className={cn(
                "flex min-h-16 flex-col gap-1 border-b border-r border-border/60 p-1.5 text-left transition-colors hover:bg-surface-2 sm:min-h-24 sm:p-2 [&:nth-child(7n)]:border-r-0",
                net !== null && net > 0 && "bg-positive-soft",
                net !== null && net < 0 && "bg-negative-soft",
                outside && "bg-bg/40 text-fg-subtle opacity-50",
              )}
            >
              <span className={cn("num text-xs", d === today && "flex size-5 items-center justify-center rounded-full bg-gold font-semibold text-black")}>{Number(d.slice(8))}</span>
              {net !== null ? (
                <span className={cn("num truncate text-[10px] font-semibold sm:text-xs", net > 0 ? "text-positive" : net < 0 ? "text-negative" : "text-fg-muted")}>{money(net, base, { signed: true, compact: true })}</span>
              ) : null}
              <span className="mt-auto flex items-center gap-1">
                {rs.length > 1 ? <span className="text-[10px] text-fg-subtle">×{rs.length}</span> : null}
                {pl.length ? <span className="size-1.5 rounded-full bg-gold" title="Planned session" /> : null}
                {nt.length ? <NotebookPen className="size-3 text-fg-subtle" aria-hidden /> : null}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-4 px-4 py-2 text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-positive-soft ring-1 ring-positive/40" /> Winning day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-negative-soft ring-1 ring-negative/40" /> Losing day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-gold" /> Planned
        </span>
        <span className="flex items-center gap-1.5">
          <NotebookPen className="size-3" /> Note
        </span>
      </p>
    </Card>
  );
}

function DayCard({
  date,
  today,
  ws,
  base,
  results,
  plans,
  notes,
  planOptions,
  blankPlan,
  dayHref,
}: {
  date: string;
  today: string;
  ws: Workspace;
  base: string;
  results: PokerResult[];
  plans: PlannedSession[];
  notes: DayNote[];
  planOptions: PlanOptions;
  blankPlan: PlanValues;
  dayHref: string | null;
}) {
  const net = results.length ? sumMinor(results.map((r) => r.netMinor)) : null;
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name;
  const empty = !results.length && !plans.length && !notes.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {dayHref ? (
            <Link href={dayHref} className="hover:underline">
              {dateLabel(date, { weekday: "short", month: "short", day: "numeric" })}
            </Link>
          ) : (
            dateLabel(date, { weekday: "short", month: "short", day: "numeric" })
          )}
          {date === today ? <Badge tone="gold">Today</Badge> : null}
        </CardTitle>
        <div className="flex items-center gap-1">
          {net !== null ? <span className={cn("num mr-2 text-sm font-semibold", net > 0 ? "text-positive" : net < 0 ? "text-negative" : "")}>{money(net, base, { signed: true })}</span> : null}
          <NewPlanDialog values={blankPlan} options={planOptions} compact />
          <NoteDialog values={{ noteDate: date, title: "", body: "" }} />
        </div>
      </CardHeader>
      {empty ? null : (
        <CardContent className="space-y-3 text-sm">
          {results.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {results.map((r) => (
                <li key={r.id}>
                  <Link href={r.kind === "cash" ? `/sessions/${r.id}` : `/tournaments/${r.id}`} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-surface-2">
                    <span className="min-w-0 truncate">
                      {r.kind === "tournament" ? (r.name ?? "Tournament") : `${name(ws.gameTypes, r.gameTypeId) ?? "Cash game"}`}
                      <span className="text-fg-muted"> · {(r.setting === "online" ? name(ws.platforms, r.platformId) : name(ws.venues, r.venueId)) ?? SETTING_LABELS[r.setting]} · {duration(r.minutes)}</span>
                      {r.status !== "completed" ? <Badge tone="neutral" className="ml-2">{STATUS_LABELS[r.status]}</Badge> : null}
                    </span>
                    <span className={cn("num shrink-0 font-medium", r.netMinor > 0 ? "text-positive" : r.netMinor < 0 ? "text-negative" : "")}>{money(r.netMinor, base, { signed: true })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {plans.map((p) => (
            <div key={p.id} className={cn("flex items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2", p.status !== "planned" && "opacity-60")}>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {p.title ?? `${p.kind === "cash" ? "Cash game" : "Tournament"}${p.stakeLevelId ? ` ${name(planOptions.stakeLevels, p.stakeLevelId) ?? ""}` : ""}`}
                  {p.status !== "planned" ? <Badge tone="neutral" className="ml-2">{p.status === "done" ? "Played" : "Skipped"}</Badge> : null}
                </p>
                <p className="truncate text-xs text-fg-muted">
                  Planned{p.startTime ? ` · ${p.startTime.slice(0, 5)}` : ""} · {(p.setting === "online" ? name(ws.platforms, p.platformId) : name(ws.venues, p.venueId)) ?? SETTING_LABELS[p.setting]}
                  {p.reminderMinutesBefore !== null ? (
                    <span className="ml-1 inline-flex items-center gap-1">
                      · <BellRing className="size-3" /> {p.reminderMinutesBefore >= 60 ? `${p.reminderMinutesBefore / 60}h` : `${p.reminderMinutesBefore}m`} before
                    </span>
                  ) : null}
                </p>
                {p.notes ? <p className="mt-1 text-xs text-fg-subtle">{p.notes}</p> : null}
              </div>
              <div className="flex shrink-0 items-center">
                {p.status === "planned" ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={p.kind === "cash" ? `/sessions/new?date=${p.plannedDate}` : `/tournaments/new?date=${p.plannedDate}`}>Log</Link>
                  </Button>
                ) : null}
                <EditPlanDialog
                  options={planOptions}
                  values={{
                    id: p.id,
                    plannedDate: p.plannedDate,
                    startTime: p.startTime?.slice(0, 5) ?? "",
                    kind: p.kind,
                    setting: p.setting,
                    title: p.title ?? "",
                    venueId: p.venueId ?? "",
                    platformId: p.platformId ?? "",
                    gameTypeId: p.gameTypeId ?? "",
                    stakeLevelId: p.stakeLevelId ?? "",
                    notes: p.notes ?? "",
                    reminderMinutesBefore: p.reminderMinutesBefore !== null ? String(p.reminderMinutesBefore) : "",
                  }}
                />
                <PlanButtons id={p.id} status={p.status} />
              </div>
            </div>
          ))}
          {notes.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-2/50 px-3 py-2">
              <div className="min-w-0">
                {n.title ? <p className="font-medium">{n.title}</p> : null}
                <p className="whitespace-pre-wrap text-fg-muted">{n.body}</p>
              </div>
              <div className="flex shrink-0">
                <NoteDialog values={{ id: n.id, noteDate: n.noteDate, title: n.title ?? "", body: n.body }} />
                <DeleteNoteButton id={n.id} />
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
