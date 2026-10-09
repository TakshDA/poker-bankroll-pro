"use client";
import { NotebookPen, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { FormDialog } from "@/components/form-dialog";
import { errorsFor, FormError, SubmitButton, useActionToast, useFormAction } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SETTING_LABELS } from "@/lib/format";
import { saveNoteAction, savePlanAction } from "./actions";

interface Opt {
  id: string;
  name: string;
}
export interface PlanOptions {
  venues: Opt[];
  platforms: Opt[];
  gameTypes: Opt[];
  stakeLevels: Opt[];
}
export interface PlanValues {
  id?: string;
  plannedDate: string;
  startTime: string;
  kind: string;
  setting: string;
  title: string;
  venueId: string;
  platformId: string;
  gameTypeId: string;
  stakeLevelId: string;
  notes: string;
  reminderMinutesBefore: string;
}

const REMINDERS = [
  ["", "No reminder"],
  ["30", "30 minutes before"],
  ["60", "1 hour before"],
  ["120", "2 hours before"],
  ["1440", "1 day before"],
];

function PlanForm({ values, options, onDone }: { values: PlanValues; options: PlanOptions; onDone: () => void }) {
  const [state, onSubmit, pending] = useFormAction(savePlanAction);
  const [v, setV] = useState(values);
  const set = (k: keyof PlanValues) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  useActionToast(state, { onSuccess: onDone });
  const err = (f: string) => errorsFor(state, f);
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <Field label="Title" htmlFor="pl-title" error={err("title")} className="sm:col-span-2">
        <Input id="pl-title" name="title" value={v.title} onChange={set("title")} maxLength={160} placeholder="e.g. Friday 2/5 at Rama" />
      </Field>
      <Field label="Date" htmlFor="pl-date" error={err("plannedDate")} required>
        <Input id="pl-date" name="plannedDate" type="date" value={v.plannedDate} onChange={set("plannedDate")} required />
      </Field>
      <Field label="Start time" htmlFor="pl-time" error={err("startTime")}>
        <Input id="pl-time" name="startTime" type="time" value={v.startTime} onChange={set("startTime")} />
      </Field>
      <Field label="Type" htmlFor="pl-kind">
        <Select id="pl-kind" name="kind" value={v.kind} onChange={set("kind")}>
          <option value="cash">Cash game</option>
          <option value="tournament">Tournament</option>
        </Select>
      </Field>
      <Field label="Where" htmlFor="pl-setting">
        <Select id="pl-setting" name="setting" value={v.setting} onChange={set("setting")}>
          {Object.entries(SETTING_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      {v.setting === "online" ? (
        <Field label="Platform" htmlFor="pl-platform" error={err("platformId")}>
          <Select id="pl-platform" name="platformId" value={v.platformId} onChange={set("platformId")}>
            <option value="">—</option>
            {options.platforms.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Venue" htmlFor="pl-venue" error={err("venueId")}>
          <Select id="pl-venue" name="venueId" value={v.venueId} onChange={set("venueId")}>
            <option value="">—</option>
            {options.venues.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Game" htmlFor="pl-game" error={err("gameTypeId")}>
        <Select id="pl-game" name="gameTypeId" value={v.gameTypeId} onChange={set("gameTypeId")}>
          <option value="">—</option>
          {options.gameTypes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      {v.kind === "cash" && options.stakeLevels.length ? (
        <Field label="Stakes" htmlFor="pl-stake" error={err("stakeLevelId")}>
          <Select id="pl-stake" name="stakeLevelId" value={v.stakeLevelId} onChange={set("stakeLevelId")}>
            <option value="">—</option>
            {options.stakeLevels.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Reminder" htmlFor="pl-rem" error={err("reminderMinutesBefore")} hint={v.startTime ? "Shown in the app when it is due" : "Set a start time to enable a reminder"}>
        <Select id="pl-rem" name="reminderMinutesBefore" value={v.reminderMinutesBefore} onChange={set("reminderMinutesBefore")} disabled={!v.startTime}>
          {REMINDERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" htmlFor="pl-notes" error={err("notes")} className="sm:col-span-2">
        <Textarea id="pl-notes" name="notes" value={v.notes} onChange={set("notes")} rows={2} maxLength={4000} />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <FormError state={state} />
        <SubmitButton pending={pending}>{v.id ? "Save plan" : "Plan session"}</SubmitButton>
      </div>
    </form>
  );
}

export function NewPlanDialog({ values, options, compact }: { values: PlanValues; options: PlanOptions; compact?: boolean }) {
  return (
    <FormDialog title="Plan a session" trigger={<><Plus /> {compact ? "Plan" : "Plan session"}</>} triggerVariant="secondary" triggerSize={compact ? "sm" : "md"} openParam={compact ? undefined : { key: "new", value: "plan" }} wide>
      {(close) => <PlanForm values={values} options={options} onDone={close} />}
    </FormDialog>
  );
}

export function EditPlanDialog({ values, options }: { values: PlanValues; options: PlanOptions }) {
  return (
    <FormDialog title="Edit plan" trigger={<Pencil aria-label="Edit plan" />} triggerVariant="ghost" triggerSize="icon" wide>
      {(close) => <PlanForm values={values} options={options} onDone={close} />}
    </FormDialog>
  );
}

function NoteForm({ values, onDone }: { values: { id?: string; noteDate: string; title: string; body: string }; onDone: () => void }) {
  const [state, onSubmit, pending] = useFormAction(saveNoteAction);
  useActionToast(state, { onSuccess: onDone });
  const err = (f: string) => errorsFor(state, f);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="Date" htmlFor="nt-date" error={err("noteDate")}>
        <Input id="nt-date" name="noteDate" type="date" defaultValue={values.noteDate} required />
      </Field>
      <Field label="Title" htmlFor="nt-title" error={err("title")}>
        <Input id="nt-title" name="title" defaultValue={values.title} maxLength={160} />
      </Field>
      <Field label="Note" htmlFor="nt-body" error={err("body")} required>
        <Textarea id="nt-body" name="body" defaultValue={values.body} rows={5} maxLength={8000} required />
      </Field>
      <FormError state={state} />
      <SubmitButton pending={pending}>{values.id ? "Save note" : "Add note"}</SubmitButton>
    </form>
  );
}

export function NoteDialog({ values }: { values: { id?: string; noteDate: string; title: string; body: string } }) {
  return (
    <FormDialog
      title={values.id ? "Edit note" : "Add a note"}
      trigger={values.id ? <Pencil aria-label="Edit note" /> : <><NotebookPen /> Note</>}
      triggerVariant={values.id ? "ghost" : "secondary"}
      triggerSize={values.id ? "icon" : "sm"}
    >
      {(close) => <NoteForm values={values} onDone={close} />}
    </FormDialog>
  );
}
