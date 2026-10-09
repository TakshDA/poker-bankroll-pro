/**
 * Unified rows for listing cash sessions and tournaments together (session
 * list, calendar, exports). Amounts are in the record's own currency; values
 * come from the shared per-record formulas.
 */
import type { Workspace } from "../data/workspace";
import { localDate } from "../finance/dates";
import { minorUnits } from "../finance/currency";
import { minorToDecimal } from "../finance/money";
import { cashInvested, cashSessionMinutes, cashSessionNet, tournamentInvestment, tournamentMinutes, tournamentNet, tournamentReturn, tournamentAffectsBankroll } from "../finance/records";

export interface SessionRow {
  id: string;
  kind: "cash" | "tournament";
  href: string;
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  status: string;
  setting: string;
  title: string;
  place: string | null;
  gameType: string | null;
  stakes: string | null;
  accountId: string;
  accountName: string;
  currency: string;
  investedMinor: number;
  returnedMinor: number | null;
  netMinor: number | null;
  minutes: number | null;
  handsPlayed: number | null;
  tags: string[];
  notes: string | null;
  finish: string | null;
}

export function buildSessionRows(ws: Workspace): SessionRow[] {
  const tz = ws.settings.timezone;
  const acc = new Map(ws.dataset.accounts.map((a) => [a.id, a]));
  const venue = new Map(ws.venues.map((v) => [v.id, v.name]));
  const platform = new Map(ws.platforms.map((v) => [v.id, v.name]));
  const game = new Map(ws.gameTypes.map((v) => [v.id, v.shortName ?? v.name]));
  const stake = new Map(ws.stakeLevels.map((v) => [v.id, v.label]));
  const tag = new Map(ws.tags.map((t) => [t.id, t.name]));
  const rows: SessionRow[] = [];

  for (const s of ws.dataset.cashSessions) {
    const a = acc.get(s.accountId);
    const cur = a?.currency ?? s.currency;
    const d = minorUnits(cur);
    const blinds = s.bigBlindMinor ? `${trim(s.smallBlindMinor ?? 0, d)}/${trim(s.bigBlindMinor, d)}${s.straddleMinor ? `/${trim(s.straddleMinor, d)}` : ""}` : null;
    const net = s.status === "completed" ? cashSessionNet(s) : null;
    rows.push({
      id: s.id,
      kind: "cash",
      href: `/sessions/${s.id}`,
      date: localDate(s.startedAt, tz),
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      status: s.status,
      setting: s.setting,
      title: [game.get(s.gameTypeId ?? "") ?? "Cash game", s.stakeLevelId ? stake.get(s.stakeLevelId) : blinds].filter(Boolean).join(" "),
      place: s.setting === "online" ? (platform.get(s.platformId ?? "") ?? null) : (venue.get(s.venueId ?? "") ?? null),
      gameType: game.get(s.gameTypeId ?? "") ?? null,
      stakes: (s.stakeLevelId ? stake.get(s.stakeLevelId) : null) ?? blinds,
      accountId: s.accountId,
      accountName: a?.name ?? "",
      currency: cur,
      investedMinor: cashInvested(s),
      returnedMinor: s.cashOutMinor,
      netMinor: net,
      minutes: cashSessionMinutes(s),
      handsPlayed: s.handsPlayed,
      tags: s.tagIds.map((t) => tag.get(t) ?? "").filter(Boolean),
      notes: s.notes ?? null,
      finish: null,
    });
  }

  for (const t of ws.dataset.tournaments) {
    const a = acc.get(t.accountId);
    const first = [...t.periods].sort((x, y) => x.startedAt.localeCompare(y.startedAt))[0];
    const last = [...t.periods].sort((x, y) => (y.endedAt ?? "").localeCompare(x.endedAt ?? ""))[0];
    rows.push({
      id: t.id,
      kind: "tournament",
      href: `/tournaments/${t.id}`,
      date: t.startDate,
      startedAt: first?.startedAt ?? null,
      endedAt: last?.endedAt ?? null,
      status: t.status,
      setting: t.setting,
      title: t.name,
      place: t.setting === "online" ? (platform.get(t.platformId ?? "") ?? null) : (venue.get(t.venueId ?? "") ?? null),
      gameType: game.get(t.gameTypeId ?? "") ?? null,
      stakes: null,
      accountId: t.accountId,
      accountName: a?.name ?? "",
      currency: a?.currency ?? t.currency,
      investedMinor: tournamentInvestment(t),
      returnedMinor: tournamentReturn(t),
      netMinor: tournamentAffectsBankroll(t) ? tournamentNet(t) : null,
      minutes: t.periods.length ? tournamentMinutes(t) : null,
      handsPlayed: null,
      tags: t.tagIds.map((x) => tag.get(x) ?? "").filter(Boolean),
      notes: t.notes ?? null,
      finish: t.finishPosition ? `${t.finishPosition}${t.fieldSize ? ` / ${t.fieldSize}` : ""}` : null,
    });
  }

  return rows.sort((a, b) => (b.startedAt ?? `${b.date}T00`).localeCompare(a.startedAt ?? `${a.date}T00`));
}

/** Blind amounts written compactly (e.g. 200 -> "2", 250 -> "2.5"). */
function trim(minor: number, digits: number): string {
  const s = minorToDecimal(minor, digits);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
