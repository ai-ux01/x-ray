// Report file storage (PDFs).
//
// Mirrors the screenshot storage approach: files are written to a local
// directory and referenced by a stable key, never stored as blobs in the DB.
// Swappable for object storage later without touching callers.

import { promises as fs } from "node:fs";
import path from "node:path";

// Storage root is configurable via ARTIFACT_DIR so a container host can point
// it at a persistent disk. Defaults to a local dir for zero-config dev.
const ROOT = process.env.ARTIFACT_DIR
  ? path.join(process.env.ARTIFACT_DIR, "reports")
  : path.join(process.cwd(), ".reports");

export async function saveReportFile(key: string, data: Buffer): Promise<string> {
  await fs.mkdir(ROOT, { recursive: true });
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  await fs.writeFile(path.join(ROOT, safeKey), data);
  return safeKey;
}

export async function readReportFile(key: string): Promise<Buffer | null> {
  const safeKey = path.basename(key); // prevent path traversal
  try {
    return await fs.readFile(path.join(ROOT, safeKey));
  } catch {
    return null;
  }
}
