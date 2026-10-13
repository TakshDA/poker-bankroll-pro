"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSessionCookie, requireUser, supabaseServerClient } from "@/lib/auth";
import { changePassword, checkPassword, deleteUser } from "@/lib/auth/account";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/auth/rate-limit";
import { deleteListItem, deleteRate, isListKind, saveListItem, savePreferences, saveRate, setListArchived } from "@/lib/data/settings";
import { mutate, mutateById } from "@/lib/server/action";
import { isUuid, withUser } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { getStorage } from "@/lib/storage";
import type { ActionState } from "@/lib/validation/common";
import { expenseCategorySchema, gameTypeSchema, platformSchema, rateSchema, settingsSchema, stakeLevelSchema, venueSchema } from "@/lib/validation/schemas";

const preferencesSchema = settingsSchema.pick({ displayName: true, baseCurrency: true, timezone: true, weekStartsOn: true, enabledCurrencies: true, defaultAccountId: true });

export async function savePreferencesAction(_p: ActionState, fd: FormData) {
  return mutate(preferencesSchema, fd, (tx, input) => savePreferences(tx, input), "Preferences saved");
}

export async function saveRateAction(_p: ActionState, fd: FormData) {
  return mutate(rateSchema, fd, (tx, input) => saveRate(tx, input), "Rate saved");
}
export async function deleteRateAction(id: string): Promise<ActionState> {
  return mutateById(id, deleteRate, "Rate deleted");
}

const LIST_SCHEMAS = { venues: venueSchema, platforms: platformSchema, game_types: gameTypeSchema, stake_levels: stakeLevelSchema, expense_categories: expenseCategorySchema };
const bad = (): ActionState => ({ ok: false, ts: Date.now(), message: "Invalid list" });

export async function saveListItemAction(kind: string, _p: ActionState, fd: FormData) {
  if (!isListKind(kind)) return bad();
  const raw = fd.get("id");
  const id = typeof raw === "string" && isUuid(raw) ? raw : undefined;
  return mutate(LIST_SCHEMAS[kind], fd, (tx, input) => saveListItem(tx, kind, input as Record<string, string | undefined>, id), id ? "Saved" : "Added");
}
export async function archiveListItemAction(kind: string, id: string): Promise<ActionState> {
  if (!isListKind(kind)) return bad();
  return mutateById(id, (tx, i) => setListArchived(tx, kind, i, true), "Archived. It stays on past records but is hidden from pickers.");
}
export async function restoreListItemAction(kind: string, id: string): Promise<ActionState> {
  if (!isListKind(kind)) return bad();
  return mutateById(id, (tx, i) => setListArchived(tx, kind, i, false), "Back in your pickers");
}
export async function deleteListItemAction(kind: string, id: string): Promise<ActionState> {
  if (!isListKind(kind)) return bad();
  return mutateById(id, (tx, i) => deleteListItem(tx, kind, i), "Deleted");
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password").max(200),
    password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(200),
    confirm: z.string().max(200),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords do not match" })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "Choose a different password" });

const fail = (message: string, field?: string): ActionState => ({ ok: false, ts: Date.now(), message, fieldErrors: field ? { [field]: [message] } : undefined });

export async function changePasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse({ current: fd.get("current"), password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Invalid input", String(issue?.path[0] ?? ""));
  }
  const key = `password:${user.id}`;
  if (isRateLimited(key)) return fail("Too many attempts. Try again in 15 minutes.");
  const result = await changePassword(user, parsed.data.current, parsed.data.password);
  if (result === "wrong-password") {
    recordFailure(key);
    return fail("That is not your current password.", "current");
  }
  if (result === "rejected") return fail("Supabase rejected the new password. Try a stronger one.", "password");
  clearFailures(key);
  if (env().AUTH_PROVIDER === "local") {
    // Every local session (including this one) was revoked; sign in again.
    await clearSessionCookie();
    redirect("/login?notice=password-changed");
  }
  return { ok: true, ts: Date.now(), message: "Password changed" };
}

export async function deleteAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (fd.get("confirmText") !== "DELETE") return fail('Type DELETE in capitals to confirm.', "confirmText");
  const password = fd.get("password");
  if (typeof password !== "string" || !password) return fail("Enter your password.", "password");
  const key = `delete:${user.id}`;
  if (isRateLimited(key)) return fail("Too many attempts. Try again in 15 minutes.");
  if (!(await checkPassword(user, password))) {
    recordFailure(key);
    return fail("That password is not correct.", "password");
  }
  // Collect file paths first: the rows disappear with the user.
  const files = await withUser(user.id, (tx) => tx<{ storagePath: string }[]>`select storage_path from attachments`);
  try {
    await deleteUser(user);
  } catch (e) {
    console.error("[settings] account deletion failed:", e instanceof Error ? e.message : typeof e);
    return fail("Could not delete the account. Nothing was removed. Try again later.");
  }
  await Promise.all(files.map((f) => getStorage().remove(f.storagePath).catch(() => {})));
  clearFailures(key);
  if (env().AUTH_PROVIDER === "supabase") {
    // The user no longer exists; clear the auth cookies locally.
    const store = await cookies();
    for (const c of store.getAll()) if (c.name.startsWith("sb-")) store.delete(c.name);
    await (await supabaseServerClient()).auth.signOut({ scope: "local" }).catch(() => {});
  } else {
    await clearSessionCookie();
  }
  redirect("/login?notice=account-deleted");
}
