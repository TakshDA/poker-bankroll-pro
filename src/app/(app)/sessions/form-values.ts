import { localDate, localTime, todayIn } from "@/lib/finance/dates";
import type { CashSessionDetail } from "@/lib/data/sessions";
import type { Workspace } from "@/lib/data/workspace";
import { moneyInput } from "@/lib/format";
import type { SessionFormProps, SessionFormValues } from "./session-form";

export function formOptions(ws: Workspace, includeIds: (string | null)[] = []): Omit<SessionFormProps, "values"> {
  const keep = (x: { id: string; archivedAt?: string | null }) => !x.archivedAt || includeIds.includes(x.id);
  return {
    accounts: ws.dataset.accounts.filter((a) => !a.archived || includeIds.includes(a.id)).map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    gameTypes: ws.gameTypes.filter(keep).map((g) => ({ id: g.id, name: g.name })),
    venues: ws.venues.filter(keep).map((g) => ({ id: g.id, name: g.name })),
    platforms: ws.platforms.filter(keep).map((g) => ({ id: g.id, name: g.name })),
    stakeLevels: ws.stakeLevels.filter(keep).map((s) => ({ ...s, currency: s.currency.trim() })),
  };
}

function roundedTime(d: Date, tz: string) {
  const t = localTime(d.toISOString(), tz);
  const [h, m] = t.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${String(Math.floor(m / 15) * 15).padStart(2, "0")}`;
}

/** Defaults for a new session: today, last 4 hours, last game you logged. */
export function newSessionValues(ws: Workspace, now = new Date()): SessionFormValues {
  const tz = ws.settings.timezone;
  const last = [...ws.dataset.cashSessions].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
  const accounts = ws.dataset.accounts.filter((a) => !a.archived);
  const accountId =
    (last && accounts.some((a) => a.id === last.accountId) ? last.accountId : null) ??
    (ws.settings.defaultAccountId && accounts.some((a) => a.id === ws.settings.defaultAccountId) ? ws.settings.defaultAccountId : null) ??
    accounts[0]?.id ??
    "";
  const cur = accounts.find((a) => a.id === accountId)?.currency ?? "CAD";
  const startDate = new Date(now.getTime() - 4 * 3600_000);
  return {
    status: "completed",
    date: localDate(startDate, tz),
    startTime: roundedTime(startDate, tz),
    endTime: roundedTime(now, tz),
    breakMinutes: "",
    setting: last?.setting ?? "live_casino",
    accountId,
    gameTypeId: last?.gameTypeId ?? (ws.gameTypes.find((g) => g.shortName === "NLHE") ?? ws.gameTypes[0])?.id ?? "",
    variant: "",
    venueId: last?.venueId ?? "",
    platformId: last?.platformId ?? "",
    stakeLevelId: last?.stakeLevelId ?? "",
    smallBlind: last ? moneyInput(last.smallBlindMinor, cur) : "",
    bigBlind: last ? moneyInput(last.bigBlindMinor, cur) : "",
    straddle: last ? moneyInput(last.straddleMinor, cur) : "",
    ante: last ? moneyInput(last.anteMinor, cur) : "",
    tableFormat: last?.tableFormat ?? "full_ring",
    seats: "",
    buyIn: last ? moneyInput(last.buyInMinor, cur) : "",
    rebuys: "",
    additional: "",
    cashOut: "",
    rake: "",
    tips: "",
    fees: "",
    bonus: "",
    rakeback: "",
    handsPlayed: "",
    notes: "",
    tags: "",
  };
}

export function detailToValues(s: CashSessionDetail, currency: string, tz: string): SessionFormValues {
  const m = (v: number | null) => moneyInput(v, currency);
  const opt = (v: number) => (v ? m(v) : "");
  return {
    id: s.id,
    status: s.status,
    date: localDate(s.startedAt, tz),
    startTime: localTime(s.startedAt, tz),
    endTime: s.endedAt ? localTime(s.endedAt, tz) : "",
    breakMinutes: s.breakMinutes ? String(s.breakMinutes) : "",
    setting: s.setting,
    accountId: s.accountId,
    gameTypeId: s.gameTypeId ?? "",
    variant: s.variant ?? "",
    venueId: s.venueId ?? "",
    platformId: s.platformId ?? "",
    stakeLevelId: s.stakeLevelId ?? "",
    smallBlind: m(s.smallBlindMinor),
    bigBlind: m(s.bigBlindMinor),
    straddle: m(s.straddleMinor),
    ante: m(s.anteMinor),
    tableFormat: s.tableFormat,
    seats: s.seats ? String(s.seats) : "",
    buyIn: m(s.buyInMinor),
    rebuys: opt(s.rebuysMinor),
    additional: opt(s.additionalMinor),
    cashOut: m(s.cashOutMinor),
    rake: opt(s.rakeMinor),
    tips: opt(s.tipsMinor),
    fees: opt(s.feesMinor),
    bonus: opt(s.bonusMinor),
    rakeback: opt(s.rakebackMinor),
    handsPlayed: s.handsPlayed !== null ? String(s.handsPlayed) : "",
    notes: s.notes ?? "",
    tags: s.tags.join(", "),
  };
}

export { todayIn };
