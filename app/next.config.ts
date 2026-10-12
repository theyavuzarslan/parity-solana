import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // advisor and shared live one level up (../advisor, ../shared) and ship TypeScript source.
  transpilePackages: ["advisor", "shared"],
  // Never ship local key material or env files in serverless bundles. The dev-wallet routes read
  // ../keys/taker.json at runtime under `next dev` only; file tracing would otherwise copy it.
  outputFileTracingExcludes: {
    "*": ["../keys/**", "./keys/**", "../.env*", "./.env*"],
  },
  turbopack: {
    root: path.join(__dirname, ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
