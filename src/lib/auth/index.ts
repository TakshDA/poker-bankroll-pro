import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { env } from "../server/env";
import { sql } from "../server/db";
import { resolveLocalSession, type AuthUser } from "./local-store";

export type { AuthUser };

export const SESSION_COOKIE = "pbp_session";

export async function supabaseServerClient() {
  const e = env();
  const store = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL!, e.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component where cookies are read-only; the
          // proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * The signed-in user for this request, or null. Memoised per request.
 * Local: looks up the hashed session token in Postgres.
 * Supabase: `auth.getUser()` validates the JWT with the Supabase Auth server.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  if (env().AUTH_PROVIDER === "supabase") {
    const supabase = await supabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveLocalSession(sql(), token);
});

/** Use in pages, layouts, actions and route handlers that need a user. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
