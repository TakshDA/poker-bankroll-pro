"use client";
import { ArrowLeftRight, Pencil, Plus, Wallet } from "lucide-react";
import { FormDialog } from "@/components/form-dialog";
import { AccountForm, TransactionForm, TransferForm, type AccountOption } from "./forms";

export function NewAccountDialog({ currencies, categories, today, defaultCurrency }: { currencies: string[]; categories: { id: string; name: string }[]; today: string; defaultCurrency: string }) {
  return (
    <FormDialog title="New bankroll account" trigger={<><Plus /> Account</>} triggerVariant="secondary" openParam={{ key: "new", value: "account" }} wide>
      {(close) => (
        <AccountForm
          currencies={currencies}
          categories={categories}
          onDone={close}
          values={{ name: "", currency: defaultCurrency, categoryId: "", openingBalance: "0", openingDate: today, minBalance: "", goalBalance: "", notes: "" }}
        />
      )}
    </FormDialog>
  );
}

export function EditAccountDialog(props: { currencies: string[]; categories: { id: string; name: string }[]; locked: boolean; values: Parameters<typeof AccountForm>[0]["values"] }) {
  return (
    <FormDialog title="Edit account" trigger={<><Pencil /> Edit</>} triggerVariant="secondary" triggerSize="sm" wide>
      {(close) => <AccountForm {...props} onDone={close} />}
    </FormDialog>
  );
}

export function NewTransactionDialog({ accounts, today, accountId }: { accounts: AccountOption[]; today: string; accountId?: string }) {
  if (!accounts.length) return null;
  return (
    <FormDialog title="Deposit, withdrawal or bonus" trigger={<><Wallet /> Transaction</>} triggerVariant="secondary" openParam={{ key: "new", value: "transaction" }}>
      {(close) => (
        <TransactionForm accounts={accounts} onDone={close} values={{ accountId: accountId ?? accounts[0].id, type: "deposit", amount: "", occurredOn: today, description: "", reference: "" }} />
      )}
    </FormDialog>
  );
}

export function NewTransferDialog({ accounts, today, fromId }: { accounts: AccountOption[]; today: string; fromId?: string }) {
  if (accounts.length < 2) return null;
  const from = fromId ?? accounts[0].id;
  return (
    <FormDialog title="Transfer between accounts" trigger={<><ArrowLeftRight /> Transfer</>} triggerVariant="secondary" openParam={{ key: "new", value: "transfer" }}>
      {(close) => (
        <TransferForm
          accounts={accounts}
          onDone={close}
          values={{ fromAccountId: from, toAccountId: accounts.find((a) => a.id !== from)!.id, fromAmount: "", toAmount: "", occurredOn: today, description: "" }}
        />
      )}
    </FormDialog>
  );
}

export function EditTransactionDialog({ accounts, values }: { accounts: AccountOption[]; values: Parameters<typeof TransactionForm>[0]["values"] }) {
  return (
    <FormDialog title="Edit transaction" trigger={<Pencil />} triggerVariant="ghost" triggerSize="icon">
      {(close) => <TransactionForm accounts={accounts} values={values} onDone={close} />}
    </FormDialog>
  );
}

export function EditTransferDialog({ accounts, values }: { accounts: AccountOption[]; values: Parameters<typeof TransferForm>[0]["values"] }) {
  return (
    <FormDialog title="Edit transfer" trigger={<Pencil />} triggerVariant="ghost" triggerSize="icon">
      {(close) => <TransferForm accounts={accounts} values={values} onDone={close} />}
    </FormDialog>
  );
}
