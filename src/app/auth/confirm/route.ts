import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServerClient } from "@/lib/auth";
import { env } from "@/lib/server/env";

const OTP_TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

/** A fixed list of destinations, so an emailed link can never bounce users to another site. */
const NEXT_PATHS = new Set(["/", "/reset-password"]);
function safeNext(next: string | null): string {
  return next && NEXT_PATHS.has(next) ? next : "/";
}

/**
 * Landing page for links in Supabase emails (confirm sign-up, reset password).
 * Handles both the default PKCE link (`?code=`) and the token-hash link
 * (`?token_hash=&type=`) used by custom email templates.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?notice=${reason}`, url.origin));
  if (env().AUTH_PROVIDER !== "supabase") return fail("link-invalid");

  const supabase = await supabaseServerClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // The email is already confirmed by the time Supabase redirects here; a
    // failed exchange usually means the link was opened in another browser.
    if (error) return fail(next === "/reset-password" ? "reset-other-browser" : "confirmed-sign-in");
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail("link-invalid");
  } else {
    return fail("link-invalid");
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
