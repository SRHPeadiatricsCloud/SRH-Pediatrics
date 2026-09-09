import type { NextConfig } from "next";

const sandboxId = process.env.E2B_SANDBOX_ID;

const nextConfig: NextConfig = {
  allowedDevOrigins: sandboxId ? [`3000-${sandboxId}.e2b.app`] : undefined,
};

export default nextConfig;
