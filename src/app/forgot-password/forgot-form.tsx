"use client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { FormError, SubmitButton, useFormAction } from "@/components/forms";
import { requestPasswordReset } from "../login/actions";

export function ForgotForm() {
  const [state, submit, pending] = useFormAction(requestPasswordReset);
  return (
    <Card>
      <CardContent className="pt-5">
        {state.ok && state.message ? (
          <Alert tone="positive" title="Check your email">
            {state.message}
          </Alert>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <FormError state={state} />
            <SubmitButton pending={pending} className="w-full" pendingText="Sending…">
              Send reset link
            </SubmitButton>
          </form>
        )}
        <p className="mt-4 text-center text-xs">
          <Link href="/login" className="text-positive hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
