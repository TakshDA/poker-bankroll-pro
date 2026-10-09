import type { Tx } from "../server/db";
import { resolveSessionTimes, todayIn } from "../finance/dates";
import { FieldError, parseTagList, toMinor, toMinorOrNull } from "../validation/common";
import type { CashSessionInput } from "../validation/schemas";
import { assertOwned, NotFoundError, requireAccount, resolvePlace, upsertTags } from "./common";
import { getSettings } from "./workspace";

/** Validate business rules, convert money, and write a cash session. */
export async function saveCashSession(tx: Tx, input: CashSessionInput, existingId?: string): Promise<string> {
  const settings = await getSettings(tx);
  const account = await requireAccount(tx, input.accountId);
  const cur = account.currency;

  await assertOwned(tx, "game_types", input.gameTypeId, "gameTypeId");
  const place = await resolvePlace(tx, input.setting, input);

  let smallBlind = toMinorOrNull(input.smallBlind, cur, "smallBlind");
  let bigBlind = toMinorOrNull(input.bigBlind, cur, "bigBlind");
  let straddle = toMinorOrNull(input.straddle, cur, "straddle");
  let ante = toMinorOrNull(input.ante, cur, "ante");
  if (input.stakeLevelId) {
    const stake = (
      await tx<{ currency: string; smallBlindMinor: number; bigBlindMinor: number; straddleMinor: number | null; anteMinor: number | null }[]>`
        select currency, small_blind_minor, big_blind_minor, straddle_minor, ante_minor from stake_levels where id = ${input.stakeLevelId}`
    )[0];
    if (!stake) throw new FieldError("stakeLevelId", "Stake level not found");
    if (stake.currency.trim() !== cur) throw new FieldError("stakeLevelId", `This stake level is in ${stake.currency}, but the account is in ${cur}`);
    smallBlind ??= stake.smallBlindMinor;
    bigBlind ??= stake.bigBlindMinor;
    straddle ??= stake.straddleMinor;
    ante ??= stake.anteMinor;
  }
  if (bigBlind !== null && bigBlind <= 0) throw new FieldError("bigBlind", "Big blind must be greater than zero");
  if (smallBlind !== null && bigBlind !== null && smallBlind > bigBlind) throw new FieldError("smallBlind", "Small blind cannot exceed the big blind");

  const times = resolveSessionTimes(input.date, input.startTime, input.endTime, settings.timezone);
  const breakMinutes = input.breakMinutes ?? 0;
  if (times.endedAt) {
    const span = (Date.parse(times.endedAt) - Date.parse(times.startedAt)) / 60000;
    if (span > 96 * 60) throw new FieldError("endTime", "A session cannot be longer than 96 hours");
    if (breakMinutes >= span) throw new FieldError("breakMinutes", "Breaks must be shorter than the session");
  }

  const money = {
    buyInMinor: toMinor(input.buyIn, cur, "buyIn"),
    rebuysMinor: toMinor(input.rebuys, cur, "rebuys"),
    additionalMinor: toMinor(input.additional, cur, "additional"),
    cashOutMinor: toMinorOrNull(input.cashOut, cur, "cashOut"),
    rakeMinor: toMinor(input.rake, cur, "rake"),
    tipsMinor: toMinor(input.tips, cur, "tips"),
    feesMinor: toMinor(input.fees, cur, "fees"),
    bonusMinor: toMinor(input.bonus, cur, "bonus"),
    rakebackMinor: toMinor(input.rakeback, cur, "rakeback"),
  };
  if (input.status === "completed" && money.cashOutMinor === null) throw new FieldError("cashOut", "Cash-out is required to complete a session");

  const sessionRow = {
    kind: "cash",
    status: input.status,
    setting: input.setting,
    gameTypeId: input.gameTypeId ?? null,
    variant: input.variant ?? null,
    venueId: place.venueId,
    platformId: place.platformId,
    startedAt: times.startedAt,
    endedAt: times.endedAt,
    breakMinutes,
    notes: input.notes ?? null,
  };
  const detailRow = {
    accountId: account.id,
    stakeLevelId: input.stakeLevelId ?? null,
    smallBlindMinor: smallBlind,
    bigBlindMinor: bigBlind,
    straddleMinor: straddle,
    anteMinor: ante,
    tableFormat: input.tableFormat,
    seats: input.seats ?? null,
    handsPlayed: input.handsPlayed ?? null,
    ...money,
  };

  let id: string;
  if (existingId) {
    const updated = await tx<{ id: string }[]>`
      update sessions set ${tx(sessionRow)} where id = ${existingId} and kind = 'cash' and deleted_at is null returning id`;
    if (!updated[0]) throw new NotFoundError("Session not found");
    id = existingId;
    await tx`update cash_game_details set ${tx(detailRow)} where session_id = ${id}`;
  } else {
    id = (await tx<{ id: string }[]>`insert into sessions ${tx(sessionRow)} returning id`)[0].id;
    await tx`insert into cash_game_details ${tx({ sessionId: id, ...detailRow })}`;
  }

  const tagIds = await upsertTags(tx, parseTagList(input.tags));
  await tx`delete from session_tags where session_id = ${id}`;
  for (const tagId of tagIds) await tx`insert into session_tags (session_id, tag_id) values (${id}, ${tagId})`;
  return id;
}

