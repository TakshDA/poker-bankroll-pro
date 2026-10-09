import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exportBackup } from "@/lib/data/backup";
import { loadWorkspace } from "@/lib/data/workspace";
import { allTables, tableFor, tableToJson, TOTAL_KEY } from "@/lib/export";
import { toCsv } from "@/lib/export/csv";
import { toPdf } from "@/lib/export/pdf";
import { ENTITIES, type Entity, type ExportFilter } from "@/lib/export/tables";
import { toXlsx } from "@/lib/export/xlsx";
import { todayIn } from "@/lib/finance/dates";
import { createContext } from "@/lib/finance/metrics";
import { isUuid, withUser } from "@/lib/server/db";
import { validDate } from "@/lib/server/search-params";

const FORMATS = ["csv", "xlsx", "pdf", "json"] as const;
type Format = (typeof FORMATS)[number];
const TYPES: Record<Format, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  json: "application/json; charset=utf-8",
};

/**
 * Download exports. `entity` is one of ENTITIES, "all" (workbook / JSON of
 * every table) or "backup" (raw JSON backup). Optional from/to/account filters
 * apply to dated records. Every query runs as the signed-in user under RLS.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  const url = new URL(req.url);
  const entity = url.searchParams.get("entity") ?? "";
  const format = (url.searchParams.get("format") ?? "csv") as Format;
  if (!FORMATS.includes(format)) return new NextResponse("Unknown format", { status: 400 });
  const account = url.searchParams.get("account");
  const filter: ExportFilter = {
    from: validDate(url.searchParams.get("from") ?? undefined),
    to: validDate(url.searchParams.get("to") ?? undefined),
    accountId: account && isUuid(account) ? account : null,
  };

  if (entity === "backup") {
    if (format !== "json") return new NextResponse("Backups are JSON only", { status: 400 });
    const backup = await withUser(user.id, exportBackup);
    return file(JSON.stringify(backup, null, 2), "json", `poker-bankroll-backup-${backup.exportedAt.slice(0, 10)}`);
  }

  const ws = await withUser(user.id, loadWorkspace);
  const ctx = createContext(ws.dataset);
  const today = todayIn(ws.settings.timezone);
  const scope = [filter.from || filter.to ? `${filter.from ?? "start"} to ${filter.to ?? "today"}` : "All dates", filter.accountId ? ws.dataset.accounts.find((a) => a.id === filter.accountId)?.name : "all accounts"].filter(Boolean).join(", ");

  if (entity === "all") {
    const tables = allTables(ws, ctx, filter);
    if (format === "xlsx") return file(await toXlsx(tables), "xlsx", `poker-bankroll-${today}`);
    if (format === "json") return file(JSON.stringify({ exportedAt: new Date().toISOString(), baseCurrency: ws.settings.baseCurrency, scope, tables: Object.fromEntries(tables.map((t) => [t.name, tableToJson(t)])) }, null, 2), "json", `poker-bankroll-${today}`);
    return new NextResponse("Use xlsx or json for a full export", { status: 400 });
  }

  if (!ENTITIES.includes(entity as Entity)) return new NextResponse("Unknown export", { status: 400 });
  const table = tableFor(entity as Entity, ws, ctx, filter);
  const name = `${entity}-${today}`;
  switch (format) {
    case "csv":
      return file(toCsv(table), "csv", name);
    case "xlsx":
      return file(await toXlsx([table]), "xlsx", name);
    case "json":
      return file(JSON.stringify({ entity, exportedAt: new Date().toISOString(), scope, rows: tableToJson(table) }, null, 2), "json", name);
    case "pdf":
      return file(await toPdf(table, { title: `Poker Bankroll Pro - ${table.name}`, scope, generatedAt: today, totalKey: TOTAL_KEY[entity as Entity] }), "pdf", name);
  }
}

function file(body: string | Uint8Array | Buffer, format: Format, name: string) {
  const data = typeof body === "string" ? body : new Uint8Array(body);
  return new NextResponse(data, {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${name}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
