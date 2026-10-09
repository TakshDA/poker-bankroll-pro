"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import { useFormAction, errorsFor, FormError, SubmitButton, useActionToast } from "@/components/forms";
import { TRANSACTION_LABELS } from "@/lib/format";
import { saveAccountAction, saveTransactionAction, saveTransferAction } from "./actions";

export interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

export function AccountForm({
  values,
  currencies,
  categories,
  locked,
  onDone,
}: {
  values: { id?: string; name: string; currency: string; categoryId: string; openingBalance: string; openingDate: string; minBalance: string; goalBalance: string; notes: string };
  currencies: string[];
  categories: { id: string; name: string }[];
  locked?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [state, onSubmit, pending] = useFormAction(saveAccountAction);
  const [currency, setCurrency] = useState(values.currency);
  useActionToast(state, {
    onSuccess: (s) => {
      onDone?.();
      if (!values.id && s.id) router.push(`/bankroll/${s.id}`);
    },
  });
  const err = (f: string) => errorsFor(state, f);
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="Name" htmlFor="acc-name" error={err("name")} required className="sm:col-span-2">
        <Input id="acc-name" name="name" defaultValue={values.name} placeholder="e.g. Live CAD roll" maxLength={80} required />
      </Field>
      <Field label="Currency" htmlFor="acc-currency" error={err("currency")} hint={locked ? "Locked: records already use this currency" : undefined}>
        {locked ? <input type="hidden" name="currency" value={currency} /> : null}
        <Select id="acc-currency" name={locked ? undefined : "currency"} value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={locked}>
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Category" htmlFor="acc-category" error={err("categoryId")}>
        <Select id="acc-category" name="categoryId" defaultValue={values.categoryId}>
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Opening balance" htmlFor="acc-open" error={err("openingBalance")} hint="Money in the account when you start tracking">
        <MoneyInput id="acc-open" name="openingBalance" currency={currency} defaultValue={values.openingBalance} />
      </Field>
      <Field label="Opening date" htmlFor="acc-open-date" error={err("openingDate")}>
        <Input id="acc-open-date" name="openingDate" type="date" defaultValue={values.openingDate} required />
      </Field>
      <Field label="Minimum balance alert" htmlFor="acc-min" error={err("minBalance")} hint="Warn when the balance drops below this">
        <MoneyInput id="acc-min" name="minBalance" currency={currency} defaultValue={values.minBalance} />
      </Field>
      <Field label="Goal balance" htmlFor="acc-goal" error={err("goalBalance")}>
        <MoneyInput id="acc-goal" name="goalBalance" currency={currency} defaultValue={values.goalBalance} />
      </Field>
      <Field label="Notes" htmlFor="acc-notes" className="sm:col-span-2">
        <Textarea id="acc-notes" name="notes" defaultValue={values.notes} rows={2} />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError state={state} />
        <SubmitButton pending={pending}>{values.id ? "Save account" : "Create account"}</SubmitButton>
      </div>
    </form>
  );
}

export function TransactionForm({
  accounts,
  values,
  onDone,
}: {
  accounts: AccountOption[];
  values: { id?: string; accountId: string; type: string; amount: string; occurredOn: string; description: string; reference: string };
  onDone?: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(saveTransactionAction);
  const [accountId, setAccountId] = useState(values.accountId);
  const [type, setType] = useState(values.type);
  useActionToast(state, { onSuccess: () => onDone?.() });
  const err = (f: string) => errorsFor(state, f);
  const cur = accounts.find((a) => a.id === accountId)?.currency;
  const hints: Record<string, string> = {
    deposit: "Money added to your bankroll. Never counted as poker profit.",
    withdrawal: "Money taken out of your bankroll. Never counted as a poker loss.",
    bonus: "Site or casino bonus not tied to one session. Counts as poker income.",
    rakeback: "Rakeback paid separately (e.g. monthly). Counts as poker income.",
    adjustment: "Correction to reconcile with your real balance. Use a negative amount to reduce. Not profit.",
  };
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="Type" htmlFor="tx-type" error={err("type")} hint={hints[type]} className="sm:col-span-2">
        <Select id="tx-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(TRANSACTION_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Account" htmlFor="tx-account" error={err("accountId")}>
        <Select id="tx-account" name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount" htmlFor="tx-amount" error={err("amount")} required>
        <MoneyInput id="tx-amount" name="amount" currency={cur} defaultValue={values.amount} required />
      </Field>
      <Field label="Date" htmlFor="tx-date" error={err("occurredOn")}>
        <Input id="tx-date" name="occurredOn" type="date" defaultValue={values.occurredOn} required />
      </Field>
      <Field label="Reference" htmlFor="tx-ref" error={err("reference")}>
        <Input id="tx-ref" name="reference" defaultValue={values.reference} maxLength={120} />
      </Field>
      <Field label="Description" htmlFor="tx-desc" error={err("description")} className="sm:col-span-2">
        <Input id="tx-desc" name="description" defaultValue={values.description} maxLength={500} />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError state={state} />
        <SubmitButton pending={pending}>{values.id ? "Save" : "Record"}</SubmitButton>
      </div>
    </form>
  );
}

export function TransferForm({
  accounts,
  values,
  onDone,
}: {
  accounts: AccountOption[];
  values: { id?: string; fromAccountId: string; toAccountId: string; fromAmount: string; toAmount: string; occurredOn: string; description: string };
  onDone?: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(saveTransferAction);
  const [from, setFrom] = useState(values.fromAccountId);
  const [to, setTo] = useState(values.toAccountId);
  useActionToast(state, { onSuccess: () => onDone?.() });
  const err = (f: string) => errorsFor(state, f);
  const fromCur = accounts.find((a) => a.id === from)?.currency;
  const toCur = accounts.find((a) => a.id === to)?.currency;
  const cross = fromCur && toCur && fromCur !== toCur;
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="From" htmlFor="tr-from" error={err("fromAccountId")}>
        <Select id="tr-from" name="fromAccountId" value={from} onChange={(e) => setFrom(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="To" htmlFor="tr-to" error={err("toAccountId")}>
        <Select id="tr-to" name="toAccountId" value={to} onChange={(e) => setTo(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>
      <Field label={cross ? `Amount sent (${fromCur})` : "Amount"} htmlFor="tr-amount" error={err("fromAmount")} required>
        <MoneyInput id="tr-amount" name="fromAmount" currency={fromCur} defaultValue={values.fromAmount} required />
      </Field>
      {cross ? (
        <Field label={`Amount received (${toCur})`} htmlFor="tr-to-amount" error={err("toAmount")} required hint="Record exactly what arrived after conversion">
          <MoneyInput id="tr-to-amount" name="toAmount" currency={toCur} defaultValue={values.toAmount} required />
        </Field>
      ) : null}
      <Field label="Date" htmlFor="tr-date" error={err("occurredOn")}>
        <Input id="tr-date" name="occurredOn" type="date" defaultValue={values.occurredOn} required />
      </Field>
      <Field label="Description" htmlFor="tr-desc" className="sm:col-span-2">
        <Input id="tr-desc" name="description" defaultValue={values.description} maxLength={500} />
      </Field>
      <p className="text-xs text-fg-subtle sm:col-span-2">Transfers move money between your own accounts. They never change your combined bankroll or profit.</p>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError state={state} />
        <SubmitButton pending={pending}>{values.id ? "Save transfer" : "Record transfer"}</SubmitButton>
      </div>
    </form>
  );
}