/**
 * Duplicate a session as a new DRAFT dated today (same game, stakes, venue,
 * buy-in and times; cash-out, extras and notes cleared) for quick logging.
 */
export async function duplicateCashSession(tx: Tx, id: string): Promise<string> {
  const settings = await getSettings(tx);
  const rows = await tx<{ startedAt: string; endedAt: string | null }[]>`
    select started_at, ended_at from sessions where id = ${id} and kind = 'cash' and deleted_at is null`;
  const src = rows[0];
  if (!src) throw new NotFoundError("Session not found");
  const startLocal = new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(src.startedAt));
  const times = resolveSessionTimes(todayIn(settings.timezone), startLocal, null, settings.timezone);
  const newId = (
    await tx<{ id: string }[]>`
      insert into sessions (kind, status, setting, game_type_id, variant, venue_id, platform_id, started_at, break_minutes)
      select kind, 'draft', setting, game_type_id, variant, venue_id, platform_id, ${times.startedAt}, 0
      from sessions where id = ${id}
      returning id`
  )[0].id;
  await tx`
    insert into cash_game_details (session_id, account_id, stake_level_id, small_blind_minor, big_blind_minor, straddle_minor,
                                   ante_minor, table_format, seats, buy_in_minor)
    select ${newId}, account_id, stake_level_id, small_blind_minor, big_blind_minor, straddle_minor, ante_minor, table_format, seats, buy_in_minor
    from cash_game_details where session_id = ${id}`;
  await tx`insert into session_tags (session_id, tag_id) select ${newId}, tag_id from session_tags where session_id = ${id}`;
  return newId;
}

export async function softDeleteSession(tx: Tx, id: string): Promise<void> {
  const r = await tx`update sessions set deleted_at = now() where id = ${id} and deleted_at is null and kind = 'cash' returning id`;
  if (r.length === 0) throw new NotFoundError("Session not found");
}

export interface CashSessionDetail {
  id: string;
  status: string;
  setting: string;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  gameTypeId: string | null;
  variant: string | null;
  venueId: string | null;
  platformId: string | null;
  notes: string | null;
  accountId: string;
  stakeLevelId: string | null;
  smallBlindMinor: number | null;
  bigBlindMinor: number | null;
  straddleMinor: number | null;
  anteMinor: number | null;
  tableFormat: string;
  seats: number | null;
  buyInMinor: number;
  rebuysMinor: number;
  additionalMinor: number;
  cashOutMinor: number | null;
  rakeMinor: number;
  tipsMinor: number;
  feesMinor: number;
  bonusMinor: number;
  rakebackMinor: number;
  handsPlayed: number | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export async function getCashSession(tx: Tx, id: string): Promise<CashSessionDetail | null> {
  const rows = await tx<Omit<CashSessionDetail, "tags">[]>`
    select s.id, s.status, s.setting, s.started_at, s.ended_at, s.break_minutes, s.game_type_id, s.variant, s.venue_id,
           s.platform_id, s.notes, s.created_at, s.updated_at,
           d.account_id, d.stake_level_id, d.small_blind_minor, d.big_blind_minor, d.straddle_minor, d.ante_minor,
           d.table_format, d.seats, d.buy_in_minor, d.rebuys_minor, d.additional_minor, d.cash_out_minor, d.rake_minor,
           d.tips_minor, d.fees_minor, d.bonus_minor, d.rakeback_minor, d.hands_played
    from sessions s join cash_game_details d on d.session_id = s.id
    where s.id = ${id} and s.kind = 'cash' and s.deleted_at is null`;
  if (!rows[0]) return null;
  const tags = await tx<{ name: string }[]>`select t.name from session_tags st join tags t on t.id = st.tag_id where st.session_id = ${id} order by lower(t.name)`;
  return { ...rows[0], tags: tags.map((t) => t.name) };
}
