import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Native tsconfig path resolution for the "@/*" alias.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globals: true,
  },
});
