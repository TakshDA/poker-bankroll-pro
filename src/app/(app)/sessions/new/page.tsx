import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getWorkspace } from "@/lib/server/workspace";
import { SessionForm } from "../session-form";
import { formOptions, newSessionValues } from "../form-values";

export const metadata = { title: "Log cash session" };

export default async function NewSessionPage() {
  const ws = await getWorkspace();
  const opts = formOptions(ws);
  return (
    <>
      <PageHeader title="Log cash session" description="Record a live or online cash game. Drafts can be finished later." />
      {opts.accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="Create a bankroll account first"
          description="Every session is booked to an account (for example “Live CAD” or “Online USD”)."
          action={
            <Button asChild>
              <Link href="/bankroll?new=account">Create account</Link>
            </Button>
          }
        />
      ) : (
        <SessionForm values={newSessionValues(ws)} {...opts} />
      )}
    </>
  );
}
