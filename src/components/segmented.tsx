"use client";
import { cn } from "@/lib/utils";

/** Accessible segmented control (radio group) that submits with the form. */
export function Segmented({
  name,
  label,
  value,
  onChange,
  options,
  className,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex-1 cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]",
              value === o.value ? "bg-surface-3 text-fg shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
