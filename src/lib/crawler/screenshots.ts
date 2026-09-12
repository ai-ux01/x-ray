// Screenshot storage.
//
// Screenshots are written to a local directory and referenced by a stable key
// (never stored as blobs in Postgres). This is swappable for object storage
// (S3/R2) later without touching callers — only these functions change.

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), ".screenshots");

export async function saveScreenshot(key: string, data: Buffer): Promise<string> {
  await fs.mkdir(ROOT, { recursive: true });
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  await fs.writeFile(path.join(ROOT, safeKey), data);
  return safeKey;
}

export async function readScreenshot(key: string): Promise<Buffer | null> {
  const safeKey = path.basename(key); // prevent path traversal
  try {
    return await fs.readFile(path.join(ROOT, safeKey));
  } catch {
    return null;
  }
}
