"use client";
import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";

const FORMATS = [
  { format: "csv", label: "CSV" },
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "pdf", label: "PDF report" },
  { format: "json", label: "JSON" },
];

/**
 * Download menu for a list page. Carries the page's date/account filters;
 * pages that resolve a range preset ("this month") pass the resolved dates.
 */
export function ExportMenu({ entity, range }: { entity: string; range?: { from: string | null; to: string | null } }) {
  const params = useSearchParams();
  const href = (format: string) => {
    const q = new URLSearchParams({ entity, format });
    const values: Record<string, string | null> = { from: params.get("from"), to: params.get("to"), account: params.get("account") };
    if (range) Object.assign(values, { from: range.from, to: range.to });
    for (const [k, v] of Object.entries(values)) if (v) q.set(k, v);
    return `/api/export?${q}`;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">
          <Download /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {FORMATS.map((f) => (
          <DropdownMenuItem key={f.format} asChild>
            <a href={href(f.format)} download>
              {f.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
