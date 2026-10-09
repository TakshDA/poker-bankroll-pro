"use client";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { useFormAction, errorsFor, FormError, SubmitButton, useActionToast } from "@/components/forms";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { saveExpenseAction } from "./actions";

export interface ExpenseFormOptions {
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
  venues: { id: string; name: string }[];
  /** Recent sessions/tournaments an expense can be linked to. */
  links: { value: string; label: string }[];
}

export interface ExpenseValues {
  id?: string;
  accountId: string;
  categoryId: string;
  amount: string;
  refunded: string;
  occurredOn: string;
  vendor: string;
  description: string;
  link: string; // "session:<id>" | "tournament:<id>" | ""
  venueId: string;
}

export function ExpenseForm({ values, options, onDone }: { values: ExpenseValues; options: ExpenseFormOptions; onDone?: () => void }) {
  const [state, onSubmit, pending] = useFormAction(saveExpenseAction);
  const [accountId, setAccountId] = useState(values.accountId);
  const [link, setLink] = useState(values.link);
  useActionToast(state, { onSuccess: () => onDone?.() });
  const err = (f: string) => errorsFor(state, f);
  const cur = options.accounts.find((a) => a.id === accountId)?.currency;
  const [kind, linkId] = link ? link.split(":") : ["", ""];
  const duplicate = !!err("confirmDuplicate");
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="sessionId" value={kind === "session" ? linkId : ""} />
      <input type="hidden" name="tournamentId" value={kind === "tournament" ? linkId : ""} />
      <Field label="Category" htmlFor="ex-cat" error={err("categoryId")} hint="Rake, tips and table fees belong on the session itself, so they are never deducted twice.">
        <Select id="ex-cat" name="categoryId" defaultValue={values.categoryId} required>
          {options.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Paid from account" htmlFor="ex-acc" error={err("accountId")}>
        <Select id="ex-acc" name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {options.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount" htmlFor="ex-amount" error={err("amount")} required>
        <MoneyInput id="ex-amount" name="amount" currency={cur} defaultValue={values.amount} required />
      </Field>
      <Field label="Refunded" htmlFor="ex-refund" error={err("refunded")} hint="Any part you got back (reimbursement, refund)">
        <MoneyInput id="ex-refund" name="refunded" currency={cur} defaultValue={values.refunded} />
      </Field>
      <Field label="Date" htmlFor="ex-date" error={err("occurredOn")}>
        <Input id="ex-date" name="occurredOn" type="date" defaultValue={values.occurredOn} required />
      </Field>
      <Field label="Vendor" htmlFor="ex-vendor" error={err("vendor")}>
        <Input id="ex-vendor" name="vendor" defaultValue={values.vendor} maxLength={120} placeholder="e.g. Air Canada" />
      </Field>
      <Field label="Linked session or tournament" htmlFor="ex-link" error={err("sessionId") ?? err("tournamentId")}>
        <Select id="ex-link" value={link} onChange={(e) => setLink(e.target.value)}>
          <option value="">Not linked</option>
          {options.links.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Venue" htmlFor="ex-venue" error={err("venueId")}>
        <Select id="ex-venue" name="venueId" defaultValue={values.venueId}>
          <option value="">—</option>
          {options.venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Description" htmlFor="ex-desc" error={err("description")} className="sm:col-span-2">
        <Textarea id="ex-desc" name="description" defaultValue={values.description} rows={2} maxLength={500} />
      </Field>
      {duplicate ? (
        <label className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm sm:col-span-2">
          <input type="checkbox" name="confirmDuplicate" className="mt-0.5 accent-gold" />
          <span>This is not a duplicate. Save it as a separate expense.</span>
        </label>
      ) : null}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError state={state} />
        <SubmitButton pending={pending}>{values.id ? "Save expense" : "Record expense"}</SubmitButton>
      </div>
    </form>
  );
}

export function NewExpenseDialog({ values, options }: { values: ExpenseValues; options: ExpenseFormOptions }) {
  if (!options.accounts.length) return null;
  return (
    <FormDialog title="Record an expense" trigger={<><Plus /> Expense</>} openParam={{ key: "new", value: "1" }} wide>
      {(close) => <ExpenseForm values={values} options={options} onDone={close} />}
    </FormDialog>
  );
}

export function EditExpenseDialog({ values, options }: { values: ExpenseValues; options: ExpenseFormOptions }) {
  return (
    <FormDialog title="Edit expense" trigger={<Pencil />} triggerVariant="ghost" triggerSize="icon" wide>
      {(close) => <ExpenseForm values={values} options={options} onDone={close} />}
    </FormDialog>
  );
}
