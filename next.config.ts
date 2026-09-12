import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@prisma/client",
    "ioredis",
    "playwright",
    "cheerio",
    "lighthouse",
    "chrome-launcher",
    "@axe-core/playwright",
  ],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
