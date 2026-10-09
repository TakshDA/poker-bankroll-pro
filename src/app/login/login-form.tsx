"use client";
import { useActionState, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { FormError, SubmitButton } from "@/components/forms";
import { initialActionState } from "@/lib/validation/common";
import { signIn, signUp } from "./actions";

export function LoginForm({ canSignUp }: { canSignUp: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [inState, inAction] = useActionState(signIn, initialActionState);
  const [upState, upAction] = useActionState(signUp, initialActionState);
  const state = mode === "signin" ? inState : upState;
  return (
    <Card>
      <CardContent className="pt-5">
        <form action={mode === "signin" ? inAction : upAction} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 10 characters" : undefined}>
            <Input id="password" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required />
          </Field>
          <FormError state={state} />
          <SubmitButton className="w-full" pendingText={mode === "signin" ? "Signing in…" : "Creating…"}>
            {mode === "signin" ? "Sign in" : "Create owner account"}
          </SubmitButton>
        </form>
        {canSignUp ? (
          <p className="mt-4 text-center text-xs text-fg-subtle">
            {mode === "signin" ? "First time here? " : "Already have an account? "}
            <button type="button" className="text-positive hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Create the owner account" : "Sign in"}
            </button>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
