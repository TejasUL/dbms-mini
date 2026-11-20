import type { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { triggerAlert } from "@/lib/server/alerts";
import { resolveBaseUrl } from "@/lib/server/base-url";
import { apiHandler } from "@/lib/server/handler";
import { fail, json, parseBody } from "@/lib/server/http";
import { limiterKey, rateLimit } from "@/lib/server/rate-limit";
import { triggerAlertSchema } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fire a silent SOS. Deliberately permissive (5/min per user) so a genuine
 * re-trigger is never blocked by abuse protection.
 */
export async function POST(request: NextRequest) {
  return apiHandler(async () => {
    const user = await getAuthUser(request);
    if (!user) return fail(401, "You are not signed in.");
    const limited = rateLimit(limiterKey(request, "alerts:trigger", user.id), 5);
    if (!limited.ok) {
      return fail(429, "Too many requests — try again shortly.", {
        "Retry-After": String(limited.retryAfter),
      });
    }

    const parsed = await parseBody(request, triggerAlertSchema);
    if (!parsed.ok) return parsed.response;
    return json(await triggerAlert(user.id, parsed.data, resolveBaseUrl(request)), 201);
  });
}
