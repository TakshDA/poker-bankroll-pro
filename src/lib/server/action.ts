import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodType } from "zod";
import { requireUser } from "../auth";
import { BusinessRuleError, friendlyDbError, NotFoundError } from "../data/common";
import { DuplicateExpenseError } from "../data/money-records";
import { FieldError, formDataToObject, zodFieldErrors, type ActionState } from "../validation/common";
import { withUser, type Tx } from "./db";

/** Convert any thrown error into a safe, user-facing ActionState. */
export function toActionState(e: unknown): ActionState {
  unstable_rethrow(e);
  const ts = Date.now();
  if (e instanceof FieldError) return { ok: false, ts, message: e.message, fieldErrors: { [e.field]: [e.message] } };
  if (e instanceof ZodError) return { ok: false, ts, message: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(e) };
  if (e instanceof NotFoundError || e instanceof BusinessRuleError || e instanceof DuplicateExpenseError) {
    return { ok: false, ts, message: e.message, fieldErrors: e instanceof DuplicateExpenseError ? { confirmDuplicate: [e.message] } : undefined };
  }
  const friendly = friendlyDbError(e);
  if (friendly) return { ok: false, ts, message: friendly };
  // Log the error class/code only: never request bodies or financial values.
  const code = (e as { code?: string })?.code;
  console.error(`[action] unexpected error${code ? ` (${code})` : ""}:`, e instanceof Error ? e.name : typeof e);
  return { ok: false, ts, message: "Something went wrong. Your changes were not saved." };
}

/**
 * Standard server action pipeline: authenticate, validate with Zod, run the
 * mutation as the user (RLS), revalidate the whole app so every dependent
 * metric is recomputed, and translate errors.
 */
export async function mutate<S extends ZodType>(
  schema: S,
  formData: FormData | Record<string, unknown>,
  run: (tx: Tx, input: ReturnType<S["parse"]>) => Promise<string | void>,
  successMessage = "Saved",
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const raw = formData instanceof FormData ? formDataToObject(formData) : formData;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return toActionState(parsed.error);
    const id = await withUser(user.id, (tx) => run(tx, parsed.data as ReturnType<S["parse"]>));
    revalidatePath("/", "layout");
    return { ok: true, ts: Date.now(), message: successMessage, id: id ?? undefined };
  } catch (e) {
    return toActionState(e);
  }
}

/** Run a simple id-based mutation (delete/restore/archive). */
export async function mutateById(id: unknown, run: (tx: Tx, id: string) => Promise<unknown>, successMessage: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, ts: Date.now(), message: "Invalid record" };
    await withUser(user.id, (tx) => run(tx, id));
    revalidatePath("/", "layout");
    return { ok: true, ts: Date.now(), message: successMessage };
  } catch (e) {
    return toActionState(e);
  }
}
