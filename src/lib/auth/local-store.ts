/**
 * Local authentication store (AUTH_PROVIDER=local). Users live in the
 * Supabase-compatible `auth.users` table created by the local shim; sessions
 * are random 256-bit tokens of which only a SHA-256 hash is stored, so a
 * database leak does not reveal usable session cookies.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "../server/db";
import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";

export const SESSION_TTL_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createLocalUser(db: Sql, email: string, password: string): Promise<AuthUser> {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("Invalid email address");
  if (password.length < PASSWORD_MIN_LENGTH) throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  const hash = await hashPassword(password);
  const rows = await db<AuthUser[]>`
    insert into auth.users (email, encrypted_password) values (${e}, ${hash})
    returning id, email`;
  return rows[0];
}

export async function countLocalUsers(db: Sql): Promise<number> {
  const rows = await db<{ count: number }[]>`select count(*)::int as count from auth.users`;
  return rows[0].count;
}

export async function authenticateLocal(db: Sql, email: string, password: string): Promise<AuthUser | null> {
  const rows = await db<{ id: string; email: string; encryptedPassword: string | null }[]>`
    select id, email, encrypted_password from auth.users where email = ${normalizeEmail(email)}`;
  const user = rows[0];
  const ok = await verifyPassword(password, user?.encryptedPassword ?? null);
  return ok && user ? { id: user.id, email: user.email } : null;
}

export async function createLocalSession(db: Sql, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  await db`insert into auth.local_sessions (user_id, token_hash, expires_at) values (${userId}, ${hashToken(token)}, ${expiresAt.toISOString()})`;
  return { token, expiresAt };
}

export async function resolveLocalSession(db: Sql, token: string): Promise<AuthUser | null> {
  if (!token || token.length > 200) return null;
  const rows = await db<AuthUser[]>`
    select u.id, u.email
    from auth.local_sessions s join auth.users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.revoked_at is null and s.expires_at > now()`;
  return rows[0] ?? null;
}

export async function revokeLocalSession(db: Sql, token: string): Promise<void> {
  await db`update auth.local_sessions set revoked_at = now() where token_hash = ${hashToken(token)} and revoked_at is null`;
}

export async function revokeAllLocalSessions(db: Sql, userId: string): Promise<void> {
  await db`update auth.local_sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
}

export async function changeLocalPassword(db: Sql, userId: string, current: string, next: string): Promise<boolean> {
  const rows = await db<{ encryptedPassword: string | null }[]>`select encrypted_password from auth.users where id = ${userId}`;
  if (!rows[0] || !(await verifyPassword(current, rows[0].encryptedPassword))) return false;
  if (next.length < PASSWORD_MIN_LENGTH) throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  await db`update auth.users set encrypted_password = ${await hashPassword(next)}, updated_at = now() where id = ${userId}`;
  await revokeAllLocalSessions(db, userId);
  return true;
}

/** Permanently delete a user; every owned row cascades from auth.users. */
export async function deleteLocalUser(db: Sql, userId: string): Promise<void> {
  await db`delete from auth.users where id = ${userId}`;
}
