"use server";
import { z } from "zod";
import { supabaseServerClient } from "@/lib/auth";
import { env } from "@/lib/server/env";

const tokens = z.object({ accessToken: z.string().min(1).max(4096), refreshToken: z.string().min(1).max(512) });

/**
 * Turns the tokens from a password-reset link into a cookie session, so the
 * link works in any browser (the default PKCE link only works in the browser
 * that asked for it). Supabase checks the tokens; nothing here trusts them.
 */
export async function startRecoverySession(input: { accessToken: string; refreshToken: string }): Promise<{ ok: boolean }> {
  if (env().AUTH_PROVIDER !== "supabase") return { ok: false };
  const parsed = tokens.safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await supabaseServerClient();
  const { data, error } = await supabase.auth.setSession({ access_token: parsed.data.accessToken, refresh_token: parsed.data.refreshToken });
  return { ok: !error && data.session !== null };
}
