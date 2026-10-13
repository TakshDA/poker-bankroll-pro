import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  ALLOW_SIGNUP: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  STORAGE_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  ATTACHMENTS_DIR: z.string().default(".data/attachments"),
  SUPABASE_BUCKET: z.string().default("attachments"),
  NODE_ENV: z.string().default("development"),
  /** Public URL used in emailed links, e.g. https://poker-bankroll-pro.vercel.app. Falls back to the request host. */
  SITE_URL: z.url().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server-side configuration. Never import from client code. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names only, never values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration: ${names}`);
  }
  const e = parsed.data;
  if ((e.AUTH_PROVIDER === "supabase" || e.STORAGE_PROVIDER === "supabase") && (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    throw new Error("Supabase is selected but NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set");
  }
  cached = e;
  return e;
}
