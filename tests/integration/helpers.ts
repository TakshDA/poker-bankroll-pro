import { randomUUID } from "node:crypto";
import { createSql, withUser, type Sql, type Tx } from "@/lib/server/db";
import { createLocalUser } from "@/lib/auth/local-store";
import { TEST_APP_URL } from "./env";

let shared: Sql | null = null;
export function db(): Sql {
  shared ??= createSql(TEST_APP_URL);
  return shared;
}

export async function closeDb() {
  await shared?.end();
  shared = null;
}

export async function newUser(): Promise<string> {
  const u = await createLocalUser(db(), `user-${randomUUID()}@example.com`, "correct horse battery staple");
  return u.id;
}

export function as<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUser(userId, fn, db());
}

export async function makeAccount(userId: string, over: Record<string, unknown> = {}): Promise<string> {
  return as(userId, async (tx) => {
    const row = { name: `Acc ${randomUUID().slice(0, 8)}`, currency: "CAD", openingBalanceMinor: 0, openingDate: "2026-01-01", ...over };
    return (await tx<{ id: string }[]>`insert into bankroll_accounts ${tx(row)} returning id`)[0].id;
  });
}
