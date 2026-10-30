import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Files read at runtime with fs (prompts, Composio catalog snapshot, library guides) must ship with the server code.
  outputFileTracingIncludes: {
    "/**": ["./prompts/**/*", "./data/**/*", "./guides/**/*"],
  },
};

export default nextConfig;
