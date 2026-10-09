import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition-colors focus-visible:border-positive/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 aria-[invalid=true]:border-negative/70";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "min-h-24 h-auto py-2", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, "appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239aa3ad' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium uppercase tracking-wide text-fg-muted", className)} {...props} />;
}

/** Label + control + hint + error, wired for accessibility. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  required,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string[] | string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-negative"> *</span> : null}
      </Label>
      {children}
      {err ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-negative">
          {err}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Money input: decimal keypad on mobile, currency prefix. */
export function MoneyInput({ currency, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { currency?: string }) {
  return (
    <div className="relative">
      {currency ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">{currency}</span> : null}
      <Input inputMode="decimal" autoComplete="off" className={cn("num", currency ? "pl-12" : "", className)} {...props} />
    </div>
  );
}
