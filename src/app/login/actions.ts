"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSessionCookie, getCurrentUser, SESSION_COOKIE, setSessionCookie, supabaseServerClient } from "@/lib/auth";
import { authenticateLocal, countLocalUsers, createLocalSession, createLocalUser, revokeLocalSession } from "@/lib/auth/local-store";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/auth/rate-limit";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { sql } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import type { ActionState } from "@/lib/validation/common";

const credentials = z.object({
  email: z.email("Enter a valid email").max(254),
  password: z.string().min(1, "Enter your password").max(200),
});

async function clientKey(email: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
  return `${ip}|${email.toLowerCase()}`;
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, ts: Date.now(), message: "Enter your email and password." };
  const { email, password } = parsed.data;
  const key = await clientKey(email);
  if (isRateLimited(key)) return { ok: false, ts: Date.now(), message: "Too many failed attempts. Try again in 15 minutes." };

  if (env().AUTH_PROVIDER === "supabase") {
    const supabase = await supabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      recordFailure(key);
      if (error.code === "email_not_confirmed") return { ok: false, ts: Date.now(), message: "Confirm your email first: open the link we sent you." };
      return { ok: false, ts: Date.now(), message: "Invalid email or password." };
    }
  } else {
    const user = await authenticateLocal(sql(), email, password);
    if (!user) {
      recordFailure(key);
      return { ok: false, ts: Date.now(), message: "Invalid email or password." };
    }
    const session = await createLocalSession(sql(), user.id);
    await setSessionCookie(session.token, session.expiresAt);
  }
  clearFailures(key);
  redirect("/");
}

const signupSchema = credentials.extend({
  password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(200),
});

/** Absolute origin of this request, for links in confirmation emails. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Registration is closed unless ALLOW_SIGNUP=true. With local auth, in
 * development only, the very first account may be created from the login page.
 * With Supabase, new accounts must confirm their email before signing in.
 */
export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const e = env();
  const allowed = await signupAllowed();
  if (!allowed) return { ok: false, ts: Date.now(), message: "Registration is closed." };
  const parsed = signupSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { ok: false, ts: Date.now(), message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const key = await clientKey(`signup:${parsed.data.email}`);
  if (isRateLimited(key)) return { ok: false, ts: Date.now(), message: "Too many attempts. Try again in 15 minutes." };
  recordFailure(key); // counts every attempt, not just failures

  if (e.AUTH_PROVIDER === "supabase") {
    const supabase = await supabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: `${await origin()}/auth/confirm?next=/` },
    });
    if (error) {
      const weak = error.code === "weak_password";
      return { ok: false, ts: Date.now(), message: weak ? "Choose a stronger password." : "Could not create the account. Try again later." };
    }
    if (data.session) redirect("/"); // email confirmation turned off in Supabase
    // Same answer whether or not the email was already registered (no account enumeration).
    return { ok: true, ts: Date.now(), message: `Check ${parsed.data.email} for a confirmation link, then sign in.` };
  }
  try {
    const user = await createLocalUser(sql(), parsed.data.email, parsed.data.password);
    const session = await createLocalSession(sql(), user.id);
    await setSessionCookie(session.token, session.expiresAt);
  } catch {
    return { ok: false, ts: Date.now(), message: "Could not create the account (the email may already be registered)." };
  }
  redirect("/");
}

/** Email a password-reset link (Supabase only). Same reply whether or not the account exists. */
export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.email().max(254).safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, ts: Date.now(), message: "Enter a valid email." };
  if (env().AUTH_PROVIDER !== "supabase") return { ok: false, ts: Date.now(), message: "Password reset by email needs Supabase Auth. Locally, run pnpm user:create again or change the password in Settings." };
  const key = await clientKey(`reset:${parsed.data}`);
  if (isRateLimited(key)) return { ok: false, ts: Date.now(), message: "Too many attempts. Try again in 15 minutes." };
  recordFailure(key);
  const supabase = await supabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${await origin()}/auth/confirm?next=/reset-password` });
  return { ok: true, ts: Date.now(), message: `If an account exists for ${parsed.data}, a reset link is on its way.` };
}

const newPasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The passwords do not match", path: ["confirm"] });

/** Set a new password for the signed-in user (after following a reset link). */
export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, ts: Date.now(), message: "The reset link has expired. Request a new one." };
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, ts: Date.now(), message: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (env().AUTH_PROVIDER !== "supabase") return { ok: false, ts: Date.now(), message: "Use Settings to change your password." };
  const supabase = await supabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, ts: Date.now(), message: error.code === "same_password" ? "Choose a password you have not used here before." : "Could not update the password. Request a new link." };
  redirect("/?passwordUpdated=1");
}

export async function signOut() {
  if (env().AUTH_PROVIDER === "supabase") {
    const supabase = await supabaseServerClient();
    await supabase.auth.signOut();
  } else {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) await revokeLocalSession(sql(), token);
    await clearSessionCookie();
  }
  redirect("/login");
}

export async function alreadySignedIn() {
  return (await getCurrentUser()) !== null;
}

export async function signupAllowed(): Promise<boolean> {
  const e = env();
  if (e.ALLOW_SIGNUP) return true;
  if (e.AUTH_PROVIDER !== "local") return false;
  return e.NODE_ENV !== "production" && (await countLocalUsers(sql())) === 0;
}
