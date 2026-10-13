/**
 * What each import type can read, and how a CSV row becomes the same input
 * object the app's own forms submit. Pure: shared by the browser (mapping UI)
 * and the server (which re-validates everything).
 */
import { cleanMoneyCell, parseDateCell, parseDurationCell, parseIntCell, parseStakesCell, parseTimeCell, splitDateTime, type DateOrder, type DecimalMark } from "./normalize";

export const IMPORT_ENTITIES = ["sessions", "tournaments", "expenses", "transactions"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export interface FieldSpec {
  key: string;
  label: string;
  required?: boolean;
  hint?: string;
  synonyms: string[];
}

export const ENTITY_LABELS: Record<ImportEntity, string> = {
  sessions: "Cash sessions",
  tournaments: "Tournaments",
  expenses: "Expenses",
  transactions: "Deposits & withdrawals",
};

const common = {
  date: { key: "date", label: "Date", required: true, synonyms: ["date", "day", "session date", "start date", "started", "start", "played on", "occurred on"] },
  account: { key: "account", label: "Account", hint: "Matched to your account names. Otherwise the default below is used.", synonyms: ["account", "bankroll", "wallet", "bank"] },
  notes: { key: "notes", label: "Notes", synonyms: ["notes", "note", "comment", "comments", "memo"] },
};

export const FIELDS: Record<ImportEntity, FieldSpec[]> = {
  sessions: [
    common.date,
    { key: "startTime", label: "Start time", hint: "Defaults to 12:00 if missing", synonyms: ["start time", "time in", "from", "begin", "started at"] },
    { key: "endTime", label: "End time", synonyms: ["end time", "time out", "to", "finish", "ended at", "end"] },
    { key: "duration", label: "Hours played", hint: "Used when there is no end time, e.g. 4.5 or 4:30", synonyms: ["hours", "duration", "length", "time played", "hrs", "played"] },
    { key: "setting", label: "Live or online", hint: "live, casino, home, online…", synonyms: ["type", "setting", "live/online", "live online", "where"] },
    common.account,
    { key: "location", label: "Venue or site", synonyms: ["location", "venue", "casino", "site", "room", "platform", "card room"] },
    { key: "game", label: "Game", synonyms: ["game", "game type", "variant", "variation", "limit"] },
    { key: "stakes", label: "Stakes (e.g. 1/2)", synonyms: ["stakes", "stake", "blinds", "level"] },
    { key: "smallBlind", label: "Small blind", synonyms: ["small blind", "sb"] },
    { key: "bigBlind", label: "Big blind", synonyms: ["big blind", "bb"] },
    { key: "buyIn", label: "Buy-in", hint: "Total bought in, including rebuys if there is no rebuys column", synonyms: ["buy in", "buyin", "buy-in", "buyins", "invested", "in"] },
    { key: "rebuys", label: "Rebuys / add-ons", synonyms: ["rebuys", "rebuy", "add ons", "addons", "top ups", "reloads"] },
    { key: "cashOut", label: "Cash-out", synonyms: ["cash out", "cashout", "cash-out", "out", "cashed out", "ending stack"] },
    { key: "profit", label: "Profit / result", hint: "Only used when there is no buy-in and cash-out", synonyms: ["profit", "result", "net", "won", "winnings", "p/l", "pnl", "amount"] },
    { key: "rake", label: "Rake (info only)", synonyms: ["rake"] },
    { key: "tips", label: "Tips / dealer tokes", synonyms: ["tips", "tokes", "dealer tips"] },
    { key: "hands", label: "Hands", synonyms: ["hands", "hands played"] },
    { key: "tags", label: "Tags", synonyms: ["tags", "labels"] },
    common.notes,
  ],
  tournaments: [
    common.date,
    { key: "name", label: "Tournament name", required: true, synonyms: ["name", "tournament", "event", "title", "description"] },
    { key: "setting", label: "Live or online", synonyms: ["type", "setting", "live/online", "where"] },
    common.account,
    { key: "location", label: "Venue or site", synonyms: ["location", "venue", "casino", "site", "room", "platform"] },
    { key: "buyIn", label: "Buy-in", required: true, hint: "Per entry. Include the fee here if there is no fee column.", synonyms: ["buy in", "buyin", "buy-in", "cost", "entry"] },
    { key: "fee", label: "Fee / rake", synonyms: ["fee", "rake", "entry fee"] },
    { key: "entries", label: "Number of entries", hint: "1 + re-entries. Defaults to 1.", synonyms: ["entries", "bullets", "re-entries", "reentries", "number of entries"] },
    { key: "rebuys", label: "Rebuys / add-ons (amount)", synonyms: ["rebuys", "rebuy", "addons", "add ons", "add-ons"] },
    { key: "payout", label: "Prize won", synonyms: ["prize", "payout", "winnings", "won", "cashed", "cash", "return"] },
    { key: "bounties", label: "Bounties won", synonyms: ["bounties", "bounty", "knockouts", "ko"] },
    { key: "fieldSize", label: "Field size", synonyms: ["field", "field size", "players", "entrants", "runners"] },
    { key: "position", label: "Finish position", synonyms: ["position", "place", "finish", "rank", "finished"] },
    { key: "game", label: "Game", synonyms: ["game", "game type", "variant"] },
    common.notes,
  ],
  expenses: [
    common.date,
    { key: "amount", label: "Amount", required: true, synonyms: ["amount", "cost", "total", "price", "spent", "value"] },
    { key: "category", label: "Category", hint: "Matched to your categories by name or type. Otherwise the default below is used.", synonyms: ["category", "type", "kind"] },
    common.account,
    { key: "description", label: "Description", synonyms: ["description", "details", "note", "notes", "memo", "item"] },
    { key: "vendor", label: "Vendor", synonyms: ["vendor", "merchant", "payee", "shop", "store"] },
  ],
  transactions: [
    common.date,
    { key: "amount", label: "Amount", required: true, hint: "Negative amounts are withdrawals when there is no type column", synonyms: ["amount", "value", "total", "sum"] },
    { key: "type", label: "Type", hint: "deposit, withdrawal, cashout, bonus, rakeback, adjustment", synonyms: ["type", "transaction type", "kind", "direction"] },
    common.account,
    { key: "description", label: "Description", synonyms: ["description", "details", "memo", "note", "notes"] },
    { key: "reference", label: "Reference", synonyms: ["reference", "ref", "id", "transaction id", "confirmation"] },
  ],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-./()]+/g, " ").replace(/\s+/g, " ").trim();

