"use client";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/tooltip";
import { errorsFor, FormError, SubmitButton, useActionToast, useFormAction } from "@/components/forms";
import { Segmented } from "@/components/segmented";
import { minorUnits } from "@/lib/finance/currency";
import { parseMoney, percent } from "@/lib/finance/money";
import { tournamentInvestment, tournamentNet, tournamentReturn } from "@/lib/finance/records";
import { duration, money, pct, SETTING_LABELS, SPEED_LABELS, TOURNAMENT_FORMAT_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveTournamentAction } from "./actions";

export interface EntryValues {
  buyIn: string;
  fee: string;
  rebuyCount: string;
  rebuys: string;
  addons: string;
}

export interface PeriodValues {
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  dayLabel: string;
}

export interface TournamentFormValues {
  id?: string;
  name: string;
  status: string;
  setting: string;
  format: string;
  speed: string;
  isBounty: boolean;
  accountId: string;
  venueId: string;
  platformId: string;
  newVenueName: string;
  newPlatformName: string;
  gameTypeId: string;
  startDate: string;
  endDate: string;
  fieldSize: string;
  finishPosition: string;
  payout: string;
  bounties: string;
  refund: string;
  guarantee: string;
  notes: string;
  tags: string;
  entries: EntryValues[];
  periods: PeriodValues[];
}

interface Option {
  id: string;
  name: string;
}

export interface TournamentFormProps {
  values: TournamentFormValues;
  accounts: { id: string; name: string; currency: string }[];
  gameTypes: Option[];
  venues: Option[];
  platforms: Option[];
}

const NEW = "__new__";

function tryMinor(v: string, digits: number): number | null {
  if (!v.trim()) return 0;
  try {
    return parseMoney(v, digits);
  } catch {
    return null;
  }
}

function spanMinutes(p: PeriodValues): number | null {
  if (!p.startTime || !p.endTime) return null;
  const [sh, sm] = p.startTime.split(":").map(Number);
  const [eh, em] = p.endTime.split(":").map(Number);
  let span = eh * 60 + em - (sh * 60 + sm);
  if (span <= 0) span += 1440;
  return Math.max(0, span - (Number(p.breakMinutes) || 0));
}

