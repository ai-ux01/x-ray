import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateUrlSyntax, isPrivateIp, assertPublicHost } from "./url-guard";

// These tests assume CRAWLER_ALLOW_PRIVATE_IPS is not enabled (the default).
// The env module reads process.env at import time, so we assert the default.

describe("validateUrlSyntax — accepts valid public URLs", () => {
  it("accepts a bare public domain and defaults to https", () => {
    const r = validateUrlSyntax("example.com");
    expect(r.ok).toBe(true);
    expect(r.url?.protocol).toBe("https:");
    expect(r.normalized).toBe("https://example.com/");
  });

  it("accepts an explicit https URL with a path", () => {
    const r = validateUrlSyntax("https://example.com/pricing?ref=nav");
    expect(r.ok).toBe(true);
    expect(r.url?.pathname).toBe("/pricing");
  });

  it("accepts http URLs", () => {
    const r = validateUrlSyntax("http://example.com");
    expect(r.ok).toBe(true);
    expect(r.url?.protocol).toBe("http:");
  });

  it("accepts subdomains", () => {
    const r = validateUrlSyntax("https://blog.example.co.uk");
    expect(r.ok).toBe(true);
  });

  it("strips the fragment during normalization", () => {
    const r = validateUrlSyntax("https://example.com/page#section");
    expect(r.ok).toBe(true);
    expect(r.normalized).not.toContain("#");
  });

  it("trims surrounding whitespace", () => {
    const r = validateUrlSyntax("   example.com  ");
    expect(r.ok).toBe(true);
  });
});

describe("validateUrlSyntax — rejects invalid input", () => {
  it("rejects empty input", () => {
    expect(validateUrlSyntax("").ok).toBe(false);
    expect(validateUrlSyntax("   ").ok).toBe(false);
  });

  it("rejects clearly malformed URLs", () => {
    const r = validateUrlSyntax("not a url");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/valid URL/i);
  });

  it("rejects non-http(s) schemes", () => {
    for (const u of ["ftp://example.com", "file:///etc/passwd", "javascript:alert(1)"]) {
      const r = validateUrlSyntax(u);
      expect(r.ok, u).toBe(false);
    }
  });

  it("rejects embedded credentials", () => {
    const r = validateUrlSyntax("https://user:pass@example.com");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/credentials/i);
  });

  it("rejects bare hostnames without a dot (likely internal)", () => {
    const r = validateUrlSyntax("intranet");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/full public domain/i);
  });
});

describe("validateUrlSyntax — blocks SSRF targets", () => {
  it("blocks localhost", () => {
    expect(validateUrlSyntax("http://localhost").ok).toBe(false);
    expect(validateUrlSyntax("http://localhost:8080").ok).toBe(false);
  });

  it("blocks loopback IP", () => {
    const r = validateUrlSyntax("http://127.0.0.1");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/private network/i);
  });

  it("blocks private IPv4 literals", () => {
    for (const ip of ["http://10.0.0.1", "http://192.168.1.1", "http://172.16.5.4"]) {
      expect(validateUrlSyntax(ip).ok, ip).toBe(false);
    }
  });

  it("blocks cloud metadata IP", () => {
    expect(validateUrlSyntax("http://169.254.169.254").ok).toBe(false);
  });
});

describe("isPrivateIp — IPv4", () => {
  const priv = [
    "10.0.0.1",
    "10.255.255.255",
    "127.0.0.1",
    "0.0.0.0",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.1.1",
    "100.64.0.1", // CGNAT
    "224.0.0.1", // multicast
    "169.254.169.254", // metadata
    "100.100.100.200", // alibaba metadata
  ];
  const pub = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255"];

  it.each(priv)("treats %s as private", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(pub)("treats %s as public", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("isPrivateIp — IPv6", () => {
  const priv = ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1"];
  const pub = ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"];

  it.each(priv)("treats %s as private", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(pub)("treats %s as public", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("assertPublicHost — DNS rebinding defense", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes when the host resolves to a public address", async () => {
    const dns = await import("node:dns");
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    await expect(assertPublicHost("example.com")).resolves.toBeUndefined();
  });

  it("throws when the host resolves to a private address (rebinding)", async () => {
    const dns = await import("node:dns");
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ] as never);
    await expect(assertPublicHost("evil.example.com")).rejects.toThrow(/private address/i);
  });

  it("throws when ANY resolved address is private", async () => {
    const dns = await import("node:dns");
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ] as never);
    await expect(assertPublicHost("mixed.example.com")).rejects.toThrow(/private address/i);
  });

  it("throws a friendly error when DNS resolution fails", async () => {
    const dns = await import("node:dns");
    vi.spyOn(dns.promises, "lookup").mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicHost("nope.invalid")).rejects.toThrow(/couldn't resolve/i);
  });

  it("blocks literal private IP hosts without DNS", async () => {
    await expect(assertPublicHost("192.168.1.1")).rejects.toThrow(/private network/i);
  });

  it("blocks known internal hostnames", async () => {
    await expect(assertPublicHost("localhost")).rejects.toThrow(/internal/i);
  });
});
