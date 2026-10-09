/**
 * Create a demo user with a year of realistic, deterministic data, entered
 * through the same service functions (and validation) the app uses.
 *
 *   pnpm db:seed-demo                       # demo@example.com / demo-password-123
 *   PBP_PASSWORD=... pnpm db:seed-demo you@example.com
 *
 * Local auth only. Refuses to run with NODE_ENV=production or when the user
 * already has accounts, so it never mixes demo data into real records.
 */
import { config } from "dotenv";
import { createSql, withUser, type Tx } from "../src/lib/server/db";
import { createLocalUser } from "../src/lib/auth/local-store";
import { saveCashSession } from "../src/lib/data/sessions";
import { saveTournament } from "../src/lib/data/tournaments";
import { saveAccount, saveExpense, saveTransaction, saveTransfer } from "../src/lib/data/money-records";
import { addDays, todayIn } from "../src/lib/finance/dates";
import { mulberry32 } from "../src/lib/finance/stats";

config({ path: ".env.local", quiet: true });

const rand = mulberry32(20261009);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const dec = (major: number) => major.toFixed(2);

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");
  const email = process.argv[2] ?? "demo@example.com";
  const password = process.env.PBP_PASSWORD ?? "demo-password-123";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = createSql(url);
  try {
    const existing = await sql<{ id: string }[]>`select id from auth.users where email = ${email.toLowerCase()}`;
    const userId = existing[0]?.id ?? (await createLocalUser(sql, email, password)).id;
    await withUser(userId, (tx) => seed(tx), sql);
    console.log(`Seeded demo data for ${email}${existing[0] ? "" : ` (password: ${password})`}`);
  } finally {
    await sql.end();
  }
}

