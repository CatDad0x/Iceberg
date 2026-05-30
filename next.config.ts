import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from trying to bundle these Node.js / large packages.
  // They run server-side only (API route) and should be required at runtime.
  serverExternalPackages: ["ethers", "@anthropic-ai/sdk", "@upstash/redis"],

  // Allow images from external domains used for protocol icons.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "icons.llama.fi" },
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
    ],
  },
};

export default nextConfig;
