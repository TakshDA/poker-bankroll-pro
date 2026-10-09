"use client";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/tooltip";
import { errorsFor, FormError, SubmitButton, useActionToast } from "@/components/forms";
import { Segmented } from "@/components/segmented";
import { initialActionState } from "@/lib/validation/common";
import { minorUnits } from "@/lib/finance/currency";
import { parseMoney } from "@/lib/finance/money";
import { cashInvested, cashSessionNet } from "@/lib/finance/records";
import { duration, money, moneyInput, SETTING_LABELS, TABLE_FORMAT_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveSessionAction } from "./actions";

export interface SessionFormValues {
  id?: string;
  status: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  setting: string;
  accountId: string;
  gameTypeId: string;
  variant: string;
  venueId: string;
  platformId: string;
  stakeLevelId: string;
  smallBlind: string;
  bigBlind: string;
  straddle: string;
  ante: string;
  tableFormat: string;
  seats: string;
  buyIn: string;
  rebuys: string;
  additional: string;
  cashOut: string;
  rake: string;
  tips: string;
  fees: string;
  bonus: string;
  rakeback: string;
  handsPlayed: string;
  notes: string;
  tags: string;
}

export interface Option {
  id: string;
  name: string;
}

export interface StakeOption {
  id: string;
  label: string;
  currency: string;
  smallBlindMinor: number;
  bigBlindMinor: number;
  straddleMinor: number | null;
  anteMinor: number | null;
}