async function seed(tx: Tx) {
  const has = await tx`select 1 from bankroll_accounts limit 1`;
  if (has.length) throw new Error("This user already has accounts; demo data is only added to an empty user");

  const today = todayIn("America/Toronto");
  const start = addDays(today, -365);
  const live = await saveAccount(tx, { name: "Live CAD", currency: "CAD", openingBalance: "6000", openingDate: start, minBalance: "3000", goalBalance: "15000" });
  const online = await saveAccount(tx, { name: "Online USD", currency: "USD", openingBalance: "1500", openingDate: start, minBalance: "750" });
  const savings = await saveAccount(tx, { name: "Savings CAD", currency: "CAD", openingBalance: "2000", openingDate: start });

  // Monthly USD→CAD rates (CAD is the base currency).
  for (let d = start; d <= today; d = addDays(d, 30)) {
    await tx`insert into exchange_rates (base_currency, quote_currency, rate, effective_date, source) values ('USD', 'CAD', ${between(1.33, 1.39).toFixed(4)}, ${d}, 'demo')`;
  }

  const venues = await tx<{ id: string; name: string }[]>`
    insert into venues (name, kind, city, region, country) values
      ('Casino Rama', 'casino', 'Orillia', 'ON', 'CA'), ('Great Canadian Toronto', 'casino', 'Toronto', 'ON', 'CA'), ('Playground Poker Club', 'card_room', 'Kahnawake', 'QC', 'CA')
    returning id, name`;
  const platforms = await tx<{ id: string }[]>`insert into platforms (name) values ('GGPoker'), ('PokerStars') returning id`;
  const games = await tx<{ id: string; shortName: string }[]>`select id, short_name from game_types`;
  const nlhe = games.find((g) => g.shortName === "NLHE")!.id;
  const plo = games.find((g) => g.shortName === "PLO")!.id;
  const cats = await tx<{ id: string; kind: string }[]>`select id, kind from expense_categories`;
  const cat = (k: string) => cats.find((c) => c.kind === k)!.id;

  let count = 0;
  for (let day = start; day <= today; day = addDays(day, 1)) {
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    // Live cash: mostly Fri/Sat.
    if ((dow === 5 || dow === 6) && rand() < 0.75) {
      const [sb, bbb] = rand() < 0.65 ? [1, 2] : [2, 5];
      const hours = between(3, 8);
      const startMin = int(17, 21) * 60 + pick([0, 15, 30, 45]);
      const buyIn = bbb * 100;
      const netBb = 6 * hours + normal() * 55 * Math.sqrt(hours);
      let rebuys = 0;
      let stack = buyIn + netBb * bbb;
      while (stack < 0) {
        rebuys += buyIn;
        stack += buyIn;
      }
      const venue = pick(venues);
      const id = await saveCashSession(tx, {
        status: "completed",
        date: day,
        startTime: hhmm(startMin),
        endTime: hhmm(startMin + Math.round(hours * 60)),
        breakMinutes: rand() < 0.4 ? int(10, 30) : undefined,
        setting: "live_casino",
        accountId: live,
        gameTypeId: rand() < 0.85 ? nlhe : plo,
        venueId: venue.id,
        smallBlind: String(sb),
        bigBlind: String(bbb),
        tableFormat: "full_ring",
        buyIn: dec(buyIn),
        rebuys: rebuys ? dec(rebuys) : undefined,
        cashOut: dec(Math.round(stack)),
        rake: dec(Math.round(hours * between(8, 14))),
        tips: dec(Math.round(hours * between(3, 8))),
        handsPlayed: rand() < 0.6 ? Math.round(hours * between(25, 33)) : undefined,
        tags: rand() < 0.1 ? "great game" : rand() < 0.05 ? "tilt" : undefined,
      });
      count++;
      if (venue.name === "Playground Poker Club" || rand() < 0.15) {
        await saveExpense(tx, { accountId: live, categoryId: cat("travel"), amount: dec(Math.round(between(25, 90))), occurredOn: day, description: `Gas to ${venue.name}`, sessionId: id, confirmDuplicate: true });
      }
    }
    // Online cash on weeknights.
    if (dow >= 1 && dow <= 4 && rand() < 0.45) {
      const hours = between(1, 3);
      const startMin = int(19, 22) * 60;
      const tables = int(2, 4);
      const hands = Math.round(hours * 75 * tables);
      const netBb = (hands / 100) * 4 + normal() * 90 * Math.sqrt(hands / 100);
      const buyIn = 50 * tables;
      let rebuys = 0;
      let stack = buyIn + netBb * 0.5;
      while (stack < 0) {
        rebuys += 50;
        stack += 50;
      }
      await saveCashSession(tx, {
        status: "completed",
        date: day,
        startTime: hhmm(startMin),
        endTime: hhmm(startMin + Math.round(hours * 60)),
        setting: "online",
        accountId: online,
        gameTypeId: nlhe,
        platformId: pick(platforms).id,
        smallBlind: "0.25",
        bigBlind: "0.50",
        tableFormat: "six_max",
        buyIn: dec(buyIn),
        rebuys: rebuys ? dec(rebuys) : undefined,
        cashOut: dec(Math.round(stack * 100) / 100),
        handsPlayed: hands,
      });
      count++;
    }
    // Tournaments: Sunday online, some live weekends.
    if ((dow === 0 && rand() < 0.8) || (dow === 6 && rand() < 0.2)) {
      const isOnline = dow === 0;
      const buyIn = isOnline ? pick([10, 20, 50, 100]) : pick([100, 200, 300, 550]);
      const fee = Math.round(buyIn * 0.1);
      const field = isOnline ? int(150, 2500) : int(60, 400);
      const reentries = rand() < 0.25 ? 1 : 0;
      const cashed = rand() < 0.16;
      const finish = cashed ? int(1, Math.floor(field * 0.15)) : int(Math.floor(field * 0.15) + 1, field);
      const payout = cashed ? Math.round(buyIn * (1.6 + Math.exp(between(0, 1) ** 3 * 4.5)) * (finish <= 3 ? 3 : 1)) : 0;
      const bounty = isOnline && rand() < 0.4;
      const startMin = isOnline ? 13 * 60 : 12 * 60;
      const playMin = cashed ? int(300, 600) : int(90, 300);
      const venue = pick(venues);
      await saveTournament(tx, {
        name: isOnline ? `Sunday ${bounty ? "Bounty " : ""}$${buyIn}` : `${venue.name.split(" ")[0]} Deepstack $${buyIn + fee}`,
        status: "completed",
        setting: isOnline ? "online" : "live_casino",
        format: "mtt",
        speed: isOnline ? pick(["regular", "turbo"] as const) : "deep",
        isBounty: bounty,
        accountId: isOnline ? online : live,
        venueId: isOnline ? undefined : venue.id,
        platformId: isOnline ? pick(platforms).id : undefined,
        gameTypeId: nlhe,
        startDate: day,
        fieldSize: field,
        finishPosition: finish,
        payout: dec(payout),
        bounties: bounty ? dec(Math.round(buyIn * 0.5 * int(0, 3))) : undefined,
        entries: Array.from({ length: 1 + reentries }, () => ({ buyIn: dec(buyIn), fee: dec(fee) })),
        periods: [{ date: day, startTime: hhmm(startMin), endTime: hhmm(startMin + playMin) }],
      });
      count++;
    }
    // Money movements.
    if (day.endsWith("-01")) {
      await saveExpense(tx, { accountId: live, categoryId: cat("software"), amount: "15.00", occurredOn: day, description: "Solver subscription", vendor: "GTO Wizard", confirmDuplicate: true });
      if (rand() < 0.5) await saveTransaction(tx, { accountId: savings, type: "deposit", amount: "500", occurredOn: day, description: "Monthly savings" });
    }
    if (day.endsWith("-15") && rand() < 0.3) await saveTransaction(tx, { accountId: online, type: "rakeback", amount: dec(int(20, 80)), occurredOn: day, description: "Monthly rakeback" });
  }
  await saveTransfer(tx, { fromAccountId: savings, toAccountId: live, fromAmount: "1000", occurredOn: addDays(start, 120), description: "Top up live roll" });
  await saveTransfer(tx, { fromAccountId: live, toAccountId: online, fromAmount: "700", toAmount: "512.00", occurredOn: addDays(start, 200), description: "Move to online (CAD→USD)" });
  await saveTransaction(tx, { accountId: live, type: "withdrawal", amount: "1500", occurredOn: addDays(start, 300), description: "Vacation" });
  await saveExpense(tx, { accountId: live, categoryId: cat("accommodation"), amount: "389.00", occurredOn: addDays(start, 250), description: "Hotel, Playground series", confirmDuplicate: true });
  console.log(`Created ${count} sessions and tournaments`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
