"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface FilterField {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

/** URL-driven search + filters (shareable, survives refresh). */
export function FilterBar({ fields, searchPlaceholder = "Search…", showDates = true }: { fields: FilterField[]; searchPlaceholder?: string; showDates?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({ q });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = [...params.keys()].some((k) => k !== "page" && k !== "new");

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 lg:flex-row lg:flex-wrap lg:items-center" aria-busy={pending}>
      <div className="relative lg:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label="Search" className="pl-9" type="search" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-1 lg:flex-wrap">
        {fields.map((f) => (
          <Select key={f.name} aria-label={f.label} value={params.get(f.name) ?? ""} onChange={(e) => update({ [f.name]: e.target.value })} className="lg:w-40">
            <option value="">{f.label}: all</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
        {showDates ? (
          <>
            <Input type="date" aria-label="From date" value={params.get("from") ?? ""} onChange={(e) => update({ from: e.target.value })} className="lg:w-40" />
            <Input type="date" aria-label="To date" value={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value })} className="lg:w-40" />
          </>
        ) : null}
      </div>
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            start(() => router.replace(pathname, { scroll: false }));
          }}
        >
          <X /> Clear
        </Button>
      ) : null}
    </div>
  );
}

export function Pagination({ page, pages, basePath, params }: { page: number; pages: number; basePath: string; params: Record<string, string> }) {
  if (pages <= 1) return null;
  const href = (p: number) => `${basePath}?${new URLSearchParams({ ...params, page: String(p) }).toString()}`;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      <span className="text-fg-muted">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="secondary" size="sm">
            <a href={href(page - 1)}>Previous</a>
          </Button>
        ) : null}
        {page < pages ? (
          <Button asChild variant="secondary" size="sm">
            <a href={href(page + 1)}>Next</a>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
