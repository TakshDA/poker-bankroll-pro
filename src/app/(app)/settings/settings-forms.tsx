"use client";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { errorsFor, FormError, SubmitButton, useActionToast, useFormAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { changePasswordAction, deleteAccountAction, savePreferencesAction } from "./actions";

export interface PreferenceValues {
  displayName: string;
  baseCurrency: string;
  timezone: string;
  weekStartsOn: number;
  enabledCurrencies: string[];
  defaultAccountId: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function PreferencesForm({
  values,
  currencies,
  timezones,
  accounts,
}: {
  values: PreferenceValues;
  currencies: { code: string; name: string }[];
  timezones: string[];
  accounts: { id: string; name: string; currency: string }[];
}) {
  const [state, onSubmit, pending] = useFormAction(savePreferencesAction);
  const [base, setBase] = useState(values.baseCurrency);
  const [enabled, setEnabled] = useState(new Set(values.enabledCurrencies));
  useActionToast(state);
  const err = (f: string) => errorsFor(state, f);
  const toggle = (code: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Display name" htmlFor="pf-name" error={err("displayName")} hint="Shown on reports and statements">
        <Input id="pf-name" name="displayName" defaultValue={values.displayName} maxLength={80} autoComplete="name" />
      </Field>
      <Field label="Base currency" htmlFor="pf-base" error={err("baseCurrency")} hint="Totals across currencies are shown in this one">
        <Select id="pf-base" name="baseCurrency" value={base} onChange={(e) => setBase(e.target.value)}>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Time zone" htmlFor="pf-tz" error={err("timezone")} hint="Decides which day a late session counts on">
        <Select id="pf-tz" name="timezone" defaultValue={values.timezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Week starts on" htmlFor="pf-week" error={err("weekStartsOn")}>
        <Select id="pf-week" name="weekStartsOn" defaultValue={String(values.weekStartsOn)}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Default account" htmlFor="pf-account" error={err("defaultAccountId")} hint="Pre-selected for new expenses. New sessions reuse the account you last played from." className="sm:col-span-2">
        <Select id="pf-account" name="defaultAccountId" defaultValue={values.defaultAccountId}>
          <option value="">None</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">Currencies you use</legend>
        <p className="mb-2 text-xs text-fg-subtle">These appear in currency pickers. Your base currency is always included.</p>
        <div className="flex flex-wrap gap-2">
          {currencies.map((c) => {
            const on = c.code === base || enabled.has(c.code);
            return (
              <label key={c.code} title={c.name} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] ${on ? "border-gold/60 bg-gold-soft text-fg" : "border-border text-fg-muted"}`}>
                <input type="checkbox" className="sr-only" checked={on} disabled={c.code === base} onChange={() => toggle(c.code)} />
                {on ? <input type="hidden" name="enabledCurrencies[]" value={c.code} /> : null}
                {c.code}
              </label>
            );
          })}
        </div>
        {err("enabledCurrencies") ? <p className="mt-1 text-xs text-negative">{err("enabledCurrencies")?.[0]}</p> : null}
      </fieldset>
      <div className="flex flex-col gap-2 sm:col-span-2 sm:items-start">
        <FormError state={state} />
        <SubmitButton pending={pending}>Save preferences</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, onSubmit, pending] = useFormAction(changePasswordAction);
  const [key, setKey] = useState(0);
  useActionToast(state, { onSuccess: () => setKey((k) => k + 1) });
  const err = (f: string) => errorsFor(state, f);
  return (
    <form key={key} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3">
      <Field label="Current password" htmlFor="pw-current" error={err("current")}>
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="pw-new" error={err("password")} hint="At least 10 characters">
        <Input id="pw-new" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field label="Repeat new password" htmlFor="pw-confirm" error={err("confirm")}>
        <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-3 sm:items-start">
        <FormError state={state} />
        <SubmitButton pending={pending} variant="secondary">
          Change password
        </SubmitButton>
      </div>
    </form>
  );
}

export function DeleteAccountDialog({ email }: { email: string }) {
  const [state, onSubmit, pending] = useFormAction(deleteAccountAction);
  const err = (f: string) => errorsFor(state, f);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 /> Delete my account
        </Button>
      </DialogTrigger>
      <DialogContent title="Delete your account?" description={`This permanently deletes ${email} and every session, tournament, transaction, expense, goal and file in it. It cannot be undone.`}>
        <form onSubmit={onSubmit} className="grid gap-4">
          <p className="text-sm text-fg-muted">Download a backup first from Reports & data if you might want your history later.</p>
          <Field label="Your password" htmlFor="del-password" error={err("password")}>
            <Input id="del-password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="Type DELETE to confirm" htmlFor="del-confirm" error={err("confirmText")}>
            <Input id="del-confirm" name="confirmText" autoComplete="off" required pattern="DELETE" />
          </Field>
          <FormError state={state} />
          <SubmitButton pending={pending} variant="destructive">
            Permanently delete everything
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
