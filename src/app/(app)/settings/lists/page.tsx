import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { minorUnits } from "@/lib/finance/currency";
import { minorToDecimal } from "@/lib/finance/money";
import { isListKind, LISTS, listUsage, type ListKind } from "@/lib/data/settings";
import { sp } from "@/lib/server/search-params";
import { getWorkspace, readAsUser } from "@/lib/server/workspace";
import { cn } from "@/lib/utils";
import { AddItemDialog, ItemActions, type ItemValues } from "./list-forms";
import { BETTING, EXPENSE_KINDS, LIST_META, VENUE_KINDS } from "./list-meta";

export const metadata = { title: "Venues, sites, games & stakes" };

interface Row {
  id: string;
  name: string;
  detail: string;
  archived: boolean;
  values: ItemValues;
}

export default async function ListsPage({ searchParams }: PageProps<"/settings/lists">) {
  const params = sp(await searchParams);
  const kind: ListKind = params.tab && isListKind(params.tab) ? params.tab : "venues";
  const [ws, usage] = await Promise.all([getWorkspace(), readAsUser(listUsage)]);
  const base = ws.settings.baseCurrency;
  const currencies = Array.from(new Set([base, ...ws.settings.enabledCurrencies.map((c) => c.trim())]));
  const dec = (m: number | null, cur: string) => (m === null ? "" : minorToDecimal(m, minorUnits(cur)));
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

  const rows: Row[] =
    kind === "venues"
      ? ws.venues.map((v) => ({ id: v.id, name: v.name, detail: join(VENUE_KINDS[v.kind], v.city, v.region, v.country), archived: !!v.archivedAt, values: { id: v.id, name: v.name, kind: v.kind, city: v.city ?? "", region: v.region ?? "", country: v.country ?? "", notes: v.notes ?? "" } }))
      : kind === "platforms"
        ? ws.platforms.map((p) => ({ id: p.id, name: p.name, detail: p.website ?? "", archived: !!p.archivedAt, values: { id: p.id, name: p.name, website: p.website ?? "", notes: p.notes ?? "" } }))
        : kind === "game_types"
          ? ws.gameTypes.map((g) => ({ id: g.id, name: g.name, detail: join(g.shortName, BETTING[g.bettingStructure]), archived: !!g.archivedAt, values: { id: g.id, name: g.name, shortName: g.shortName ?? "", bettingStructure: g.bettingStructure } }))
          : kind === "stake_levels"
            ? ws.stakeLevels.map((s) => {
                const cur = s.currency.trim();
                return {
                  id: s.id,
                  name: s.label,
                  detail: join(`${dec(s.smallBlindMinor, cur)}/${dec(s.bigBlindMinor, cur)} ${cur}`, s.straddleMinor ? `straddle ${dec(s.straddleMinor, cur)}` : null, s.anteMinor ? `ante ${dec(s.anteMinor, cur)}` : null),
                  archived: !!s.archivedAt,
                  values: { id: s.id, label: s.label, currency: cur, smallBlind: dec(s.smallBlindMinor, cur), bigBlind: dec(s.bigBlindMinor, cur), straddle: dec(s.straddleMinor, cur), ante: dec(s.anteMinor, cur) },
                };
              })
            : ws.expenseCategories.map((c) => ({ id: c.id, name: c.name, detail: EXPENSE_KINDS[c.kind] ?? c.kind, archived: !!c.archivedAt, values: { id: c.id, name: c.name, kind: c.kind } }));
  // Active first, then archived; each alphabetical (stakes keep blind order).
  rows.sort((a, b) => Number(a.archived) - Number(b.archived));
  const defaults: ItemValues = kind === "stake_levels" ? { currency: base } : {};

  return (
    <>
      <PageHeader title="Venues, sites, games & stakes" description="The choices in your forms. Archiving hides one from new records but keeps it on old ones. Only unused items can be deleted." actions={<AddItemDialog key={kind} kind={kind} defaults={defaults} currencies={currencies} />} />
      <nav aria-label="Lists" className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {LISTS.map((k) => (
          <Link key={k} href={`/settings/lists?tab=${k}`} aria-current={k === kind ? "page" : undefined} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", k === kind ? "bg-surface-3 font-medium text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
            {LIST_META[k].label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={<ListChecks />} title={`No ${LIST_META[kind].label.toLowerCase()} yet`} description={`${LIST_META[kind].empty} They are also added automatically when you type a new one while logging.`} />
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH className="pl-5">Name</TH>
                <TH className="hidden text-right sm:table-cell">Used by</TH>
                <TH className="pr-3" />
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const used = usage[r.id] ?? 0;
                return (
                  <TR key={r.id} className={r.archived ? "opacity-70" : undefined}>
                    <TD className="max-w-0 pl-5 sm:max-w-none">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        {r.archived ? <Badge tone="outline">Archived</Badge> : null}
                      </div>
                      {r.detail ? <p className="truncate text-xs text-fg-muted">{r.detail}</p> : null}
                      <p className="text-xs text-fg-subtle sm:hidden">{used ? `${used} record${used === 1 ? "" : "s"}` : "Not used"}</p>
                    </TD>
                    <TD className="num hidden text-right text-fg-muted sm:table-cell">{used || "—"}</TD>
                    <TD className="w-0 pr-3">
                      <ItemActions kind={kind} values={r.values} currencies={currencies} name={r.name} archived={r.archived} used={used} />
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