export function TournamentForm({ values, accounts, gameTypes, venues, platforms }: TournamentFormProps) {
  const router = useRouter();
  const [state, onSubmit, pending] = useFormAction(saveTournamentAction);
  const [v, setV] = useState(values);
  const set = (k: keyof TournamentFormValues) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const setEntry = (i: number, k: keyof EntryValues) => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, entries: p.entries.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }));
  const setPeriod = (i: number, k: keyof PeriodValues) => (e: { target: { value: string } }) =>
    setV((p) => ({ ...p, periods: p.periods.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }));
  useActionToast(state, {
    onSuccess: (s) => {
      if (s.id) router.push(`/tournaments/${s.id}`);
    },
  });

  const currency = accounts.find((a) => a.id === v.accountId)?.currency ?? "CAD";
  const digits = minorUnits(currency);
  const err = (f: string) => errorsFor(state, f);
  const online = v.setting === "online";

  const preview = useMemo(() => {
    const m = (x: string) => tryMinor(x, digits);
    const entries = v.entries.map((e, i) => ({ entryNumber: i + 1, buyInMinor: m(e.buyIn), feeMinor: m(e.fee), rebuyCount: Number(e.rebuyCount) || 0, rebuysMinor: m(e.rebuys), addonsMinor: m(e.addons) }));
    const payoutMinor = m(v.payout);
    const bountiesMinor = m(v.bounties);
    const refundMinor = v.status === "cancelled" ? m(v.refund) : 0;
    if (payoutMinor === null || bountiesMinor === null || refundMinor === null || entries.some((e) => [e.buyInMinor, e.feeMinor, e.rebuysMinor, e.addonsMinor].includes(null))) return null;
    const t = { entries: entries as { entryNumber: number; buyInMinor: number; feeMinor: number; rebuyCount: number; rebuysMinor: number; addonsMinor: number }[], payoutMinor, bountiesMinor, refundMinor };
    const invested = tournamentInvestment(t);
    const net = tournamentNet(t);
    const minutes = v.periods.reduce((a, p) => a + (spanMinutes(p) ?? 0), 0);
    return { invested, returned: tournamentReturn(t), net, roi: invested > 0 ? percent(net, invested) : null, minutes };
  }, [v, digits]);

  const payload = JSON.stringify({
    ...v,
    id: undefined,
    venueId: v.venueId === NEW ? "" : v.venueId,
    platformId: v.platformId === NEW ? "" : v.platformId,
    newVenueName: v.venueId === NEW ? v.newVenueName : "",
    newPlatformName: v.platformId === NEW ? v.newPlatformName : "",
    refund: v.status === "cancelled" ? v.refund : "",
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1fr_320px]" noValidate>
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Event</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Tournament name" htmlFor="name" error={err("name")} required className="sm:col-span-2">
              <Input id="name" value={v.name} onChange={set("name")} maxLength={160} placeholder="e.g. Sunday Deepstack $250" aria-invalid={!!err("name")} />
            </Field>
            <div className="sm:col-span-2">
              <Segmented
                name="status-ui"
                label="Status"
                value={v.status}
                onChange={(status) => setV((p) => ({ ...p, status }))}
                options={[
                  { value: "completed", label: "Completed" },
                  { value: "in_progress", label: "In progress" },
                  { value: "draft", label: "Draft" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
              />
              <p className="mt-1.5 text-xs text-fg-subtle">
                {v.status === "draft"
                  ? "Drafts are not counted anywhere until you change the status."
                  : v.status === "in_progress"
                    ? "Your buy-ins already reduce the bankroll. ROI and ITM stats include it once it is completed."
                    : v.status === "cancelled"
                      ? "Enter any refund you received. The net (refund − buy-ins) is applied to your bankroll."
                      : "Counts toward your bankroll and all tournament statistics."}
              </p>
            </div>
            <Field label="Start date" htmlFor="startDate" error={err("startDate")} required>
              <Input id="startDate" type="date" value={v.startDate} onChange={set("startDate")} aria-invalid={!!err("startDate")} />
            </Field>
            <Field label="End date" htmlFor="endDate" error={err("endDate")} hint="For multi-day events">
              <Input id="endDate" type="date" value={v.endDate} onChange={set("endDate")} />
            </Field>
            <Field label="Account" htmlFor="accountId" error={err("accountId")} required>
              <Select id="accountId" value={v.accountId} onChange={set("accountId")}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Game type" htmlFor="gameTypeId" error={err("gameTypeId")}>
              <Select id="gameTypeId" value={v.gameTypeId} onChange={set("gameTypeId")}>
                <option value="">—</option>
                {gameTypes.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Segmented name="setting-ui" label="Where" value={v.setting} onChange={(setting) => setV((p) => ({ ...p, setting }))} options={Object.entries(SETTING_LABELS).map(([value, label]) => ({ value, label }))} />
            </div>
            {online ? (
              <Field label="Platform" htmlFor="platformId" error={err("platformId") ?? err("newPlatformName")}>
                <Select id="platformId" value={v.platformId} onChange={set("platformId")}>
                  <option value="">—</option>
                  {platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value={NEW}>+ Add new platform…</option>
                </Select>
                {v.platformId === NEW ? <Input value={v.newPlatformName} onChange={set("newPlatformName")} placeholder="Platform name" aria-label="New platform name" autoFocus /> : null}
              </Field>
            ) : (
              <Field label="Casino / venue" htmlFor="venueId" error={err("venueId") ?? err("newVenueName")}>
                <Select id="venueId" value={v.venueId} onChange={set("venueId")}>
                  <option value="">—</option>
                  {venues.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value={NEW}>+ Add new…</option>
                </Select>
                {v.venueId === NEW ? <Input value={v.newVenueName} onChange={set("newVenueName")} placeholder="Venue name" aria-label="New venue name" autoFocus /> : null}
              </Field>
            )}
            <Field label="Format" htmlFor="format">
              <Select id="format" value={v.format} onChange={set("format")}>
                {Object.entries(TOURNAMENT_FORMAT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Speed" htmlFor="speed">
              <Select id="speed" value={v.speed} onChange={set("speed")}>
                {Object.entries(SPEED_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Guarantee" htmlFor="guarantee" error={err("guarantee")} hint="Optional prize pool guarantee">
              <MoneyInput id="guarantee" currency={currency} value={v.guarantee} onChange={set("guarantee")} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
              <input type="checkbox" checked={v.isBounty} onChange={(e) => setV((p) => ({ ...p, isBounty: e.target.checked }))} className="size-4 accent-gold" />
              Bounty / knockout tournament
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-1.5">
              Entries ({currency})
              <InfoTip content="Each re-entry is its own entry with its own buy-in and fee. Rebuys and add-ons are added to the entry they were bought on. Total investment = Σ (buy-in + fee + rebuys + add-ons)." />
            </CardTitle>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={v.entries.length >= 100}
              onClick={() => setV((p) => ({ ...p, entries: [...p.entries, { ...p.entries[p.entries.length - 1], rebuyCount: "", rebuys: "", addons: "" }] }))}
            >
              <Plus /> Re-entry
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {err("entries") ? <p className="text-xs text-negative">{err("entries")![0]}</p> : null}
            {v.entries.map((e, i) => (
              <fieldset key={i} className="rounded-lg border border-border bg-surface-2/40 p-3">
                <legend className="flex w-full items-center justify-between px-1 text-xs font-medium text-fg-muted">
                  <span>{i === 0 ? "Entry 1" : `Re-entry ${i}`}</span>
                </legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_0.7fr_1fr_1fr_auto]">
                  <Field label="Buy-in" htmlFor={`e${i}-buyIn`} error={err(`entries.${i}.buyIn`)} required>
                    <MoneyInput id={`e${i}-buyIn`} currency={currency} value={e.buyIn} onChange={setEntry(i, "buyIn")} aria-invalid={!!err(`entries.${i}.buyIn`)} />
                  </Field>
                  <Field label="Fee / rake" htmlFor={`e${i}-fee`} error={err(`entries.${i}.fee`)}>
                    <MoneyInput id={`e${i}-fee`} currency={currency} value={e.fee} onChange={setEntry(i, "fee")} />
                  </Field>
                  <Field label="# Rebuys" htmlFor={`e${i}-rc`} error={err(`entries.${i}.rebuyCount`)}>
                    <Input id={`e${i}-rc`} type="number" inputMode="numeric" min={0} value={e.rebuyCount} onChange={setEntry(i, "rebuyCount")} />
                  </Field>
                  <Field label="Rebuys total" htmlFor={`e${i}-rb`} error={err(`entries.${i}.rebuys`)}>
                    <MoneyInput id={`e${i}-rb`} currency={currency} value={e.rebuys} onChange={setEntry(i, "rebuys")} />
                  </Field>
                  <Field label="Add-ons" htmlFor={`e${i}-ad`} error={err(`entries.${i}.addons`)}>
                    <MoneyInput id={`e${i}-ad`} currency={currency} value={e.addons} onChange={setEntry(i, "addons")} />
                  </Field>
                  {v.entries.length > 1 ? (
                    <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={`Remove entry ${i + 1}`} onClick={() => setV((p) => ({ ...p, entries: p.entries.filter((_, j) => j !== i) }))}>
                      <X />
                    </Button>
                  ) : null}
                </div>
              </fieldset>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Field size" htmlFor="fieldSize" error={err("fieldSize")} hint="Total entries">
              <Input id="fieldSize" type="number" inputMode="numeric" min={1} value={v.fieldSize} onChange={set("fieldSize")} />
            </Field>
            <Field label="Finish position" htmlFor="finishPosition" error={err("finishPosition")}>
              <Input id="finishPosition" type="number" inputMode="numeric" min={1} value={v.finishPosition} onChange={set("finishPosition")} aria-invalid={!!err("finishPosition")} />
            </Field>
            <Field label="Prize payout" htmlFor="payout" error={err("payout")} hint="0 if you did not cash">
              <MoneyInput id="payout" currency={currency} value={v.payout} onChange={set("payout")} />
            </Field>
            <Field label="Bounties won" htmlFor="bounties" error={err("bounties")}>
              <MoneyInput id="bounties" currency={currency} value={v.bounties} onChange={set("bounties")} />
            </Field>
            {v.status === "cancelled" ? (
              <Field label="Refund received" htmlFor="refund" error={err("refund")} className="col-span-2">
                <MoneyInput id="refund" currency={currency} value={v.refund} onChange={set("refund")} />
              </Field>
            ) : null}
            <p className="col-span-2 text-xs text-fg-subtle sm:col-span-4">An in-the-money finish requires a prize payout above zero. Bounties alone do not count as a cash.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-1.5">
              Playing days
              <InfoTip content="Optional. Add each day or flight you played so hours and hourly rate are tracked. An end time earlier than the start means you finished after midnight." />
            </CardTitle>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={v.periods.length >= 30}
              onClick={() => setV((p) => ({ ...p, periods: [...p.periods, { date: p.periods.at(-1)?.date ?? p.startDate, startTime: p.periods.at(-1)?.startTime ?? "", endTime: "", breakMinutes: "", dayLabel: `Day ${p.periods.length + 1}` }] }))}
            >
              <Plus /> Day
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {v.periods.length === 0 ? <p className="text-sm text-fg-subtle">No playing time recorded. Hours and hourly rate will be unavailable for this event.</p> : null}
            {v.periods.map((p, i) => {
              const mins = spanMinutes(p);
              return (
                <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface-2/40 p-3 sm:grid-cols-[0.8fr_1.1fr_0.8fr_0.8fr_0.7fr_auto]">
                  <Field label="Label" htmlFor={`p${i}-label`} error={err(`periods.${i}.dayLabel`)}>
                    <Input id={`p${i}-label`} value={p.dayLabel} onChange={setPeriod(i, "dayLabel")} maxLength={40} placeholder={`Day ${i + 1}`} />
                  </Field>
                  <Field label="Date" htmlFor={`p${i}-date`} error={err(`periods.${i}.date`)}>
                    <Input id={`p${i}-date`} type="date" value={p.date} onChange={setPeriod(i, "date")} />
                  </Field>
                  <Field label="Start" htmlFor={`p${i}-start`} error={err(`periods.${i}.startTime`)}>
                    <Input id={`p${i}-start`} type="time" value={p.startTime} onChange={setPeriod(i, "startTime")} />
                  </Field>
                  <Field label="End" htmlFor={`p${i}-end`} error={err(`periods.${i}.endTime`)} hint={mins !== null ? duration(mins) : "Blank = still playing"}>
                    <Input id={`p${i}-end`} type="time" value={p.endTime} onChange={setPeriod(i, "endTime")} />
                  </Field>
                  <Field label="Breaks (min)" htmlFor={`p${i}-brk`} error={err(`periods.${i}.breakMinutes`)}>
                    <Input id={`p${i}-brk`} type="number" inputMode="numeric" min={0} value={p.breakMinutes} onChange={setPeriod(i, "breakMinutes")} />
                  </Field>
                  <Button type="button" variant="ghost" size="icon" className="self-start sm:mt-6" aria-label={`Remove playing day ${i + 1}`} onClick={() => setV((x) => ({ ...x, periods: x.periods.filter((_, j) => j !== i) }))}>
                    <X />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. series, satellite target">
              <Input id="tags" value={v.tags} onChange={set("tags")} />
            </Field>
            <Field label="Notes" htmlFor="notes" error={err("notes")}>
              <Textarea id="notes" value={v.notes} onChange={set("notes")} rows={4} maxLength={8000} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {preview ? (
              <>
                <Row label={`Entries`} value={String(v.entries.length)} />
                <Row label="Total invested" value={money(preview.invested, currency)} />
                <Row label="Total returned" value={money(preview.returned, currency)} />
                <Row label="Time played" value={preview.minutes ? duration(preview.minutes) : "—"} />
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-fg-muted">Net result</p>
                  <p className={cn("num mt-1 text-2xl font-semibold", v.status === "draft" ? "text-fg-subtle" : preview.net > 0 ? "text-positive" : preview.net < 0 ? "text-negative" : "")}>{money(preview.net, currency, { signed: true })}</p>
                  <p className="num mt-1 text-xs text-fg-muted">ROI {pct(preview.roi, 1, true)}</p>
                  {v.status === "draft" ? <p className="mt-1 text-xs text-fg-subtle">Not counted while a draft.</p> : null}
                </div>
              </>
            ) : (
              <p className="text-negative">Check the amounts — one is not a valid number.</p>
            )}
            <FormError state={state} />
            <SubmitButton pending={pending} className="w-full" size="lg" pendingText="Saving…">
              {v.id ? "Save changes" : v.status === "draft" ? "Save draft" : "Save tournament"}
            </SubmitButton>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-muted">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
