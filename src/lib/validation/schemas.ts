import { z } from "zod";
import {
  checkbox,
  dateString,
  moneyString,
  optionalDate,
  optionalInt,
  optionalMoney,
  optionalText,
  optionalTime,
  optionalUuid,
  requiredText,
  timeString,
  uuid,
} from "./common";

export const playSetting = z.enum(["live_casino", "online", "private_game", "home_game"], { error: "Choose where you played" });
export const tableFormat = z.enum(["heads_up", "short_handed", "six_max", "full_ring", "other"]);
export const recordStatus = z.enum(["draft", "completed", "cancelled"]);
export const tournamentStatus = z.enum(["draft", "in_progress", "completed", "cancelled"]);
export const tournamentFormat = z.enum(["mtt", "sit_and_go", "satellite", "spin", "other"]);
export const tournamentSpeed = z.enum(["regular", "turbo", "hyper", "deep", "other"]);
export const transactionType = z.enum(["deposit", "withdrawal", "bonus", "rakeback", "adjustment"]);
export const currencyCode = z.string().regex(/^[A-Z]{3}$/, "Choose a currency");

export const cashSessionSchema = z
  .object({
    status: recordStatus,
    date: dateString,
    startTime: timeString,
    endTime: optionalTime,
    breakMinutes: optionalInt(0, 2000),
    setting: playSetting,
    accountId: uuid,
    gameTypeId: optionalUuid,
    variant: optionalText(80),
    venueId: optionalUuid,
    platformId: optionalUuid,
    newVenueName: optionalText(120),
    newPlatformName: optionalText(120),
    stakeLevelId: optionalUuid,
    smallBlind: optionalMoney,
    bigBlind: optionalMoney,
    straddle: optionalMoney,
    ante: optionalMoney,
    tableFormat: tableFormat.default("full_ring"),
    seats: optionalInt(2, 12),
    buyIn: optionalMoney,
    rebuys: optionalMoney,
    additional: optionalMoney,
    cashOut: optionalMoney,
    rake: optionalMoney,
    tips: optionalMoney,
    fees: optionalMoney,
    bonus: optionalMoney,
    rakeback: optionalMoney,
    handsPlayed: optionalInt(0, 100000),
    notes: optionalText(8000),
    tags: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.status === "completed") {
      if (!v.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time is required to complete a session" });
      if (!v.cashOut) ctx.addIssue({ code: "custom", path: ["cashOut"], message: "Cash-out is required to complete a session (enter 0 for a total loss)" });
      if (!v.buyIn) ctx.addIssue({ code: "custom", path: ["buyIn"], message: "Buy-in is required" });
    }
  });
export type CashSessionInput = z.infer<typeof cashSessionSchema>;

export const tournamentEntrySchema = z.object({
  buyIn: moneyString,
  fee: optionalMoney,
  rebuyCount: optionalInt(0, 100),
  rebuys: optionalMoney,
  addons: optionalMoney,
});

export const playPeriodSchema = z.object({
  date: dateString,
  startTime: timeString,
  endTime: optionalTime,
  breakMinutes: optionalInt(0, 2000),
  dayLabel: optionalText(40),
});

export const tournamentSchema = z
  .object({
    name: requiredText(160, "Tournament name"),
    status: tournamentStatus,
    setting: playSetting,
    format: tournamentFormat.default("mtt"),
    speed: tournamentSpeed.default("regular"),
    isBounty: checkbox,
    accountId: uuid,
    venueId: optionalUuid,
    platformId: optionalUuid,
    newVenueName: optionalText(120),
    newPlatformName: optionalText(120),
    gameTypeId: optionalUuid,
    startDate: dateString,
    endDate: optionalDate,
    fieldSize: optionalInt(1, 10_000_000),
    finishPosition: optionalInt(1, 10_000_000),
    payout: optionalMoney,
    bounties: optionalMoney,
    refund: optionalMoney,
    guarantee: optionalMoney,
    notes: optionalText(8000),
    tags: optionalText(1000),
    entries: z.array(tournamentEntrySchema).min(1, "Add at least one entry").max(100),
    periods: z.array(playPeriodSchema).max(30).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date cannot be before the start date" });
    if (v.fieldSize && v.finishPosition && v.finishPosition > v.fieldSize)
      ctx.addIssue({ code: "custom", path: ["finishPosition"], message: "Finishing position cannot exceed the number of entries" });
    if (v.refund && v.status !== "cancelled") ctx.addIssue({ code: "custom", path: ["refund"], message: "Refunds only apply to cancelled tournaments" });
  });
export type TournamentInput = z.infer<typeof tournamentSchema>;

export const accountSchema = z.object({
  name: requiredText(80, "Name"),
  currency: currencyCode,
  categoryId: optionalUuid,
  openingBalance: moneyString.default("0"),
  openingDate: dateString,
  minBalance: optionalMoney,
  goalBalance: optionalMoney,
  notes: optionalText(4000),
});
export type AccountInput = z.infer<typeof accountSchema>;

