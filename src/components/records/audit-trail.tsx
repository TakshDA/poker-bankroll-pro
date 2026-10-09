import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tx } from "@/lib/server/db";

export interface AuditRow {
  id: number;
  tableName: string;
  action: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  createdAt: string;
}

export async function loadAudit(tx: Tx, recordIds: string[]): Promise<AuditRow[]> {
  if (recordIds.length === 0) return [];
  return tx<AuditRow[]>`
    select id, table_name, action, old_data, new_data, created_at from audit_log
    where record_id in ${tx(recordIds)} order by id desc limit 50`;
}

const HIDDEN = new Set(["userId", "createdAt", "updatedAt", "id", "sessionId", "tournamentId"]);
const ACTION_LABEL: Record<string, string> = { insert: "Created", update: "Edited", delete: "Deleted", soft_delete: "Moved to Trash", restore: "Restored" };

function humanize(key: string) {
  return key.replace(/Minor$/, "").replace(/([A-Z])/g, " $1").toLowerCase();
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Read-only audit history for a record (amounts shown in minor units). */
export function AuditTrail({ rows, timeZone }: { rows: AuditRow[]; timeZone: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-fg-muted" /> History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-fg-subtle">No history yet.</p>
        ) : (
          <ol className="space-y-3 text-sm">
            {rows.map((r) => {
              const changes = r.action === "update" ? Object.keys(r.newData ?? {}).filter((k) => !HIDDEN.has(k)) : [];
              return (
                <li key={r.id} className="border-l-2 border-border pl-3">
                  <p className="text-xs text-fg-subtle">
                    {new Date(r.createdAt).toLocaleString("en-CA", { timeZone, dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <p className="font-medium">
                    {ACTION_LABEL[r.action] ?? r.action}
                    {r.tableName === "cash_game_details" ? " (amounts)" : r.tableName === "tournament_entries" ? " (entry)" : ""}
                  </p>
                  {changes.length ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-fg-muted">
                      {changes.map((k) => (
                        <li key={k}>
                          {humanize(k)}: <span className="line-through opacity-70">{fmt(r.oldData?.[k])}</span> → {fmt(r.newData?.[k])}
                          {k.endsWith("Minor") ? <span className="text-fg-subtle"> (cents)</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
