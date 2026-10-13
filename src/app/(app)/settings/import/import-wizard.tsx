"use client";
import { AlertTriangle, CheckCircle2, Copy, Download, FileUp, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { parseCsv, type ParsedCsv } from "@/lib/import/csv";
import type { DateOrder } from "@/lib/import/normalize";
import { ENTITY_LABELS, FIELDS, guessMapping, IMPORT_ENTITIES, mappingProblems, type ImportEntity, type ImportOptions } from "@/lib/import/spec";
import { cn } from "@/lib/utils";
import { commitImportAction, previewImportAction, type ImportResult } from "./actions";

const MAX_BYTES = 2 * 1024 * 1024;

function guessDateOrder(cells: string[]): DateOrder {
  let dmy = false;
  let mdy = false;
  for (const c of cells.slice(0, 200)) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(c.trim());
    if (m) {
      if (+m[1] > 12) dmy = true;
      if (+m[2] > 12) mdy = true;
    }
  }
  return dmy && !mdy ? "dmy" : "mdy";
}

function templateCsv(entity: ImportEntity): string {
  return FIELDS[entity].map((f) => `"${f.label}"`).join(",") + "\n";
}

export function ImportWizard({ accounts, categories, defaultAccountId }: { accounts: { id: string; name: string; currency: string }[]; categories: { id: string; name: string }[]; defaultAccountId: string }) {
  const router = useRouter();
  const [entity, setEntity] = useState<ImportEntity>("sessions");
  const [file, setFile] = useState<{ name: string; csv: ParsedCsv } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [options, setOptions] = useState<ImportOptions>({
    dateOrder: "mdy",
    decimalMark: ".",
    defaultAccountId,
    defaultSetting: "live_casino",
    defaultCategoryId: categories.find((c) => /other/i.test(c.name))?.id ?? categories[0]?.id ?? "",
    includeDuplicates: false,
  });
  const [preview, setPreview] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "duplicate">("all");
  const [pending, start] = useTransition();
  const [committing, startCommit] = useTransition();

  const chooseEntity = (e: ImportEntity) => {
    setEntity(e);
    setPreview(null);
    if (file) setMapping(guessMapping(e, file.csv.headers));
  };

  const onFile = async (f: File | undefined) => {
    setPreview(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return toast.error("That file is over 2 MB. Split it into smaller files.");
    const csv = parseCsv(await f.text());
    if (!csv.headers.length || !csv.rows.length) return toast.error("No rows found. The first line should be the column names.");
    setFile({ name: f.name, csv });
    setMapping(guessMapping(entity, csv.headers));
    const dateCol = guessMapping(entity, csv.headers).date;
    if (dateCol !== undefined) setOptions((o) => ({ ...o, dateOrder: guessDateOrder(csv.rows.map((r) => r[dateCol] ?? "")) }));
  };

  const payload = () => ({ entity, fileName: file!.name, headers: file!.csv.headers, rows: file!.csv.rows, mapping, options });
  const set = <K extends keyof ImportOptions>(k: K, v: ImportOptions[K]) => {
    setOptions((o) => ({ ...o, [k]: v }));
    setPreview(null);
  };

  const runPreview = () =>
    start(async () => {
      const r = await previewImportAction(payload());
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setPreview(r);
      setFilter(r.counts.errors ? "error" : "all");
    });

  const runCommit = () =>
    startCommit(async () => {
      const r = await commitImportAction(payload());
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(`Imported ${r.counts.imported} record${r.counts.imported === 1 ? "" : "s"}${r.counts.duplicates ? `, skipped ${r.counts.duplicates} duplicate${r.counts.duplicates === 1 ? "" : "s"}` : ""}${r.counts.errors ? `, ${r.counts.errors} with errors` : ""}.`);
      setFile(null);
      setPreview(null);
      setMapping({});
      router.refresh();
    });

  const fields = FIELDS[entity];
  const sample = (i: number) => file?.csv.rows.find((r) => (r[i] ?? "").trim())?.[i] ?? "";
  const missingRequired = mappingProblems(entity, mapping);
  const needsAccount = (mapping.account ?? -1) < 0 && !options.defaultAccountId;
  const shown = useMemo(() => (preview ? preview.results.filter((r) => filter === "all" || r.status === filter).slice(0, 300) : []), [preview, filter]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-col gap-1">
          <CardTitle>1. Choose what to import</CardTitle>
          <CardDescription>One type per file. The first line must hold the column names.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div role="radiogroup" aria-label="What to import" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {IMPORT_ENTITIES.map((e) => (
              <button key={e} type="button" role="radio" aria-checked={entity === e} onClick={() => chooseEntity(e)} className={cn("rounded-lg border px-3 py-2 text-sm", entity === e ? "border-gold/60 bg-gold-soft font-medium" : "border-border text-fg-muted hover:bg-surface-2")}>
                {ENTITY_LABELS[e]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]">
              <FileUp className="size-4" aria-hidden /> {file ? "Choose another file" : "Choose CSV file"}
              <input type="file" accept=".csv,text/csv,.txt" className="sr-only" aria-label="CSV file" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {file ? (
              <span className="text-sm text-fg-muted">
                {file.name} · {file.csv.rows.length} row{file.csv.rows.length === 1 ? "" : "s"} · {file.csv.headers.length} columns
              </span>
            ) : null}
            <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv(entity))}`} download={`${entity}-template.csv`} className="inline-flex items-center gap-1.5 text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline">
              <Download className="size-3.5" aria-hidden /> Blank template
            </a>
          </div>
        </CardContent>
      </Card>

      {file ? (
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle>2. Match your columns</CardTitle>
            <CardDescription>We guessed from the column names. Fields marked * are needed; leave the rest as “Not in file”.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => {
                const idx = mapping[f.key] ?? -1;
                return (
                  <Field key={f.key} label={f.label} htmlFor={`map-${f.key}`} required={f.required} hint={idx >= 0 && sample(idx) ? `e.g. ${sample(idx).slice(0, 40)}` : f.hint}>
                    <Select
                      id={`map-${f.key}`}
                      value={String(idx)}
                      onChange={(e) => {
                        setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }));
                        setPreview(null);
                      }}
                    >
                      <option value="-1">Not in file</option>
                      {file.csv.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </Field>
                );
              })}
            </div>
            <div className="grid gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Dates are written" htmlFor="opt-date">
                <Select id="opt-date" value={options.dateOrder} onChange={(e) => set("dateOrder", e.target.value as DateOrder)}>
                  <option value="mdy">Month/day/year (10/09/2026)</option>
                  <option value="dmy">Day/month/year (09/10/2026)</option>
                  <option value="ymd">Year-month-day (2026-10-09)</option>
                </Select>
              </Field>
              <Field label="Decimal separator" htmlFor="opt-decimal">
                <Select id="opt-decimal" value={options.decimalMark} onChange={(e) => set("decimalMark", e.target.value as "." | ",")}>
                  <option value=".">Point (1,234.50)</option>
                  <option value=",">Comma (1.234,50)</option>
                </Select>
              </Field>
              <Field label="Default account" htmlFor="opt-account" hint="For rows without an account column" error={needsAccount ? "Choose an account" : undefined}>
                <Select id="opt-account" value={options.defaultAccountId} onChange={(e) => set("defaultAccountId", e.target.value)}>
                  <option value="">Choose…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </Select>
              </Field>
              {entity === "sessions" || entity === "tournaments" ? (
                <Field label="When live/online is missing" htmlFor="opt-setting">
                  <Select id="opt-setting" value={options.defaultSetting} onChange={(e) => set("defaultSetting", e.target.value as "live_casino" | "online")}>
                    <option value="live_casino">Live</option>
                    <option value="online">Online</option>
                  </Select>
                </Field>
              ) : null}
              {entity === "expenses" ? (
                <Field label="Default category" htmlFor="opt-category" hint="For rows whose category is missing or unknown">
                  <Select id="opt-category" value={options.defaultCategoryId} onChange={(e) => set("defaultCategoryId", e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-3">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--gold)]" checked={options.includeDuplicates} onChange={(e) => set("includeDuplicates", e.target.checked)} />
                <span>
                  Import rows that look like duplicates too
                  <span className="block text-xs text-fg-subtle">Off: a row with the same date, account and amounts as an existing record is skipped.</span>
                </span>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runPreview} disabled={pending || committing || missingRequired.length > 0 || needsAccount}>
                {pending ? <Loader2 className="animate-spin" /> : null} Check {file.csv.rows.length} row{file.csv.rows.length === 1 ? "" : "s"}
              </Button>
              {missingRequired.length ? <span className="text-sm text-warning">Choose a column for {missingRequired.join("; ")}</span> : <span className="text-sm text-fg-subtle">Nothing is saved until you confirm.</span>}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle>3. Review and import</CardTitle>
            <CardDescription>Each row was checked with the same rules as entering it by hand.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div role="radiogroup" aria-label="Show rows" className="flex flex-wrap gap-2">
              {(
                [
                  ["all", `All ${preview.counts.total}`, null],
                  ["ok", `${preview.counts.imported} ready`, CheckCircle2],
                  ["duplicate", `${preview.counts.duplicates} duplicate${preview.counts.duplicates === 1 ? "" : "s"}`, Copy],
                  ["error", `${preview.counts.errors} with errors`, XCircle],
                ] as const
              ).map(([k, label, Icon]) =>
                k === "ok" ? (
                  <Badge key={k} tone="positive" className="px-2.5 py-1">
                    {Icon ? <Icon className="size-3.5" aria-hidden /> : null} {label}
                  </Badge>
                ) : (
                  <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", filter === k ? "border-fg-muted bg-surface-3 text-fg" : "border-border text-fg-muted hover:text-fg")}>
                    {Icon ? <Icon className="size-3.5" aria-hidden /> : null} {label}
                  </button>
                ),
              )}
            </div>
            {shown.length ? (
              <div className="-mx-5 overflow-x-auto sm:mx-0">
                <Table>
                  <THead>
                    <tr>
                      <TH className="pl-5 sm:pl-3">Line</TH>
                      <TH>Status</TH>
                      <TH>Row</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {shown.map((r) => (
                      <TR key={r.line}>
                        <TD className="num pl-5 align-top text-fg-muted sm:pl-3">{r.line}</TD>
                        <TD className="align-top">
                          <Badge tone={r.status === "ok" ? "positive" : r.status === "duplicate" ? "warning" : "negative"}>{r.status === "ok" ? "Ready" : r.status === "duplicate" ? "Duplicate" : "Error"}</Badge>
                        </TD>
                        <TD className="max-w-[28rem] whitespace-normal align-top">
                          <span className="block break-words text-sm">{r.summary}</span>
                          {r.message ? <span className={cn("block text-xs", r.status === "error" ? "text-negative" : "text-fg-muted")}>{r.message}</span> : null}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">No rows in this view.</p>
            )}
            {preview.results.filter((r) => filter === "all" || r.status === filter).length > shown.length ? <p className="text-xs text-fg-subtle">Showing the first {shown.length}.</p> : null}
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button onClick={runCommit} disabled={committing || preview.counts.imported === 0}>
                {committing ? <Loader2 className="animate-spin" /> : null} Import {preview.counts.imported} row{preview.counts.imported === 1 ? "" : "s"}
              </Button>
              {preview.counts.errors ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
                  <AlertTriangle className="size-4 text-warning" aria-hidden /> Rows with errors are skipped. Fix them in the file and import it again; duplicates will be skipped.
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