export const transactionSchema = z.object({
  accountId: uuid,
  type: transactionType,
  amount: moneyString,
  occurredOn: dateString,
  description: optionalText(500),
  reference: optionalText(120),
});
export type TransactionInput = z.infer<typeof transactionSchema>;

export const transferSchema = z
  .object({
    fromAccountId: uuid,
    toAccountId: uuid,
    fromAmount: moneyString,
    toAmount: optionalMoney,
    occurredOn: dateString,
    description: optionalText(500),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, { path: ["toAccountId"], message: "Choose two different accounts" });
export type TransferInput = z.infer<typeof transferSchema>;

export const expenseSchema = z.object({
  accountId: uuid,
  categoryId: uuid,
  amount: moneyString,
  refunded: optionalMoney,
  occurredOn: dateString,
  description: optionalText(500),
  vendor: optionalText(120),
  sessionId: optionalUuid,
  tournamentId: optionalUuid,
  venueId: optionalUuid,
  confirmDuplicate: checkbox,
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const settingsSchema = z.object({
  displayName: optionalText(80),
  baseCurrency: currencyCode,
  timezone: z.string().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
  enabledCurrencies: z.array(currencyCode).min(1, "Enable at least one currency").max(20),
  defaultAccountId: optionalUuid,
  cashBuyInsRequired: z.coerce.number().int().min(1).max(1000),
  cashBuyInBigBlinds: z.coerce.number().int().min(1).max(1000),
  tournamentBuyInsRequired: z.coerce.number().int().min(1).max(10000),
  cooldownMinutes: z.coerce.number().int().min(0).max(1440),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const rateSchema = z
  .object({
    baseCurrency: currencyCode,
    quoteCurrency: currencyCode,
    rate: z.string().trim().regex(/^\d{1,10}(\.\d{1,10})?$/, "Enter a positive decimal rate (up to 10 decimals)").refine((r) => Number(r) > 0, "Rate must be greater than zero"),
    effectiveDate: dateString,
    source: optionalText(120),
  })
  .refine((v) => v.baseCurrency !== v.quoteCurrency, { path: ["quoteCurrency"], message: "Choose two different currencies" });
export type RateInput = z.infer<typeof rateSchema>;

export const venueSchema = z.object({
  name: requiredText(120, "Name"),
  kind: z.enum(["casino", "card_room", "private_club", "home", "other"]).default("casino"),
  city: optionalText(120),
  region: optionalText(120),
  country: optionalText(120),
  notes: optionalText(4000),
});
export const platformSchema = z.object({ name: requiredText(120, "Name"), website: optionalText(300), notes: optionalText(4000) });
export const gameTypeSchema = z.object({
  name: requiredText(80, "Name"),
  shortName: optionalText(16),
  bettingStructure: z.enum(["no_limit", "pot_limit", "fixed_limit", "spread_limit", "mixed", "other"]).default("no_limit"),
});
export const stakeLevelSchema = z.object({
  label: optionalText(60),
  currency: currencyCode,
  smallBlind: moneyString,
  bigBlind: moneyString,
  straddle: optionalMoney,
  ante: optionalMoney,
});
export const nameOnlySchema = z.object({ name: requiredText(60, "Name") });
export const expenseCategorySchema = z.object({
  name: requiredText(60, "Name"),
  kind: z.enum(["travel", "accommodation", "food", "parking", "coaching", "training", "software", "equipment", "membership", "other"]),
});

export const goalSchema = z.object({
  name: requiredText(120, "Name"),
  kind: z.enum(["profit", "hours", "expense_budget", "max_session_loss", "daily_loss_limit", "min_bankroll", "session_count"]),
  period: z.enum(["per_session", "daily", "weekly", "monthly", "yearly", "custom"]),
  target: optionalMoney,
  targetHours: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().positive("Must be greater than 0").max(100000).optional()),
  targetCount: optionalInt(1, 100000),
  currency: z.preprocess((v) => (v === "" ? undefined : v), currencyCode.optional()),
  accountId: optionalUuid,
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalText(2000),
});
export type GoalInput = z.infer<typeof goalSchema>;

export const plannedSessionSchema = z.object({
  plannedDate: dateString,
  startTime: optionalTime,
  kind: z.enum(["cash", "tournament"]),
  setting: playSetting,
  title: optionalText(160),
  venueId: optionalUuid,
  platformId: optionalUuid,
  gameTypeId: optionalUuid,
  stakeLevelId: optionalUuid,
  notes: optionalText(4000),
  reminderMinutesBefore: optionalInt(0, 10080),
});
export type PlannedSessionInput = z.infer<typeof plannedSessionSchema>;

export const noteSchema = z.object({ noteDate: dateString, title: optionalText(160), body: requiredText(8000, "Note") });
