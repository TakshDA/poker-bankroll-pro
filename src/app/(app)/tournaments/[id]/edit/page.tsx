import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/misc";
import { getTournament } from "@/lib/data/tournaments";
import { isUuid } from "@/lib/server/db";
import { getWorkspace, readAsUser } from "@/lib/server/workspace";
import { TournamentForm } from "../../tournament-form";
import { tournamentFormOptions, tournamentToValues } from "../../form-values";

export const metadata = { title: "Edit tournament" };

export default async function EditTournamentPage({ params }: PageProps<"/tournaments/[id]/edit">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [ws, t] = await Promise.all([getWorkspace(), readAsUser((tx) => getTournament(tx, id))]);
  if (!t) notFound();
  const currency = ws.dataset.accounts.find((a) => a.id === t.accountId)?.currency ?? "CAD";
  return (
    <>
      <PageHeader title="Edit tournament" description="Changes recalculate every dependent statistic and balance." />
      <TournamentForm values={tournamentToValues(t, currency, ws.settings.timezone)} {...tournamentFormOptions(ws, [t.accountId, t.venueId, t.platformId, t.gameTypeId])} />
    </>
  );
}
