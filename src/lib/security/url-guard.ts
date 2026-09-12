// SSRF protection & URL validation.
//
// The core rule: a user must never be able to make our server fetch an
// arbitrary internal resource. We validate scheme + shape here, and the
// crawler additionally resolves DNS and re-checks the resolved IPs before
// every request (see `assertPublicHost`) to defend against DNS rebinding.

import { promises as dns } from "node:dns";
import net from "node:net";
import { env } from "@/lib/env";

export interface UrlValidationResult {
  ok: boolean;
  url?: URL;
  normalized?: string;
  error?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

// Cloud metadata endpoints and other sensitive addresses.
const BLOCKED_EXACT_IPS = new Set([
  "169.254.169.254", // AWS/GCP/Azure IMDS
  "100.100.100.200", // Alibaba metadata
]);

export function validateUrlSyntax(input: string): UrlValidationResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Please enter a website URL." };

  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are supported." };
  }

  if (url.username || url.password) {
    return { ok: false, error: "URLs with embedded credentials are not allowed." };
  }

  const host = url.hostname.toLowerCase();
  if (!host || !host.includes(".")) {
    // Bare hostnames without a dot are almost always internal.
    if (!env.crawler.allowPrivateIps) {
      return { ok: false, error: "Please enter a full public domain, e.g. example.com." };
    }
  }

  if (BLOCKED_HOSTNAMES.has(host) && !env.crawler.allowPrivateIps) {
    return { ok: false, error: "Local and internal addresses cannot be analyzed." };
  }

  // Reject obviously private literals early (defense in depth; DNS re-checked later).
  if (net.isIP(host) && isPrivateIp(host) && !env.crawler.allowPrivateIps) {
    return { ok: false, error: "Private network addresses cannot be analyzed." };
  }

  // Normalize: strip fragments, keep pathname + search.
  url.hash = "";
  return { ok: true, url, normalized: url.toString() };
}

export function isPrivateIp(ip: string): boolean {
  if (BLOCKED_EXACT_IPS.has(ip)) return true;

  const type = net.isIP(ip);
  if (type === 4) return isPrivateIpv4(ip);
  if (type === 6) return isPrivateIpv6(ip);
  return false;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

/**
 * Resolves the hostname and verifies every returned address is public.
 * MUST be called immediately before each outbound crawler request to
 * mitigate DNS rebinding. Throws with a user-safe message on failure.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (env.crawler.allowPrivateIps) return;

  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error("Local and internal addresses cannot be analyzed.");
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error("Private network addresses cannot be analyzed.");
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("We couldn't resolve that domain. Check the URL and try again.");
  }

  if (addresses.length === 0) {
    throw new Error("We couldn't resolve that domain. Check the URL and try again.");
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error("This domain resolves to a private address and cannot be analyzed.");
    }
  }
}
