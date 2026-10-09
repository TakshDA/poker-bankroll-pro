import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "../server/env";

/**
 * Private attachment storage. Object keys are generated server-side as
 * `<userId>/<uuid>` — never derived from user input — and files are only ever
 * served through an authenticated route that first checks ownership via RLS.
 */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

function assertKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private file(key: string) {
    assertKey(key);
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true, mode: 0o700 });
    await writeFile(f, data, { mode: 0o600 });
  }
  async get(key: string) {
    return readFile(this.file(key));
  }
  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
}

/** Supabase Storage (private bucket) using the server-only service role key. Untested without credentials. */
class SupabaseStorage implements Storage {
  private client = createClient(env().NEXT_PUBLIC_SUPABASE_URL!, env().SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  constructor(private bucket: string) {}
  async put(key: string, data: Buffer, contentType: string) {
    assertKey(key);
    const { error } = await this.client.storage.from(this.bucket).upload(key, data, { contentType, upsert: false });
    if (error) throw new Error("Upload failed");
  }
  async get(key: string) {
    assertKey(key);
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) throw new Error("Download failed");
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(key: string) {
    assertKey(key);
    await this.client.storage.from(this.bucket).remove([key]);
  }
}

let storage: Storage | null = null;
export function getStorage(): Storage {
  if (storage) return storage;
  const e = env();
  if (e.STORAGE_PROVIDER === "supabase") {
    if (!e.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for Supabase storage");
    storage = new SupabaseStorage(e.SUPABASE_BUCKET);
  } else {
    storage = new LocalStorage(path.resolve(process.cwd(), e.ATTACHMENTS_DIR));
  }
  return storage;
}

export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
};
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Verify magic bytes for binary types so a renamed file cannot pose as an image/PDF. */
export function sniffMatches(contentType: string, data: Buffer): boolean {
  const b = data;
  switch (contentType) {
    case "image/jpeg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp":
      return b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
    case "image/heic":
      return b.subarray(4, 8).toString("ascii") === "ftyp";
    case "application/pdf":
      return b.subarray(0, 5).toString("ascii") === "%PDF-";
    default:
      return !b.subarray(0, 4096).includes(0); // text: no NUL bytes
  }
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file";
}
