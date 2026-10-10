"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { FormError, SubmitButton, useFormAction } from "@/components/forms";
import { signIn, signUp } from "./actions";

/**
 * Sign in / create account. `openSignup` = anyone may register (Supabase);
 * otherwise sign-up only creates the first owner account locally.
 */
export function LoginForm({ canSignUp, openSignup, canReset }: { canSignUp: boolean; openSignup: boolean; canReset: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [inState, inSubmit, inPending] = useFormAction(signIn);
  const [upState, upSubmit, upPending] = useFormAction(signUp);
  const state = mode === "signin" ? inState : upState;
  const createLabel = openSignup ? "Create account" : "Create owner account";
  if (mode === "signup" && upState.ok && upState.message) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-5">
          <Alert tone="positive" title="Confirm your email">
            {upState.message}
          </Alert>
          <button type="button" className="w-full text-center text-sm text-positive hover:underline" onClick={() => setMode("signin")}>
            Back to sign in
          </button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="pt-5">
        <form key={mode} onSubmit={mode === "signin" ? inSubmit : upSubmit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 10 characters" : undefined}>
            <Input id="password" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required />
          </Field>
          <FormError state={state} />
          <SubmitButton pending={mode === "signin" ? inPending : upPending} className="w-full" pendingText={mode === "signin" ? "Signing in…" : "Creating…"}>
            {mode === "signin" ? "Sign in" : createLabel}
          </SubmitButton>
        </form>
        {mode === "signin" && canReset ? (
          <p className="mt-3 text-center text-xs">
            <Link href="/forgot-password" className="text-fg-muted hover:text-fg hover:underline">
              Forgot your password?
            </Link>
          </p>
        ) : null}
        {canSignUp ? (
          <p className="mt-4 text-center text-xs text-fg-subtle">
            {mode === "signin" ? (openSignup ? "New here? " : "First time here? ") : "Already have an account? "}
            <button type="button" className="text-positive hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? createLabel : "Sign in"}
            </button>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
