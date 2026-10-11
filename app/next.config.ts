import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The advisor package lives one level up (../advisor) and ships TypeScript source.
  transpilePackages: ["advisor"],
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
