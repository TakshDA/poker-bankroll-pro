"use client";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/form-dialog";
import { ConfirmAction, errorsFor, FormError, SubmitButton, useActionToast, useFormAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import type { ActionState } from "@/lib/validation/common";
import { KIND_INFO, MONEY, PERIOD_LABELS, WITH_PERIOD } from "./goal-meta";
import { deleteGoalAction, pauseGoalAction, resumeGoalAction, saveAlertRulesAction, saveGoalAction } from "./actions";

export interface GoalValues {
  id?: string;
  name: string;
  kind: string;
  period: string;
  target: string;
  targetHours: string;
  targetCount: string;
  currency: string;
  accountId: string;
  startDate: string;
  endDate: string;
  notes: string;
}
export interface GoalOptions {
  currencies: string[];
  accounts: { id: string; name: string; currency: string }[];
}

function GoalForm({ values, options, onDone }: { values: GoalValues; options: GoalOptions; onDone: () => void }) {
  const [state, onSubmit, pending] = useFormAction(saveGoalAction);
  const [v, setV] = useState(values);
  const set = (k: keyof GoalValues) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  useActionToast(state, { onSuccess: onDone });
  const err = (f: string) => errorsFor(state, f);
  const account = options.accounts.find((a) => a.id === v.accountId);
  const currency = v.kind === "min_bankroll" && account ? account.currency : v.currency;
  const info = KIND_INFO[v.kind];
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <Field label="Type" htmlFor="gl-kind" hint={info?.help} className="sm:col-span-2">
        <Select id="gl-kind" name="kind" value={v.kind} onChange={set("kind")}>
          <optgroup label="Limits (responsible play)">
            {Object.entries(KIND_INFO)
              .filter(([, i]) => i.limit)
              .map(([k, i]) => (
                <option key={k} value={k}>
                  {i.label}
                </option>
              ))}
          </optgroup>
          <optgroup label="Goals">
            {Object.entries(KIND_INFO)
              .filter(([, i]) => !i.limit)
              .map(([k, i]) => (
                <option key={k} value={k}>
                  {i.label}
                </option>
              ))}
          </optgroup>
        </Select>
      </Field>
      <Field label="Name" htmlFor="gl-name" error={err("name")} required className="sm:col-span-2">
        <Input id="gl-name" name="name" value={v.name} onChange={set("name")} maxLength={120} required placeholder={info?.label} />
      </Field>
      {WITH_PERIOD.includes(v.kind) ? (
        <Field label="Period" htmlFor="gl-period" error={err("period")}>
          <Select id="gl-period" name="period" value={v.period} onChange={set("period")}>
            {["weekly", "monthly", "yearly", "custom"].map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="period" value={v.kind === "daily_loss_limit" ? "daily" : "per_session"} />
      )}
      {v.kind === "min_bankroll" ? (
        <Field label="Applies to" htmlFor="gl-account" error={err("accountId")} hint={account ? `Amount in ${account.currency}` : "All accounts combined, in your base currency"}>
          <Select id="gl-account" name="accountId" value={v.accountId} onChange={set("accountId")}>
            <option value="">All accounts</option>
            {options.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {MONEY.includes(v.kind) ? (
        <>
          <Field label={info?.limit ? "Limit" : "Target"} htmlFor="gl-target" error={err("target")} required>
            <MoneyInput id="gl-target" name="target" currency={currency} value={v.target} onChange={set("target")} required placeholder="0.00" />
          </Field>
          {v.kind === "min_bankroll" && account ? null : (
            <Field label="Currency" htmlFor="gl-currency" error={err("currency")}>
              <Select id="gl-currency" name="currency" value={v.currency} onChange={set("currency")}>
                {options.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </>
      ) : v.kind === "hours" ? (
        <Field label="Hours" htmlFor="gl-hours" error={err("targetHours")} required>
          <Input id="gl-hours" name="targetHours" inputMode="decimal" value={v.targetHours} onChange={set("targetHours")} required placeholder="e.g. 40" />
        </Field>
      ) : (
        <Field label="Sessions" htmlFor="gl-count" error={err("targetCount")} required>
          <Input id="gl-count" name="targetCount" inputMode="numeric" value={v.targetCount} onChange={set("targetCount")} required placeholder="e.g. 12" />
        </Field>
      )}
      {WITH_PERIOD.includes(v.kind) && v.period === "custom" ? (
        <>
          <Field label="From" htmlFor="gl-start" error={err("startDate")} required>
            <Input id="gl-start" name="startDate" type="date" value={v.startDate} onChange={set("startDate")} required />
          </Field>
          <Field label="To" htmlFor="gl-end" error={err("endDate")} required>
            <Input id="gl-end" name="endDate" type="date" value={v.endDate} onChange={set("endDate")} required />
          </Field>
        </>
      ) : null}
      <Field label="Notes" htmlFor="gl-notes" error={err("notes")} className="sm:col-span-2">
        <Textarea id="gl-notes" name="notes" value={v.notes} onChange={set("notes")} rows={2} maxLength={2000} placeholder="Why this matters to you (optional)" />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError state={state} />
        <SubmitButton pending={pending}>{v.id ? "Save" : "Add"}</SubmitButton>
      </div>
    </form>
  );
}

export function NewGoalDialog({ values, options, label = "Add goal or limit", variant = "primary" }: { values: GoalValues; options: GoalOptions; label?: string; variant?: "primary" | "secondary" }) {
  return (
    <FormDialog title="Add a goal or limit" trigger={<><Plus /> {label}</>} triggerVariant={variant} openParam={variant === "primary" ? { key: "new", value: "1" } : undefined} wide>
      {(close) => <GoalForm values={values} options={options} onDone={close} />}
    </FormDialog>
  );
}

export function EditGoalDialog({ values, options }: { values: GoalValues; options: GoalOptions }) {
  return (
    <FormDialog title="Edit" trigger={<Pencil aria-label={`Edit ${values.name}`} />} triggerVariant="ghost" triggerSize="icon" wide>
      {(close) => <GoalForm values={values} options={options} onDone={close} />}
    </FormDialog>
  );
}

function Act({ action, id, label, children }: { action: (id: string) => Promise<ActionState>; id: string; label: string; children: React.ReactNode }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await action(id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message ?? "Could not update");
        })
      }
    >
      {children}
    </Button>
  );
}

export function GoalButtons({ id, name, active }: { id: string; name: string; active: boolean }) {
  return (
    <>
      {active ? (
        <Act action={pauseGoalAction} id={id} label={`Pause ${name}`}>
          <Pause />
        </Act>
      ) : (
        <Act action={resumeGoalAction} id={id} label={`Resume ${name}`}>
          <Play />
        </Act>
      )}
      <ConfirmAction action={deleteGoalAction} id={id} title={`Delete "${name}"?`} confirmLabel="Delete" triggerSize="icon">
        <Trash2 aria-label={`Delete ${name}`} />
      </ConfirmAction>
    </>
  );
}

export function AlertRulesForm({ values }: { values: { cashBuyInsRequired: number; cashBuyInBigBlinds: number; tournamentBuyInsRequired: number; cooldownMinutes: number } }) {
  const [state, onSubmit, pending] = useFormAction(saveAlertRulesAction);
  useActionToast(state);
  const err = (f: string) => errorsFor(state, f);
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Cash buy-ins to keep" htmlFor="ar-cash" error={err("cashBuyInsRequired")} hint="Warn when an account holds fewer buy-ins for your latest stake">
        <Input id="ar-cash" name="cashBuyInsRequired" inputMode="numeric" defaultValue={values.cashBuyInsRequired} required />
      </Field>
      <Field label="Big blinds per buy-in" htmlFor="ar-bb" error={err("cashBuyInBigBlinds")} hint="100 = a standard full buy-in">
        <Input id="ar-bb" name="cashBuyInBigBlinds" inputMode="numeric" defaultValue={values.cashBuyInBigBlinds} required />
      </Field>
      <Field label="Tournament buy-ins to keep" htmlFor="ar-mtt" error={err("tournamentBuyInsRequired")} hint="Compared with your recent average buy-in">
        <Input id="ar-mtt" name="tournamentBuyInsRequired" inputMode="numeric" defaultValue={values.tournamentBuyInsRequired} required />
      </Field>
      <Field label="Cooldown after a losing session (minutes)" htmlFor="ar-cool" error={err("cooldownMinutes")} hint="0 = off. Shows a reminder not to jump straight back in">
        <Input id="ar-cool" name="cooldownMinutes" inputMode="numeric" defaultValue={values.cooldownMinutes} required />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2 sm:items-start">
        <FormError state={state} />
        <SubmitButton pending={pending} variant="secondary">
          Save rules
        </SubmitButton>
      </div>
    </form>
  );
}
