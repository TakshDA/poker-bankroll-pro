import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../server/env";
import { sql } from "../server/db";
import { changeLocalPassword, deleteLocalUser } from "./local-store";
import { verifyPassword } from "./password";
import { supabaseServerClient, type AuthUser } from "./index";

/** A throwaway Supabase client that never touches the browser's session cookies. */
function statelessClient() {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL!, e.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Check the signed-in user's current password without changing their session. */
export async function checkPassword(user: AuthUser, password: string): Promise<boolean> {
  if (env().AUTH_PROVIDER === "supabase") {
    const client = statelessClient();
    const { error } = await client.auth.signInWithPassword({ email: user.email, password });
    if (error) return false;
    // End the extra session this check created; the browser's session is untouched.
    await client.auth.signOut({ scope: "local" }).catch(() => {});
    return true;
  }
  const rows = await sql()<{ encryptedPassword: string | null }[]>`select encrypted_password from auth.users where id = ${user.id}`;
  return verifyPassword(password, rows[0]?.encryptedPassword);
}

export type PasswordChange = "ok" | "wrong-password" | "rejected";

/** Change the password. Locally this also signs out every other session. */
export async function changePassword(user: AuthUser, current: string, next: string): Promise<PasswordChange> {
  if (env().AUTH_PROVIDER === "supabase") {
    if (!(await checkPassword(user, current))) return "wrong-password";
    const { error } = await (await supabaseServerClient()).auth.updateUser({ password: next });
    return error ? "rejected" : "ok";
  }
  return (await changeLocalPassword(sql(), user.id, current, next)) ? "ok" : "wrong-password";
}

/** Permanently delete the user. Every owned row cascades from auth.users. */
export async function deleteUser(user: AuthUser): Promise<void> {
  const e = env();
  if (e.AUTH_PROVIDER === "supabase") {
    if (!e.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL!, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`Supabase refused the delete (${error.code ?? error.status ?? "unknown"})`);
    return;
  }
  await deleteLocalUser(sql(), user.id);
}
