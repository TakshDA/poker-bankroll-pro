"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { FormError, SubmitButton, useFormAction } from "@/components/forms";
import { updatePassword } from "../login/actions";

export function ResetForm() {
  const [state, submit, pending] = useFormAction(updatePassword);
  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="New password" htmlFor="password" hint="At least 10 characters">
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
          <Field label="Repeat new password" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <FormError state={state} />
          <SubmitButton pending={pending} className="w-full" pendingText="Saving…">
            Save new password
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
