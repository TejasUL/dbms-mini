import os from "node:os";

/** Port this app is served on when nothing better is known. */
const DEFAULT_PORT = "3000";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Hostname without the port, IPv6 brackets included in the input.
 * "localhost:3000" -> "localhost", "[::1]:3000" -> "::1".
 */
function hostnameOf(host: string): string {
  const value = host.trim();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? value.slice(1) : value.slice(1, end);
  }
  return value.split(":")[0] ?? "";
}

function isLoopbackHost(host: string): boolean {
  const name = hostnameOf(host).toLowerCase();
  return (
    name === "" ||
    name === "localhost" ||
    name === "127.0.0.1" ||
    name === "::1" ||
    name === "0.0.0.0"
  );
}

function isLoopbackUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).host);
  } catch {
    return true;
  }
}

function portOf(host: string): string | null {
  return /:(\d+)$/.exec(host.trim())?.[1] ?? null;
}

function portOfUrl(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).port || null;
  } catch {
    return null;
  }
}

/**
 * First usable LAN IPv4 address so a tracking link works from another device.
 * Virtual/bridge interfaces are ranked last, private LAN ranges first.
 */
function lanAddress(): string | null {
  const candidates: Array<{ name: string; address: string }> = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      candidates.push({ name, address: entry.address });
    }
  }
  if (candidates.length === 0) return null;

  const score = ({ name, address }: { name: string; address: string }): number => {
    let value = 0;
    if (/^(docker|br-|veth|virbr|vmnet|tun|tap|zt)/i.test(name)) value -= 10;
    if (address.startsWith("192.168.")) value += 3;
    else if (address.startsWith("10.")) value += 2;
    else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) value += 1;
    return value;
  };

  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0]?.address ?? null;
}

/**
 * Base URL used to build the tokenized `/track/<token>` link inside emails.
 *
 * Priority:
 * 1. `WEB_BASE_URL`, when it points at a real (non-loopback) host — e.g. a
 *    tunnel or deployed domain.
 * 2. The host the request actually arrived on (X-Forwarded-Host / Host), so
 *    opening the app at `http://192.168.1.20:3000` emails that same URL.
 * 3. The machine's LAN IPv4 address when the app was reached via localhost —
 *    localhost links are useless to a contact on their phone.
 * 4. `http://localhost:<port>` as a last resort.
 *
 * Callers pass the inbound request; background retries may omit it.
 */
export function resolveBaseUrl(request?: Request): string {
  const configured = stripTrailingSlash((process.env.WEB_BASE_URL ?? "").trim());
  if (configured && !isLoopbackUrl(configured)) return configured;

  const forwardedHost = request?.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request?.headers.get("host")?.trim() || "";
  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto === "https" ? "https" : "http";

  if (host && !isLoopbackHost(host)) return `${proto}://${host}`;

  const port = portOf(host) ?? portOfUrl(configured) ?? DEFAULT_PORT;
  const lan = lanAddress();
  if (lan) return `${proto}://${lan}:${port}`;

  return configured || `${proto}://localhost:${port}`;
}
