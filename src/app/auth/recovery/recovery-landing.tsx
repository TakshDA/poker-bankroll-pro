"use client";
import { useEffect, useRef } from "react";
import { startRecoverySession } from "./actions";

/** Reads the session tokens Supabase puts after `#` in the reset link, then opens the new-password page. */
export function RecoveryLanding() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // Keep the tokens out of the address bar and browser history.
    window.history.replaceState(null, "", window.location.pathname);
    const fail = () => window.location.replace("/login?notice=link-invalid");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken || hash.get("type") !== "recovery") return fail();
    startRecoverySession({ accessToken, refreshToken })
      .then((r) => (r.ok ? window.location.replace("/reset-password") : fail()))
      .catch(fail);
  }, []);
  return <p className="text-center text-sm opacity-70">Opening the reset page…</p>;
}
