"use client";
import { useEffect } from "react";

/**
 * If Supabase sends a reset link to the Site URL instead of /auth/recovery
 * (for example when the redirect URL is not on its allow list), the tokens
 * arrive after `#` on whatever page loads. Pass them on to /auth/recovery.
 */
export function RecoveryHashForwarder() {
  useEffect(() => {
    const { hash, pathname } = window.location;
    if (pathname !== "/auth/recovery" && hash.includes("access_token=") && hash.includes("type=recovery")) {
      window.location.replace(`/auth/recovery${hash}`);
    }
  }, []);
  return null;
}