export interface SessionFormProps {
  values: SessionFormValues;
  accounts: { id: string; name: string; currency: string }[];
  gameTypes: Option[];
  venues: Option[];
  platforms: Option[];
  stakeLevels: StakeOption[];
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

export function SessionForm({ values, accounts, gameTypes, venues, platforms, stakeLevels }: SessionFormProps) {
  const router = useRouter();
  const [state, action] = useActionState(saveSessionAction, initialActionState);
  const [v, setV] = useState(values);
  const set = (k: keyof SessionFormValues) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  useActionToast(state, {
    onSuccess: (s) => {
      if (s.id) router.push(`/sessions/${s.id}`);
    },
  });

  const account = accounts.find((a) => a.id === v.accountId);
  const currency = account?.currency ?? "CAD";
  const digits = minorUnits(currency);
  const stakesForAccount = stakeLevels.filter((s) => s.currency === currency);
  const err = (f: string) => errorsFor(state, f);

  const preview = useMemo(() => {
    const m = (x: string) => tryMinor(x, digits);
    const fields = { buyInMinor: m(v.buyIn), rebuysMinor: m(v.rebuys), additionalMinor: m(v.additional), tipsMinor: m(v.tips), feesMinor: m(v.fees), bonusMinor: m(v.bonus), rakebackMinor: m(v.rakeback) };
    if (Object.values(fields).some((x) => x === null)) return null;
    const cashOutMinor = v.cashOut.trim() ? m(v.cashOut) : null;
    const f = fields as Record<keyof typeof fields, number>;
    const invested = cashInvested(f);
    const net = cashSessionNet({ ...f, cashOutMinor });
    let minutes: number | null = null;
    let nextDay = false;
    if (v.startTime && v.endTime) {
      const [sh, sm] = v.startTime.split(":").map(Number);
      const [eh, em] = v.endTime.split(":").map(Number);
      let span = eh * 60 + em - (sh * 60 + sm);
      if (span <= 0) {
        span += 1440;
        nextDay = true;
      }
      minutes = Math.max(0, span - (Number(v.breakMinutes) || 0));
    }
    return { invested, net, minutes, nextDay };
  }, [v, digits]);

  const pickStake = (id: string) => {
    const s = stakeLevels.find((x) => x.id === id);
    setV((p) => ({
      ...p,
      stakeLevelId: id,
      ...(s
        ? {
            smallBlind: moneyInput(s.smallBlindMinor, s.currency),
            bigBlind: moneyInput(s.bigBlindMinor, s.currency),
            straddle: moneyInput(s.straddleMinor, s.currency),
            ante: moneyInput(s.anteMinor, s.currency),
          }
        : {}),
    }));
  };

  const online = v.setting === "online";

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[1fr_320px]" noValidate>
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>When &amp; where</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Segmented
                name="status"
                label="Status"
                value={v.status}
                onChange={(status) => setV((p) => ({ ...p, status }))}
                options={[
                  { value: "completed", label: "Completed" },
                  { value: "draft", label: "Draft" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
              />
              {v.status === "draft" ? <p className="mt-1.5 text-xs text-fg-subtle">Drafts can be saved without an end time or cash-out and are excluded from all statistics until completed.</p> : null}
            </div>
            <Field label="Date" htmlFor="date" error={err("date")} required>
              <Input id="date" name="date" type="date" value={v.date} onChange={set("date")} required aria-invalid={!!err("date")} />
            </Field>
            <Field label="Account" htmlFor="accountId" error={err("accountId")} required hint="Bankroll the money came from">
              <Select id="accountId" name="accountId" value={v.accountId} onChange={set("accountId")} aria-invalid={!!err("accountId")}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Start time" htmlFor="startTime" error={err("startTime")} required>
              <Input id="startTime" name="startTime" type="time" value={v.startTime} onChange={set("startTime")} aria-invalid={!!err("startTime")} />
            </Field>
            <Field
              label="End time"
              htmlFor="endTime"
              error={err("endTime")}
              hint={preview?.nextDay ? "Ends the next day (crosses midnight)" : "Leave blank for a draft"}
            >
              <Input id="endTime" name="endTime" type="time" value={v.endTime} onChange={set("endTime")} aria-invalid={!!err("endTime")} />
            </Field>
            <Field label="Breaks (minutes)" htmlFor="breakMinutes" error={err("breakMinutes")} hint="Time away from the table">
              <Input id="breakMinutes" name="breakMinutes" type="number" inputMode="numeric" min={0} value={v.breakMinutes} onChange={set("breakMinutes")} />
            </Field>
            <div className="sm:col-span-2">
              <Segmented
                name="setting"
                label="Where"
                value={v.setting}
                onChange={(setting) => setV((p) => ({ ...p, setting }))}
                options={Object.entries(SETTING_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
            {online ? (
              <Field label="Platform" htmlFor="platformId" error={err("platformId") ?? err("newPlatformName")}>
                <Select id="platformId" name={v.platformId === NEW ? undefined : "platformId"} value={v.platformId} onChange={set("platformId")}>
                  <option value="">—</option>
                  {platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value={NEW}>+ Add new platform…</option>
                </Select>
                {v.platformId === NEW ? <Input name="newPlatformName" placeholder="Platform name" aria-label="New platform name" autoFocus /> : null}
              </Field>
            ) : (
              <Field label={v.setting === "home_game" ? "Host / location" : "Casino / poker room"} htmlFor="venueId" error={err("venueId") ?? err("newVenueName")}>
                <Select id="venueId" name={v.venueId === NEW ? undefined : "venueId"} value={v.venueId} onChange={set("venueId")}>
                  <option value="">—</option>
                  {venues.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value={NEW}>+ Add new…</option>
                </Select>
                {v.venueId === NEW ? <Input name="newVenueName" placeholder="Venue name" aria-label="New venue name" autoFocus /> : null}
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Game</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Game type" htmlFor="gameTypeId" error={err("gameTypeId")}>
              <Select id="gameTypeId" name="gameTypeId" value={v.gameTypeId} onChange={set("gameTypeId")}>
                <option value="">—</option>
                {gameTypes.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Variant" htmlFor="variant" hint="Optional, e.g. bomb pots, double board">
              <Input id="variant" name="variant" value={v.variant} onChange={set("variant")} maxLength={80} />
            </Field>
            <Field label="Stake level" htmlFor="stakeLevelId" error={err("stakeLevelId")} hint={stakesForAccount.length ? undefined : `No saved ${currency} stakes — enter blinds below`}>
              <Select id="stakeLevelId" name="stakeLevelId" value={v.stakeLevelId} onChange={(e) => pickStake(e.target.value)}>
                <option value="">Custom</option>
                {stakesForAccount.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Table format" htmlFor="tableFormat">
              <Select id="tableFormat" name="tableFormat" value={v.tableFormat} onChange={set("tableFormat")}>
                {Object.entries(TABLE_FORMAT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
              <Field label="Small blind" htmlFor="smallBlind" error={err("smallBlind")}>
                <MoneyInput id="smallBlind" name="smallBlind" value={v.smallBlind} onChange={set("smallBlind")} />
              </Field>
              <Field label="Big blind" htmlFor="bigBlind" error={err("bigBlind")}>
                <MoneyInput id="bigBlind" name="bigBlind" value={v.bigBlind} onChange={set("bigBlind")} />
              </Field>
              <Field label="Straddle" htmlFor="straddle" error={err("straddle")}>
                <MoneyInput id="straddle" name="straddle" value={v.straddle} onChange={set("straddle")} />
              </Field>
              <Field label="Ante" htmlFor="ante" error={err("ante")}>
                <MoneyInput id="ante" name="ante" value={v.ante} onChange={set("ante")} />
              </Field>
            </div>
            <Field label="Seats" htmlFor="seats" error={err("seats")}>
              <Input id="seats" name="seats" type="number" inputMode="numeric" min={2} max={12} value={v.seats} onChange={set("seats")} />
            </Field>
            <Field label="Hands played" htmlFor="handsPlayed" error={err("handsPlayed")} hint="Needed for bb/100 — leave blank if unknown">
              <Input id="handsPlayed" name="handsPlayed" type="number" inputMode="numeric" min={0} value={v.handsPlayed} onChange={set("handsPlayed")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Money ({currency})</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Buy-in" htmlFor="buyIn" error={err("buyIn")} required>
                <MoneyInput id="buyIn" name="buyIn" value={v.buyIn} onChange={set("buyIn")} aria-invalid={!!err("buyIn")} />
              </Field>
              <Field label="Rebuys" htmlFor="rebuys" error={err("rebuys")}>
                <MoneyInput id="rebuys" name="rebuys" value={v.rebuys} onChange={set("rebuys")} />
              </Field>
              <Field label="Add-ons / top-ups" htmlFor="additional" error={err("additional")}>
                <MoneyInput id="additional" name="additional" value={v.additional} onChange={set("additional")} />
              </Field>
              <Field label="Cash-out" htmlFor="cashOut" error={err("cashOut")} required={v.status === "completed"}>
                <MoneyInput id="cashOut" name="cashOut" value={v.cashOut} onChange={set("cashOut")} aria-invalid={!!err("cashOut")} />
              </Field>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/50 p-3">
              <p className="mb-3 flex items-center gap-1.5 text-xs text-fg-muted">
                Charges &amp; extras
                <InfoTip content="Rake is taken from pots and is already reflected in your cash-out, so it is recorded for analysis only. Tips and fees entered here are paid separately (not from your chips) and are deducted. Bonuses and rakeback earned at this session are added." />
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Field label="Rake (info)" htmlFor="rake" error={err("rake")}>
                  <MoneyInput id="rake" name="rake" value={v.rake} onChange={set("rake")} />
                </Field>
                <Field label="Tips paid" htmlFor="tips" error={err("tips")}>
                  <MoneyInput id="tips" name="tips" value={v.tips} onChange={set("tips")} />
                </Field>
                <Field label="Fees paid" htmlFor="fees" error={err("fees")}>
                  <MoneyInput id="fees" name="fees" value={v.fees} onChange={set("fees")} />
                </Field>
                <Field label="Bonus" htmlFor="bonus" error={err("bonus")}>
                  <MoneyInput id="bonus" name="bonus" value={v.bonus} onChange={set("bonus")} />
                </Field>
                <Field label="Rakeback" htmlFor="rakeback" error={err("rakeback")}>
                  <MoneyInput id="rakeback" name="rakeback" value={v.rakeback} onChange={set("rakeback")} />
                </Field>
              </div>
              <p className="mt-3 text-xs text-fg-subtle">Travel, food and other costs go in Expenses, linked to this session, so they are never deducted twice.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. tilt, great game, WSOP">
              <Input id="tags" name="tags" value={v.tags} onChange={set("tags")} />
            </Field>
            <Field label="Notes" htmlFor="notes" error={err("notes")}>
              <Textarea id="notes" name="notes" value={v.notes} onChange={set("notes")} rows={4} maxLength={8000} />
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
                <Row label="Total invested" value={money(preview.invested, currency)} />
                <Row label="Duration" value={duration(preview.minutes)} />
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-fg-muted">Net result</p>
                  <p className={cn("num mt-1 text-2xl font-semibold", preview.net === null ? "text-fg-subtle" : preview.net > 0 ? "text-positive" : preview.net < 0 ? "text-negative" : "")}>
                    {preview.net === null ? "Enter cash-out" : money(preview.net, currency, { signed: true })}
                  </p>
                  {preview.net !== null && preview.minutes ? (
                    <p className="num mt-1 text-xs text-fg-muted">{money(Math.round((preview.net * 60) / preview.minutes), currency, { signed: true })} / hour</p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-negative">Check the amounts — one is not a valid number.</p>
            )}
            <FormError state={state} />
            <SubmitButton className="w-full" size="lg" pendingText="Saving…">
              {v.id ? "Save changes" : v.status === "draft" ? "Save draft" : "Save session"}
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
