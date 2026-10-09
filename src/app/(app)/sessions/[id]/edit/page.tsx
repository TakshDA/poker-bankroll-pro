import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/misc";
import { getCashSession } from "@/lib/data/sessions";
import { isUuid } from "@/lib/server/db";
import { getWorkspace, readAsUser } from "@/lib/server/workspace";
import { SessionForm } from "../../session-form";
import { detailToValues, formOptions } from "../../form-values";

export const metadata = { title: "Edit session" };

export default async function EditSessionPage({ params }: PageProps<"/sessions/[id]/edit">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [ws, s] = await Promise.all([getWorkspace(), readAsUser((tx) => getCashSession(tx, id))]);
  if (!s) notFound();
  const currency = ws.dataset.accounts.find((a) => a.id === s.accountId)?.currency ?? "CAD";
  return (
    <>
      <PageHeader title="Edit session" description="Changes recalculate every dependent statistic and balance." />
      <SessionForm values={detailToValues(s, currency, ws.settings.timezone)} {...formOptions(ws, [s.accountId, s.venueId, s.platformId, s.gameTypeId, s.stakeLevelId])} />
    </>
  );
}
