import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate: send visitors without any session cookie to /login.
 * This is NOT the security boundary — every page, action and route handler
 * re-validates the session server-side (requireUser) and the database
 * enforces Row Level Security.
 */
export function proxy(request: NextRequest) {
  const hasLocal = request.cookies.has("pbp_session");
  const hasSupabase = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasLocal && !hasSupabase) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
