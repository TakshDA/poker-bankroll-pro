"use client";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { FormDialog } from "@/components/form-dialog";
import { ConfirmAction, errorsFor, FormError, SubmitButton, useActionToast, useFormAction } from "@/components/forms";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/input";
import type { ListKind } from "@/lib/data/settings";
import { archiveListItemAction, deleteListItemAction, restoreListItemAction, saveListItemAction } from "../actions";
import { BETTING, EXPENSE_KINDS, LIST_META, VENUE_KINDS } from "./list-meta";

export type ItemValues = Record<string, string>;

function ItemForm({ kind, values, currencies, onDone }: { kind: ListKind; values: ItemValues; currencies: string[]; onDone: () => void }) {
  const [state, onSubmit, pending] = useFormAction(saveListItemAction.bind(null, kind));
  useActionToast(state, { onSuccess: onDone });
  const err = (f: string) => errorsFor(state, f);
  const v = (k: string) => values[k] ?? "";
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {kind === "stake_levels" ? (
        <>
          <Field label="Currency" htmlFor="li-currency" error={err("currency")}>
            <Select id="li-currency" name="currency" defaultValue={v("currency")}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Name" htmlFor="li-label" error={err("label")} hint="Leave blank to use the blinds, e.g. 1/2 CAD">
            <Input id="li-label" name="label" defaultValue={v("label")} maxLength={60} />
          </Field>
          <Field label="Small blind" htmlFor="li-sb" error={err("smallBlind")} required>
            <MoneyInput id="li-sb" name="smallBlind" defaultValue={v("smallBlind")} required />
          </Field>
          <Field label="Big blind" htmlFor="li-bb" error={err("bigBlind")} required>
            <MoneyInput id="li-bb" name="bigBlind" defaultValue={v("bigBlind")} required />
          </Field>
          <Field label="Straddle" htmlFor="li-straddle" error={err("straddle")}>
            <MoneyInput id="li-straddle" name="straddle" defaultValue={v("straddle")} />
          </Field>
          <Field label="Ante" htmlFor="li-ante" error={err("ante")}>
            <MoneyInput id="li-ante" name="ante" defaultValue={v("ante")} />
          </Field>
        </>
      ) : (
        <Field label="Name" htmlFor="li-name" error={err("name")} required className={kind === "platforms" ? "sm:col-span-2" : undefined}>
          <Input id="li-name" name="name" defaultValue={v("name")} maxLength={kind === "expense_categories" ? 60 : 120} required />
        </Field>
      )}
      {kind === "venues" ? (
        <>
          <Field label="Type" htmlFor="li-kind" error={err("kind")}>
            <Select id="li-kind" name="kind" defaultValue={v("kind") || "casino"}>
              {Object.entries(VENUE_KINDS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City" htmlFor="li-city" error={err("city")}>
            <Input id="li-city" name="city" defaultValue={v("city")} maxLength={120} />
          </Field>
          <Field label="Province / state" htmlFor="li-region" error={err("region")}>
            <Input id="li-region" name="region" defaultValue={v("region")} maxLength={120} />
          </Field>
          <Field label="Country" htmlFor="li-country" error={err("country")}>
            <Input id="li-country" name="country" defaultValue={v("country")} maxLength={120} />
          </Field>
        </>
      ) : null}
      {kind === "platforms" ? (
        <Field label="Website" htmlFor="li-website" error={err("website")} className="sm:col-span-2">
          <Input id="li-website" name="website" defaultValue={v("website")} maxLength={300} placeholder="e.g. pokerstars.com" />
        </Field>
      ) : null}
      {kind === "game_types" ? (
        <>
          <Field label="Short name" htmlFor="li-short" error={err("shortName")} hint="e.g. NLHE, PLO">
            <Input id="li-short" name="shortName" defaultValue={v("shortName")} maxLength={16} />
          </Field>
          <Field label="Betting" htmlFor="li-betting" error={err("bettingStructure")} className="sm:col-span-2">
            <Select id="li-betting" name="bettingStructure" defaultValue={v("bettingStructure") || "no_limit"}>
              {Object.entries(BETTING).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}
      {kind === "expense_categories" ? (
        <Field label="Type" htmlFor="li-ekind" error={err("kind")}>
          <Select id="li-ekind" name="kind" defaultValue={v("kind") || "other"}>
            {Object.entries(EXPENSE_KINDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {kind === "venues" || kind === "platforms" ? (
        <Field label="Notes" htmlFor="li-notes" error={err("notes")} className="sm:col-span-2">
          <Textarea id="li-notes" name="notes" defaultValue={v("notes")} rows={2} maxLength={4000} />
        </Field>
      ) : null}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError state={state} />
        <SubmitButton pending={pending}>{values.id ? "Save" : "Add"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddItemDialog({ kind, defaults, currencies }: { kind: ListKind; defaults: ItemValues; currencies: string[] }) {
  return (
    <FormDialog title={`Add ${LIST_META[kind].one}`} trigger={<><Plus /> Add {LIST_META[kind].one}</>} wide>
      {(close) => <ItemForm kind={kind} values={defaults} currencies={currencies} onDone={close} />}
    </FormDialog>
  );
}

export function ItemActions({ kind, values, currencies, name, archived, used }: { kind: ListKind; values: ItemValues; currencies: string[]; name: string; archived: boolean; used: number }) {
  return (
    <div className="flex justify-end">
      <FormDialog title={`Edit ${LIST_META[kind].one}`} trigger={<Pencil aria-label={`Edit ${name}`} />} triggerVariant="ghost" triggerSize="icon" wide>
        {(close) => <ItemForm kind={kind} values={values} currencies={currencies} onDone={close} />}
      </FormDialog>
      {archived ? (
        <ConfirmAction action={restoreListItemAction.bind(null, kind)} id={values.id} title={`Bring back "${name}"?`} description="It will appear in your pickers again." confirmLabel="Restore" variant="primary" triggerSize="icon">
          <ArchiveRestore aria-label={`Restore ${name}`} />
        </ConfirmAction>
      ) : (
        <ConfirmAction action={archiveListItemAction.bind(null, kind)} id={values.id} title={`Archive "${name}"?`} description="Past records keep it; it is hidden when you log new ones." confirmLabel="Archive" variant="primary" triggerSize="icon">
          <Archive aria-label={`Archive ${name}`} />
        </ConfirmAction>
      )}
      {used === 0 ? (
        <ConfirmAction action={deleteListItemAction.bind(null, kind)} id={values.id} title={`Delete "${name}"?`} description="Nothing uses it, so it can be removed for good." confirmLabel="Delete" triggerSize="icon">
          <Trash2 aria-label={`Delete ${name}`} />
        </ConfirmAction>
      ) : null}
    </div>
  );
}
