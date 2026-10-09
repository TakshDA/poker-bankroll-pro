"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSessionCookie, getCurrentUser, SESSION_COOKIE, setSessionCookie, supabaseServerClient } from "@/lib/auth";
import { authenticateLocal, countLocalUsers, createLocalSession, createLocalUser, revokeLocalSession } from "@/lib/auth/local-store";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/auth/rate-limit";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { sql } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import type { ActionState } from "@/lib/validation/common";
import { cookies } from "next/headers";

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

/**
 * Registration is closed unless ALLOW_SIGNUP=true. In development only, the
 * very first account on a fresh installation may be created from the login
 * page; in production create the owner with `pnpm user:create`.
 */
export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const e = env();
  if (e.AUTH_PROVIDER !== "local") return { ok: false, ts: Date.now(), message: "Create users in your Supabase dashboard." };
  const allowed = await signupAllowed();
  if (!allowed) return { ok: false, ts: Date.now(), message: "Registration is disabled for this private installation." };
  const parsed = signupSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { ok: false, ts: Date.now(), message: parsed.error.issues[0]?.message ?? "Invalid input" };
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
  if (e.AUTH_PROVIDER !== "local") return false;
  if (e.ALLOW_SIGNUP) return true;
  return e.NODE_ENV !== "production" && (await countLocalUsers(sql())) === 0;
}
