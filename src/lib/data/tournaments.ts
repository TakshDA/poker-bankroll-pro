import type { Tx } from "../server/db";
import { resolveSessionTimes } from "../finance/dates";
import { FieldError, parseTagList, toMinor, toMinorOrNull } from "../validation/common";
import type { TournamentInput } from "../validation/schemas";
import { assertOwned, NotFoundError, requireAccount, resolvePlace, upsertTags } from "./common";
import { getSettings } from "./workspace";

export async function saveTournament(tx: Tx, input: TournamentInput, existingId?: string): Promise<string> {
  const settings = await getSettings(tx);
  const account = await requireAccount(tx, input.accountId);
  const cur = account.currency;
  await assertOwned(tx, "game_types", input.gameTypeId, "gameTypeId");
  const place = await resolvePlace(tx, input.setting, input);

  const entries = input.entries.map((e, i) => ({
    entryNumber: i + 1,
    buyInMinor: toMinor(e.buyIn, cur, `entries.${i}.buyIn`, { required: true }),
    feeMinor: toMinor(e.fee, cur, `entries.${i}.fee`),
    rebuyCount: e.rebuyCount ?? 0,
    rebuysMinor: toMinor(e.rebuys, cur, `entries.${i}.rebuys`),
    addonsMinor: toMinor(e.addons, cur, `entries.${i}.addons`),
  }));

  const periods = input.periods.map((p, i) => {
    const t = resolveSessionTimes(p.date, p.startTime, p.endTime, settings.timezone);
    const brk = p.breakMinutes ?? 0;
    if (t.endedAt) {
      const span = (Date.parse(t.endedAt) - Date.parse(t.startedAt)) / 60000;
      if (brk >= span) throw new FieldError(`periods.${i}.breakMinutes`, "Breaks must be shorter than the day");
    }
    if (p.date < input.startDate) throw new FieldError(`periods.${i}.date`, "A playing day cannot be before the tournament start date");
    return { ...t, breakMinutes: brk, dayLabel: p.dayLabel ?? (input.periods.length > 1 ? `Day ${i + 1}` : null) };
  });

  const row = {
    name: input.name,
    status: input.status,
    setting: input.setting,
    format: input.format,
    speed: input.speed,
    isBounty: input.isBounty,
    accountId: account.id,
    venueId: place.venueId,
    platformId: place.platformId,
    gameTypeId: input.gameTypeId ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    fieldSize: input.fieldSize ?? null,
    finishPosition: input.finishPosition ?? null,
    payoutMinor: toMinor(input.payout, cur, "payout"),
    bountiesMinor: toMinor(input.bounties, cur, "bounties"),
    refundMinor: input.status === "cancelled" ? toMinor(input.refund, cur, "refund") : 0,
    guaranteeMinor: toMinorOrNull(input.guarantee, cur, "guarantee"),
    notes: input.notes ?? null,
  };

  let id: string;
  if (existingId) {
    const r = await tx<{ id: string }[]>`update tournaments set ${tx(row)} where id = ${existingId} and deleted_at is null returning id`;
    if (!r[0]) throw new NotFoundError("Tournament not found");
    id = existingId;
    await tx`delete from tournament_entries where tournament_id = ${id}`;
    await tx`delete from sessions where tournament_id = ${id}`;
  } else {
    id = (await tx<{ id: string }[]>`insert into tournaments ${tx(row)} returning id`)[0].id;
  }
  for (const e of entries) await tx`insert into tournament_entries ${tx({ tournamentId: id, ...e })}`;
  for (const p of periods) {
    const periodStatus = p.endedAt ? "completed" : "draft";
    await tx`
      insert into sessions ${tx({
        kind: "tournament",
        status: periodStatus,
        setting: input.setting,
        gameTypeId: input.gameTypeId ?? null,
        venueId: row.venueId,
        platformId: row.platformId,
        tournamentId: id,
        dayLabel: p.dayLabel,
        startedAt: p.startedAt,
        endedAt: p.endedAt,
        breakMinutes: p.breakMinutes,
      })}`;
  }
  const tagIds = await upsertTags(tx, parseTagList(input.tags));
  await tx`delete from tournament_tags where tournament_id = ${id}`;
  for (const tagId of tagIds) await tx`insert into tournament_tags (tournament_id, tag_id) values (${id}, ${tagId})`;
  return id;
}

export async function softDeleteTournament(tx: Tx, id: string): Promise<void> {
  const r = await tx`update tournaments set deleted_at = now() where id = ${id} and deleted_at is null returning id`;
  if (r.length === 0) throw new NotFoundError("Tournament not found");
}

export interface TournamentDetail {
  id: string;
  name: string;
  status: string;
  setting: string;
  format: string;
  speed: string;
  isBounty: boolean;
  accountId: string;
  venueId: string | null;
  platformId: string | null;
  gameTypeId: string | null;
  startDate: string;
  endDate: string | null;
  fieldSize: number | null;
  finishPosition: number | null;
  payoutMinor: number;
  bountiesMinor: number;
  refundMinor: number;
  guaranteeMinor: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  entries: { entryNumber: number; buyInMinor: number; feeMinor: number; rebuyCount: number; rebuysMinor: number; addonsMinor: number }[];
  periods: { id: string; status: string; startedAt: string; endedAt: string | null; breakMinutes: number; dayLabel: string | null }[];
  tags: string[];
}

export async function getTournament(tx: Tx, id: string): Promise<TournamentDetail | null> {
  const rows = await tx<Omit<TournamentDetail, "entries" | "periods" | "tags">[]>`
    select id, name, status, setting, format, speed, is_bounty, account_id, venue_id, platform_id, game_type_id, start_date,
           end_date, field_size, finish_position, payout_minor, bounties_minor, refund_minor, guarantee_minor, notes, created_at, updated_at
    from tournaments where id = ${id} and deleted_at is null`;
  if (!rows[0]) return null;
  const [entries, periods, tags] = await Promise.all([
    tx<TournamentDetail["entries"]>`select entry_number, buy_in_minor, fee_minor, rebuy_count, rebuys_minor, addons_minor from tournament_entries where tournament_id = ${id} order by entry_number`,
    tx<TournamentDetail["periods"]>`select id, status, started_at, ended_at, break_minutes, day_label from sessions where tournament_id = ${id} and deleted_at is null order by started_at`,
    tx<{ name: string }[]>`select t.name from tournament_tags tt join tags t on t.id = tt.tag_id where tt.tournament_id = ${id} order by lower(t.name)`,
  ]);
  return { ...rows[0], entries, periods, tags: tags.map((t) => t.name) };
}
