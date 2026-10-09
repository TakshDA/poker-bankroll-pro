import { localDate, localTime, todayIn } from "@/lib/finance/dates";
import type { TournamentDetail } from "@/lib/data/tournaments";
import type { Workspace } from "@/lib/data/workspace";
import { moneyInput } from "@/lib/format";
import type { TournamentFormProps, TournamentFormValues } from "./tournament-form";

export function tournamentFormOptions(ws: Workspace, includeIds: (string | null)[] = []): Omit<TournamentFormProps, "values"> {
  const keep = (x: { id: string; archivedAt?: string | null }) => !x.archivedAt || includeIds.includes(x.id);
  return {
    accounts: ws.dataset.accounts.filter((a) => !a.archived || includeIds.includes(a.id)).map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    gameTypes: ws.gameTypes.filter(keep).map((g) => ({ id: g.id, name: g.name })),
    venues: ws.venues.filter(keep).map((g) => ({ id: g.id, name: g.name })),
    platforms: ws.platforms.filter(keep).map((g) => ({ id: g.id, name: g.name })),
  };
}

/** Defaults for a new tournament: today, the last tournament's account/venue/buy-in. */
export function newTournamentValues(ws: Workspace): TournamentFormValues {
  const last = [...ws.dataset.tournaments].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
  const accounts = ws.dataset.accounts.filter((a) => !a.archived);
  const accountId =
    (last && accounts.some((a) => a.id === last.accountId) ? last.accountId : null) ??
    (ws.settings.defaultAccountId && accounts.some((a) => a.id === ws.settings.defaultAccountId) ? ws.settings.defaultAccountId : null) ??
    accounts[0]?.id ??
    "";
  const cur = accounts.find((a) => a.id === accountId)?.currency ?? "CAD";
  const e = last?.entries[0];
  return {
    name: "",
    status: "completed",
    setting: last?.setting ?? "live_casino",
    format: last?.format ?? "mtt",
    speed: last?.speed ?? "regular",
    isBounty: false,
    accountId,
    venueId: last?.venueId ?? "",
    platformId: last?.platformId ?? "",
    newVenueName: "",
    newPlatformName: "",
    gameTypeId: last?.gameTypeId ?? (ws.gameTypes.find((g) => g.shortName === "NLHE") ?? ws.gameTypes[0])?.id ?? "",
    startDate: todayIn(ws.settings.timezone),
    endDate: "",
    fieldSize: "",
    finishPosition: "",
    payout: "",
    bounties: "",
    refund: "",
    guarantee: "",
    notes: "",
    tags: "",
    entries: [{ buyIn: e ? moneyInput(e.buyInMinor, cur) : "", fee: e?.feeMinor ? moneyInput(e.feeMinor, cur) : "", rebuyCount: "", rebuys: "", addons: "" }],
    periods: [],
  };
}

export function tournamentToValues(t: TournamentDetail, currency: string, tz: string): TournamentFormValues {
  const m = (v: number | null) => moneyInput(v, currency);
  const opt = (v: number) => (v ? m(v) : "");
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    setting: t.setting,
    format: t.format,
    speed: t.speed,
    isBounty: t.isBounty,
    accountId: t.accountId,
    venueId: t.venueId ?? "",
    platformId: t.platformId ?? "",
    newVenueName: "",
    newPlatformName: "",
    gameTypeId: t.gameTypeId ?? "",
    startDate: t.startDate,
    endDate: t.endDate ?? "",
    fieldSize: t.fieldSize ? String(t.fieldSize) : "",
    finishPosition: t.finishPosition ? String(t.finishPosition) : "",
    payout: opt(t.payoutMinor),
    bounties: opt(t.bountiesMinor),
    refund: opt(t.refundMinor),
    guarantee: t.guaranteeMinor !== null ? m(t.guaranteeMinor) : "",
    notes: t.notes ?? "",
    tags: t.tags.join(", "),
    entries: t.entries.map((e) => ({ buyIn: m(e.buyInMinor), fee: opt(e.feeMinor), rebuyCount: e.rebuyCount ? String(e.rebuyCount) : "", rebuys: opt(e.rebuysMinor), addons: opt(e.addonsMinor) })),
    periods: t.periods.map((p) => ({
      date: localDate(p.startedAt, tz),
      startTime: localTime(p.startedAt, tz),
      endTime: p.endedAt ? localTime(p.endedAt, tz) : "",
      breakMinutes: p.breakMinutes ? String(p.breakMinutes) : "",
      dayLabel: p.dayLabel ?? "",
    })),
  };
}
