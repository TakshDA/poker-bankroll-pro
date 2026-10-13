import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/misc";
import { sp } from "@/lib/server/search-params";
import { env } from "@/lib/server/env";
import { alreadySignedIn, signupAllowed } from "./actions";
import { AuthShell } from "./auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const NOTICES: Record<string, { tone: "positive" | "warning"; text: string }> = {
  "confirmed-sign-in": { tone: "positive", text: "If you just confirmed your email, sign in to continue." },
  "reset-other-browser": { tone: "warning", text: "Open the reset link in the same browser you requested it from, or request a new one." },
  "account-deleted": { tone: "positive", text: "Your account and all of its data have been deleted." },
  "password-changed": { tone: "positive", text: "Password changed. Sign in with your new password." },
  "link-invalid": { tone: "warning", text: "That link is invalid or has expired. Sign in, or request a new link." },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await alreadySignedIn()) redirect("/");
  const params = sp(await searchParams);
  const notice = NOTICES[params.notice ?? ""];
  const canSignUp = await signupAllowed();
  const supabase = env().AUTH_PROVIDER === "supabase";
  return (
    <AuthShell subtitle="Bankroll tracking for live and online poker">
      {notice ? (
        <Alert tone={notice.tone} className="mb-4">
          {notice.text}
        </Alert>
      ) : null}
      <LoginForm canSignUp={canSignUp} openSignup={supabase} canReset={supabase} />
    </AuthShell>
  );
}