/** Best guess of which header feeds each field: exact synonym first, then "contains". */
export function guessMapping(entity: ImportEntity, headers: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  const h = headers.map(norm);
  for (const pass of ["exact", "contains"] as const) {
    for (const f of FIELDS[entity]) {
      if (out[f.key] !== undefined) continue;
      for (const syn of f.synonyms.map(norm)) {
        const idx = h.findIndex((x, i) => !used.has(i) && (pass === "exact" ? x === syn : syn.length > 2 && x.includes(syn)));
        if (idx >= 0) {
          out[f.key] = idx;
          used.add(idx);
          break;
        }
      }
    }
  }
  return out;
}

/** Columns the file must provide before rows can be checked; empty when the mapping is usable. */
export function mappingProblems(entity: ImportEntity, mapping: Record<string, number>): string[] {
  const has = (k: string) => (mapping[k] ?? -1) >= 0;
  const label = (k: string) => FIELDS[entity].find((f) => f.key === k)?.label ?? k;
  const out = FIELDS[entity].filter((f) => f.required && !has(f.key)).map((f) => f.label);
  if (entity === "sessions") {
    if (!has("endTime") && !has("duration")) out.push(`${label("endTime")} or ${label("duration")}`);
    if (!(has("buyIn") && has("cashOut")) && !has("profit")) out.push(`${label("buyIn")} and ${label("cashOut")}, or ${label("profit")}`);
  }
  return out;
}

export interface ImportOptions {
  dateOrder: DateOrder;
  decimalMark: DecimalMark;
  defaultAccountId: string;
  defaultSetting: "live_casino" | "online";
  defaultCategoryId: string;
  includeDuplicates: boolean;
}

export interface ImportRef {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind: string }[];
  gameTypes: { id: string; name: string; shortName: string | null }[];
}

export class RowError extends Error {
  constructor(public column: string, message: string) {
    super(message);
  }
}

const SETTINGS: [RegExp, string][] = [
  [/online|internet|web|app|site/i, "online"],
  [/home/i, "home_game"],
  [/private|club|underground/i, "private_game"],
  [/live|casino|card ?room|brick/i, "live_casino"],
];

