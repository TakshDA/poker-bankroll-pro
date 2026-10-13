"use client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { ConfirmAction, errorsFor, FormError, SubmitButton, useActionToast, useFormAction } from "@/components/forms";
import { Field, Input, Select } from "@/components/ui/input";
import { deleteRateAction, saveRateAction } from "../actions";

export interface RateDefaults {
  baseCurrency: string;
  quoteCurrency: string;
  effectiveDate: string;
}

function RateForm({ defaults, currencies, onDone }: { defaults: RateDefaults; currencies: string[]; onDone: () => void }) {
  const [state, onSubmit, pending] = useFormAction(saveRateAction);
  const [from, setFrom] = useState(defaults.baseCurrency);
  const [to, setTo] = useState(defaults.quoteCurrency);
  const [rate, setRate] = useState("");
  useActionToast(state, { onSuccess: onDone });
  const err = (f: string) => errorsFor(state, f);
  const n = Number(rate);
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="From" htmlFor="rt-base" error={err("baseCurrency")}>
        <Select id="rt-base" name="baseCurrency" value={from} onChange={(e) => setFrom(e.target.value)}>
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="To" htmlFor="rt-quote" error={err("quoteCurrency")}>
        <Select id="rt-quote" name="quoteCurrency" value={to} onChange={(e) => setTo(e.target.value)}>
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label={`1 ${from} equals how many ${to}?`} htmlFor="rt-rate" error={err("rate")} required hint={n > 0 ? `So 1 ${to} = ${(1 / n).toFixed(6).replace(/0+$/, "")} ${from}` : "Up to 10 decimal places"}>
        <Input id="rt-rate" name="rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.trim())} placeholder="e.g. 1.365" required />
      </Field>
      <Field label="Effective from" htmlFor="rt-date" error={err("effectiveDate")} required hint="Used for records on or after this date">
        <Input id="rt-date" name="effectiveDate" type="date" defaultValue={defaults.effectiveDate} required />
      </Field>
      <Field label="Source" htmlFor="rt-source" error={err("source")} className="sm:col-span-2">
        <Input id="rt-source" name="source" maxLength={120} placeholder="e.g. Bank of Canada, PokerStars cashier (optional)" />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError state={state} />
        <SubmitButton pending={pending}>Save rate</SubmitButton>
      </div>
    </form>
  );
}

export function AddRateDialog({ defaults, currencies, label = "Add rate", variant = "primary" }: { defaults: RateDefaults; currencies: string[]; label?: string; variant?: "primary" | "secondary" }) {
  return (
    <FormDialog title="Exchange rate" description="If a rate already exists for this pair and date, it is replaced." trigger={<><Plus /> {label}</>} triggerVariant={variant} triggerSize={variant === "secondary" ? "sm" : "md"}>
      {(close) => <RateForm defaults={defaults} currencies={currencies} onDone={close} />}
    </FormDialog>
  );
}

export function DeleteRateButton({ id, label }: { id: string; label: string }) {
  return (
    <ConfirmAction action={deleteRateAction} id={id} title="Delete this rate?" description="Totals that used it will use the nearest other rate for the pair, or leave those amounts out." confirmLabel="Delete" triggerSize="icon">
      <Trash2 aria-label={`Delete rate ${label}`} />
    </ConfirmAction>
  );
}
