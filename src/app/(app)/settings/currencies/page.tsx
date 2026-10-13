import { ArrowLeftRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { todayIn } from "@/lib/finance/dates";
import { RateTable } from "@/lib/finance/fx";
import { listCurrencies } from "@/lib/data/settings";
import { dateLabel } from "@/lib/format";
import { getWorkspace, readAsUser } from "@/lib/server/workspace";
import { AddRateDialog, DeleteRateButton } from "./rate-forms";

export const metadata = { title: "Currencies & exchange rates" };

/** "1.3650000000" -> "1.365" */
const trim = (r: string) => r.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

export default async function CurrenciesPage() {
  const [ws, all] = await Promise.all([getWorkspace(), readAsUser(listCurrencies)]);
  const base = ws.settings.baseCurrency;
  const today = todayIn(ws.settings.timezone);
  const known = new Set(all.map((c) => c.code));
  const enabled = Array.from(new Set([base, ...ws.settings.enabledCurrencies.map((c) => c.trim())])).filter((c) => known.has(c));
  // Currencies that actually hold money (accounts) or are enabled, but cannot be converted to base yet.
  const used = new Set([...ws.dataset.accounts.map((a) => a.currency), ...enabled]);
  const table = new RateTable(ws.rateRows);
  const missing = [...used].filter((c) => c !== base && !table.hasPair(c, base)).sort();
  const pickers = Array.from(new Set([...enabled, ...used])).sort();
  const rows = [...ws.rateRows].sort((a, b) => `${a.baseCurrency}${a.quoteCurrency}`.localeCompare(`${b.baseCurrency}${b.quoteCurrency}`) || b.effectiveDate.localeCompare(a.effectiveDate));

  return (
    <>
      <PageHeader
        title="Currencies & exchange rates"
        description={`Totals are shown in ${base}. Amounts in other currencies are converted with the latest rate on or before each record's date. Records keep their original amounts.`}
        actions={<AddRateDialog defaults={{ baseCurrency: missing[0] ?? (pickers.find((c) => c !== base) ?? base), quoteCurrency: base, effectiveDate: today }} currencies={pickers} />}
      />

      {missing.length ? (
        <Card className="mb-5 border-warning/40">
          <CardHeader className="flex-col gap-1">
            <CardTitle>Rates needed</CardTitle>
            <CardDescription>Without a rate, amounts in these currencies are left out of {base} totals and flagged.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {missing.map((c) => (
              <AddRateDialog key={c} defaults={{ baseCurrency: c, quoteCurrency: base, effectiveDate: today }} currencies={pickers} label={`${c} → ${base}`} variant="secondary" />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight />} title="No exchange rates yet" description={`You only need rates if you play in a currency other than ${base}. Change which currencies you use in Settings.`} />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH className="pl-5">Rate</TH>
                <TH>From</TH>
                <TH className="hidden sm:table-cell">Source</TH>
                <TH className="pr-3" />
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const label = `1 ${r.baseCurrency} = ${trim(r.rate)} ${r.quoteCurrency}`;
                return (
                  <TR key={r.id}>
                    <TD className="num pl-5 font-medium">{label}</TD>
                    <TD className="text-fg-muted">{dateLabel(r.effectiveDate)}</TD>
                    <TD className="hidden max-w-60 truncate text-fg-muted sm:table-cell">{r.source ?? "—"}</TD>
                    <TD className="pr-3 text-right">
                      <DeleteRateButton id={r.id} label={label} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