const TX_TYPES: [RegExp, string][] = [
  [/rake ?back/i, "rakeback"],
  [/bonus|promo|reward/i, "bonus"],
  [/adjust|correction/i, "adjustment"],
  [/withdraw|cash ?out|payout|debit|\bout\b/i, "withdrawal"],
  [/deposit|top ?up|credit|\bin\b/i, "deposit"],
];

/**
 * Build the form input for one CSV row. Throws RowError naming the CSV column
 * when a cell cannot be read; the save function and Zod schema then apply the
 * same rules as manual entry.
 */
export function rowToInput(entity: ImportEntity, cells: string[], mapping: Record<string, number>, opts: ImportOptions, ref: ImportRef, headers: string[]): Record<string, unknown> {
  const raw = (key: string) => {
    const i = mapping[key];
    return i === undefined || i < 0 ? "" : (cells[i] ?? "").trim();
  };
  const col = (key: string) => headers[mapping[key]] ?? key;
  const money = (key: string, required = false) => {
    const v = raw(key);
    if (!v) {
      if (required) throw new RowError(col(key), `${col(key)} is empty`);
      return undefined;
    }
    const m = cleanMoneyCell(v, opts.decimalMark);
    if (m === null) throw new RowError(col(key), `"${v}" in ${col(key)} is not an amount`);
    return m;
  };
  const int = (key: string) => {
    const v = raw(key);
    if (!v) return undefined;
    const n = parseIntCell(v);
    if (n === null) throw new RowError(col(key), `"${v}" in ${col(key)} is not a whole number`);
    return n;
  };
  const dateCell = raw("date");
  if (!dateCell) throw new RowError(col("date"), "Date is empty");
  const date = parseDateCell(dateCell, opts.dateOrder);
  if (!date) throw new RowError(col("date"), `"${dateCell}" is not a date we can read`);

  const accountName = raw("account");
  let accountId = opts.defaultAccountId;
  if (accountName) {
    const a = ref.accounts.find((x) => x.name.toLowerCase() === accountName.toLowerCase());
    if (!a) throw new RowError(col("account"), `No account named "${accountName}"`);
    accountId = a.id;
  }
  if (!accountId) throw new RowError(col("account"), "Choose a default account or map an account column");

  const settingOf = () => {
    const v = raw("setting");
    if (!v) return opts.defaultSetting;
    const hit = SETTINGS.find(([re]) => re.test(v));
    if (!hit) throw new RowError(col("setting"), `"${v}" is not live or online`);
    return hit[1];
  };
  const place = (setting: string) => {
    const name = raw("location").slice(0, 120);
    if (!name) return {};
    return setting === "online" ? { newPlatformName: name } : { newVenueName: name };
  };
  const gameOf = () => {
    const v = raw("game");
    if (!v) return {};
    const g = ref.gameTypes.find((x) => x.name.toLowerCase() === v.toLowerCase() || x.shortName?.toLowerCase() === v.toLowerCase());
    return g ? { gameTypeId: g.id } : { variant: v.slice(0, 80) };
  };

  switch (entity) {
    case "sessions": {
      const setting = settingOf();
      const embeddedTime = splitDateTime(dateCell).time;
      const startCell = raw("startTime") || embeddedTime || "";
      let startTime = "12:00";
      if (startCell) {
        const t = parseTimeCell(splitDateTime(startCell).time ?? startCell);
        if (!t) throw new RowError(col("startTime"), `"${startCell}" is not a time`);
        startTime = t;
      }
      let endTime: string | undefined;
      const endCell = raw("endTime");
      if (endCell) {
        const t = parseTimeCell(splitDateTime(endCell).time ?? endCell);
        if (!t) throw new RowError(col("endTime"), `"${endCell}" is not a time`);
        endTime = t;
      } else if (raw("duration")) {
        const mins = parseDurationCell(raw("duration"), opts.decimalMark);
        if (mins === null || mins <= 0 || mins >= 24 * 60) throw new RowError(col("duration"), `"${raw("duration")}" is not a length under 24 hours`);
        const [h, m] = startTime.split(":").map(Number);
        const end = (h * 60 + m + mins) % (24 * 60);
        endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
      } else throw new RowError("End time", "Needs an end time or hours played");

      let buyIn = money("buyIn");
      let cashOut = money("cashOut");
      if (buyIn === undefined && cashOut === undefined) {
        const profit = money("profit");
        if (profit === undefined) throw new RowError("Buy-in", "Needs a buy-in and cash-out, or a profit");
        // Only the net is known: record it as a buy-in of the loss or a cash-out of the win.
        const negative = profit.startsWith("-");
        buyIn = negative ? profit.slice(1) : "0";
        cashOut = negative ? "0" : profit;
      }
      if (buyIn?.startsWith("-")) throw new RowError(col("buyIn"), "Buy-in cannot be negative");
      if (cashOut?.startsWith("-")) throw new RowError(col("cashOut"), "Cash-out cannot be negative");
      let blinds: { smallBlind?: string; bigBlind?: string } = { smallBlind: money("smallBlind"), bigBlind: money("bigBlind") };
      if (!blinds.bigBlind && raw("stakes")) {
        const s = parseStakesCell(raw("stakes"), opts.decimalMark);
        if (!s) throw new RowError(col("stakes"), `"${raw("stakes")}" is not stakes like 1/2`);
        blinds = s;
      }
      return {
        status: "completed",
        date,
        startTime,
        endTime,
        setting,
        accountId,
        ...place(setting),
        ...gameOf(),
        ...blinds,
        tableFormat: "full_ring",
        buyIn: buyIn ?? "0",
        rebuys: money("rebuys"),
        cashOut: cashOut ?? "0",
        rake: money("rake"),
        tips: money("tips"),
        handsPlayed: int("hands"),
        notes: raw("notes") || undefined,
        tags: raw("tags") || undefined,
      };
    }
    case "tournaments": {
      const setting = settingOf();
      const entries = Number(int("entries") ?? "1");
      if (entries < 1 || entries > 100) throw new RowError(col("entries"), "Entries must be between 1 and 100");
      const entry = { buyIn: money("buyIn", true)!, fee: money("fee") };
      const rebuys = money("rebuys");
      const g = gameOf();
      return {
        name: raw("name"),
        status: "completed",
        setting,
        format: "mtt",
        speed: "regular",
        isBounty: Number(money("bounties") ?? 0) > 0,
        accountId,
        ...place(setting),
        ...("gameTypeId" in g ? g : {}),
        startDate: date,
        fieldSize: int("fieldSize"),
        finishPosition: int("position"),
        payout: money("payout"),
        bounties: money("bounties"),
        notes: raw("notes") || undefined,
        entries: Array.from({ length: entries }, (_, i) => ({ ...entry, rebuys: i === 0 ? rebuys : undefined })),
        periods: [],
      };
    }
    case "expenses": {
      const amount = money("amount", true)!;
      const catName = raw("category");
      let categoryId = opts.defaultCategoryId;
      if (catName) {
        const c = ref.categories.find((x) => x.name.toLowerCase() === catName.toLowerCase()) ?? ref.categories.find((x) => x.kind === catName.toLowerCase());
        if (c) categoryId = c.id;
      }
      if (!categoryId) throw new RowError(col("category"), catName ? `No category named "${catName}" and no default chosen` : "Choose a default category");
      return {
        accountId,
        categoryId,
        amount: amount.replace(/^-/, ""),
        occurredOn: date,
        description: raw("description").slice(0, 500) || undefined,
        vendor: raw("vendor").slice(0, 120) || undefined,
        confirmDuplicate: opts.includeDuplicates ? "true" : "false",
      };
    }
    case "transactions": {
      const amount = money("amount", true)!;
      const typeCell = raw("type");
      let type: string;
      if (typeCell) {
        const hit = TX_TYPES.find(([re]) => re.test(typeCell));
        if (!hit) throw new RowError(col("type"), `"${typeCell}" is not a deposit, withdrawal, bonus, rakeback or adjustment`);
        type = hit[1];
      } else type = amount.startsWith("-") ? "withdrawal" : "deposit";
      return {
        accountId,
        type,
        // Adjustments keep their sign; the type carries the direction otherwise.
        amount: type === "adjustment" ? amount : amount.replace(/^-/, ""),
        occurredOn: date,
        description: raw("description").slice(0, 500) || undefined,
        reference: raw("reference").slice(0, 120) || undefined,
      };
    }
  }
}
