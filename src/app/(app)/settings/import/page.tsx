import { History, Undo2 } from "lucide-react";
import { ConfirmAction } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { listImports } from "@/lib/data/imports";
import { dateLabel, timeLabel } from "@/lib/format";
import { ENTITY_LABELS } from "@/lib/import/spec";
import { localDate } from "@/lib/finance/dates";
import { getWorkspace, readAsUser } from "@/lib/server/workspace";
import { undoImportAction } from "./actions";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import from CSV" };

export default async function ImportPage() {
  const [ws, history] = await Promise.all([getWorkspace(), readAsUser(listImports)]);
  const accounts = ws.dataset.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
  const defaultAccount = ws.settings.defaultAccountId && accounts.some((a) => a.id === ws.settings.defaultAccountId) ? ws.settings.defaultAccountId : (accounts[0]?.id ?? "");
  const tz = ws.settings.timezone;
  return (
    <>
      <PageHeader title="Import from CSV" description="Bring in history from a spreadsheet or another tracker. You can check every row before anything is saved, and undo an import later." />
      {accounts.length === 0 ? (
        <EmptyState title="Add an account first" description="Imported records need a bankroll account to belong to. Create one on the Bankroll page, then come back." />
      ) : (
        <ImportWizard accounts={accounts} categories={ws.expenseCategories.filter((c) => !c.archivedAt).map((c) => ({ id: c.id, name: c.name }))} defaultAccountId={defaultAccount} />
      )}

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Import history</CardTitle>
        </CardHeader>
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-fg-muted">
            <History className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
            Nothing imported yet.
          </p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="pl-5">File</TH>
                <TH className="hidden sm:table-cell">When</TH>
                <TH className="text-right">Imported</TH>
                <TH className="hidden text-right md:table-cell">Skipped</TH>
                <TH className="pr-3" />
              </tr>
            </THead>
            <TBody>
              {history.map((b) => (
                <TR key={b.id} className={b.undoneAt ? "opacity-70" : undefined}>
                  <TD className="max-w-0 pl-5 sm:max-w-none">
                    <span className="block truncate font-medium">{b.fileName}</span>
                    <span className="block text-xs text-fg-muted">
                      {ENTITY_LABELS[b.entity]}
                      <span className="sm:hidden"> · {dateLabel(localDate(new Date(b.createdAt).toISOString(), tz))}</span>
                    </span>
                  </TD>
                  <TD className="hidden text-fg-muted sm:table-cell">
                    {dateLabel(localDate(new Date(b.createdAt).toISOString(), tz))} {timeLabel(new Date(b.createdAt).toISOString(), tz)}
                  </TD>
                  <TD className="num text-right">{b.importedRows}</TD>
                  <TD className="num hidden text-right text-fg-muted md:table-cell">{b.duplicateRows + b.errorRows || "—"}</TD>
                  <TD className="w-0 pr-3 text-right">
                    {b.undoneAt ? (
                      <Badge tone="outline">Undone</Badge>
                    ) : (
                      <ConfirmAction action={undoImportAction} id={b.id} title={`Undo "${b.fileName}"?`} description={`Permanently removes the ${b.importedRows} record${b.importedRows === 1 ? "" : "s"} this import created, including any edits made to them since. Everything else is untouched.`} confirmLabel="Undo import">
                        <Undo2 /> Undo
                      </ConfirmAction>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
