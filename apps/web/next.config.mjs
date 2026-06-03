import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin file tracing to the monorepo root so the workspace is resolved
  // correctly regardless of stray lockfiles elsewhere on the machine.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  // Keep production builds resilient on CI/Vercel: type errors still surface
  // locally via `pnpm typecheck`, and there is no ESLint config in this app.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
