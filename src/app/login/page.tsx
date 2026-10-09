import { redirect } from "next/navigation";
import { Spade } from "lucide-react";
import { alreadySignedIn, signupAllowed } from "./actions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await alreadySignedIn()) redirect("/");
  const canSignUp = await signupAllowed();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-gold/30 bg-gold-soft text-gold">
            <Spade className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Poker Bankroll Pro</h1>
            <p className="mt-1 text-sm text-fg-muted">Private bankroll tracking for live and online poker</p>
          </div>
        </div>
        <LoginForm canSignUp={canSignUp} />
      </div>
    </main>
  );
}
