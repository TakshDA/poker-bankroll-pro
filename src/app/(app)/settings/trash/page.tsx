import { ArchiveRestore, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms";
import { listTrash } from "@/lib/data/money-records";
import { dateLabel } from "@/lib/format";
import { readAsUser, getWorkspace } from "@/lib/server/workspace";
import { purgeAction, restoreAction } from "./actions";

export const metadata = { title: "Trash" };

const KIND: Record<string, string> = { sessions: "Cash session", tournaments: "Tournament", transactions: "Transaction", transfers: "Transfer", expenses: "Expense" };

export default async function TrashPage() {
  const ws = await getWorkspace();
  const items = await readAsUser((tx) => listTrash(tx, ws.settings.timezone));
  return (
    <>
      <PageHeader
        title="Trash"
        description="Deleted records are kept here and excluded from every balance and statistic. Restore one to bring it back exactly as it was, or delete it permanently."
      />
      {items.length === 0 ? (
        <EmptyState icon={<Trash2 />} title="Trash is empty" description="Records you delete will appear here so you can restore them." />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH className="pl-5">Record</TH>
                <TH className="hidden sm:table-cell">Date</TH>
                <TH className="text-right">Effect</TH>
                <TH className="hidden md:table-cell">Deleted</TH>
                <TH className="pr-3" />
              </tr>
            </THead>
            <TBody>
              {items.map((it) => (
                <TR key={`${it.table}-${it.id}`}>
                  <TD className="pl-5">
                    <div className="flex items-center gap-2">
                      <Badge tone="outline">{KIND[it.table]}</Badge>
                      <span className="truncate font-medium">{it.label}</span>
                    </div>
                    {it.detail ? <p className="mt-0.5 max-w-80 truncate text-xs text-fg-muted">{it.detail}</p> : null}
                    <p className="text-xs text-fg-subtle sm:hidden">{dateLabel(it.date)}</p>
                  </TD>
                  <TD className="hidden whitespace-nowrap text-fg-muted sm:table-cell">{dateLabel(it.date)}</TD>
                  <TD className="whitespace-nowrap text-right">
                    {it.amountMinor !== null && it.currency ? <Money amount={it.amountMinor} currency={it.currency} signed colored={it.table !== "transfers"} /> : <span className="text-fg-subtle">—</span>}
                  </TD>
                  <TD className="hidden whitespace-nowrap text-xs text-fg-muted md:table-cell">{dateLabel(it.deletedAt.slice(0, 10))}</TD>
                  <TD className="whitespace-nowrap pr-3 text-right">
                    <ConfirmAction action={restoreAction.bind(null, it.table)} id={it.id} title="Restore this record?" description="Balances and statistics will include it again." confirmLabel="Restore" variant="primary">
                      <ArchiveRestore /> Restore
                    </ConfirmAction>
                    <ConfirmAction action={purgeAction.bind(null, it.table)} id={it.id} title="Delete permanently?" description="This cannot be undone. Attached files are deleted too. The change history in the audit log is kept." confirmLabel="Delete permanently" triggerSize="icon">
                      <Trash2 aria-label="Delete permanently" />
                    </ConfirmAction>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
