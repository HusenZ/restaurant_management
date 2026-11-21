import type { NextConfig } from "next";

// The guest app and dashboard are client-rendered against the FastAPI backend, so Cache Components /
// partial prefetching (which require Suspense around every URL-dependent hook) are intentionally off.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The route badge sits over the guest cart bar on phones; compile/runtime errors still show.
  devIndicators: false,
  allowedDevOrigins: ["*.local", "192.168.*.*", "10.*.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
