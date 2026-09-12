// ESLint flat config (ESLint 9 + Next 16).
// Replaces the legacy .eslintrc.json. eslint-config-next 16 ships a native
// flat config, so we spread it directly (no FlatCompat needed).

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const configs = Array.isArray(nextCoreWebVitals)
  ? nextCoreWebVitals
  : [nextCoreWebVitals];

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "coverage/**",
      "prisma/**",
      "next-env.d.ts",
    ],
  },
  ...configs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
