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

/** Download menu for a list page. Carries the page's date/account filters. */
export function ExportMenu({ entity }: { entity: string }) {
  const params = useSearchParams();
  const href = (format: string) => {
    const q = new URLSearchParams({ entity, format });
    for (const k of ["from", "to", "account"]) {
      const v = params.get(k);
      if (v) q.set(k, v);
    }
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
