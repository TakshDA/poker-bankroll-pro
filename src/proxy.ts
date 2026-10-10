import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Pages anyone may open without signing in. */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/confirm"];

/**
 * Optimistic gate: send visitors without a session to /login, and (with
 * Supabase Auth) refresh the session cookies before they expire.
 * This is NOT the security boundary — every page, action and route handler
 * re-validates the session server-side (requireUser) and the database
 * enforces Row Level Security.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  let response = NextResponse.next({ request });
  let signedIn = request.cookies.has("pbp_session");

  const hasSupabase = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token") && !c.name.endsWith("code-verifier"));
  if (process.env.AUTH_PROVIDER === "supabase" && hasSupabase) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    // Validates the token with Supabase Auth and refreshes it when needed.
    const { data } = await supabase.auth.getUser();
    signedIn = data.user !== null;
  }

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
