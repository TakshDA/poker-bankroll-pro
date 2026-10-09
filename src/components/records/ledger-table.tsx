import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LEDGER_CLASS, labelForKind, type LedgerEntry } from "@/lib/finance/ledger";
import { dateLabel } from "@/lib/format";

export interface LedgerRow extends LedgerEntry {
  accountName: string;
  balanceMinor?: number;
}

const TONE: Record<string, "neutral" | "positive" | "negative" | "gold" | "warning" | "outline"> = {
  capital: "neutral",
  transfer: "outline",
  poker: "positive",
  poker_income: "gold",
  expense: "negative",
  adjustment: "warning",
};

export function hrefFor(e: LedgerEntry): string | null {
  switch (e.sourceType) {
    case "session":
      return `/sessions/${e.sourceId}`;
    case "tournament":
      return `/tournaments/${e.sourceId}`;
    case "expense":
      return `/expenses?q=${e.sourceId}`;
    case "account":
      return `/bankroll/${e.sourceId}`;
    default:
      return null;
  }
}

/** Ledger rows; `showBalance` adds a running balance column (single account). */
export function LedgerTable({ rows, showBalance = false, showAccount = true }: { rows: LedgerRow[]; showBalance?: boolean; showAccount?: boolean }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH className="pl-5">Date</TH>
          <TH>Type</TH>
          <TH>Description</TH>
          {showAccount ? <TH>Account</TH> : null}
          <TH className="text-right">Amount</TH>
          {showBalance ? <TH className="pr-5 text-right">Balance</TH> : null}
        </tr>
      </THead>
      <TBody>
        {rows.map((e) => {
          const href = hrefFor(e);
          return (
            <TR key={e.key}>
              <TD className="pl-5 text-fg-muted">{dateLabel(e.date)}</TD>
              <TD>
                <Badge tone={TONE[LEDGER_CLASS[e.kind]]}>{labelForKind(e.kind)}</Badge>
              </TD>
              <TD className="max-w-72 truncate">
                {href ? (
                  <Link href={href} className="hover:underline">
                    {e.description}
                  </Link>
                ) : (
                  e.description
                )}
              </TD>
              {showAccount ? <TD className="text-fg-muted">{e.accountName}</TD> : null}
              <TD className="text-right">
                <Money amount={e.amountMinor} currency={e.currency} signed colored={LEDGER_CLASS[e.kind] !== "transfer" && LEDGER_CLASS[e.kind] !== "capital"} />
              </TD>
              {showBalance ? (
                <TD className="pr-5 text-right">
                  <Money amount={e.balanceMinor ?? 0} currency={e.currency} colored={false} className="text-fg-muted" />
                </TD>
              ) : null}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
