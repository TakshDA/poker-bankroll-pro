import "server-only";
import postgres from "postgres";
import { env } from "./env";

export type Sql = postgres.Sql<Record<string, unknown>>;
export type Tx = postgres.TransactionSql<Record<string, unknown>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** int8 -> JS number, refusing values that would lose precision. */
const bigintAsNumber = {
  to: 20,
  from: [20],
  serialize: (x: number | bigint) => x.toString(),
  parse: (x: string) => {
    const n = Number(x);
    if (!Number.isSafeInteger(n)) throw new Error("Integer value out of safe range");
    return n;
  },
};

export function createSql(url: string): Sql {
  return postgres(url, {
    // Serverless (Vercel) runs many small instances; keep each pool small.
    max: process.env.VERCEL ? 2 : 10,
    idle_timeout: 20,
    // Transaction-mode poolers (Supabase :6543) do not support prepared statements.
    prepare: !url.includes(":6543"),
    transform: postgres.camel,
    onnotice: () => {},
    types: {
      bigint: bigintAsNumber,
      // Keep DATE as 'YYYY-MM-DD' strings (no time-zone shifting).
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      // Timestamps as ISO strings.
      timestamptz: {
        to: 1184,
        from: [1184, 1114],
        serialize: (x: string | Date) => (x instanceof Date ? x.toISOString() : x),
        parse: (x: string) => new Date(x).toISOString(),
      },
    },
  }) as unknown as Sql;
}

const globalForDb = globalThis as unknown as { __pbpSql?: Sql };

/** Connection pool (server-owned role; never used for user data directly). */
export function sql(): Sql {
  if (!globalForDb.__pbpSql) globalForDb.__pbpSql = createSql(env().DATABASE_URL);
  return globalForDb.__pbpSql;
}

/**
 * Run `fn` in a transaction as the RLS-restricted `authenticated` role with
 * the user's id as the JWT `sub` claim — the same mechanism Supabase uses.
 * Every user-data query in the app goes through here.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>, db: Sql = sql()): Promise<T> {
  if (!isUuid(userId)) throw new Error("Invalid user id");
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return db.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`;
    return fn(tx);
  }) as Promise<T>;
}
