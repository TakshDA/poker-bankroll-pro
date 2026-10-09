import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { getWorkspace } from "@/lib/server/workspace";
import { sp, validDate } from "@/lib/server/search-params";
import { TournamentForm } from "../tournament-form";
import { newTournamentValues, tournamentFormOptions } from "../form-values";

export const metadata = { title: "Log tournament" };

export default async function NewTournamentPage({ searchParams }: PageProps<"/tournaments/new">) {
  const date = validDate(sp(await searchParams).date);
  const ws = await getWorkspace();
  const opts = tournamentFormOptions(ws);
  return (
    <>
      <PageHeader title="Log tournament" description="Record buy-ins, re-entries, playing days and your result. Multi-day events are one tournament." />
      {opts.accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="Create a bankroll account first"
          description="Every tournament is booked to an account."
          action={
            <Button asChild>
              <Link href="/bankroll?new=account">Create account</Link>
            </Button>
          }
        />
      ) : (
        <TournamentForm values={{ ...newTournamentValues(ws), ...(date ? { startDate: date } : {}) }} {...opts} />
      )}
    </>
  );
}
