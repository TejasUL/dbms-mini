import os from "node:os";
import path from "node:path";
import type { NextConfig } from "next";

// /home/puneeth/package-lock.json sits above this repo. Without pinning the
// root, Next warns every time it infers (and then ignores) that lockfile.
const projectRoot = path.resolve(__dirname);

/**
 * Dev-only: opening the app over the LAN (e.g. from a phone) makes HMR and
 * other /_next requests cross-origin, which Next blocks unless the host is
 * listed. The machine's LAN IP changes between networks, so allow every
 * non-internal IPv4 it currently has instead of hardcoding one. (mDNS names
 * like `puneeth-v.local` are covered too.)
 */
function devOrigins(): string[] {
  const hosts = new Set<string>(["*.local"]);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) hosts.add(entry.address);
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer"],
  allowedDevOrigins: devOrigins(),
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
