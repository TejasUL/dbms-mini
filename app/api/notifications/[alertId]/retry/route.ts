import type { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { resolveBaseUrl } from "@/lib/server/base-url";
import { apiHandler } from "@/lib/server/handler";
import { fail, json } from "@/lib/server/http";
import { retryFailedAdmin } from "@/lib/server/notifications";
import { limiterKey, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ alertId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  return apiHandler(async () => {
    const user = await getAuthUser(request);
    if (!user) return fail(401, "You are not signed in.");
    if (!user.isAdmin) return fail(403, "Admin access required.");

    const limited = rateLimit(limiterKey(request, "notifications:retry", user.id), 5);
    if (!limited.ok) {
      return fail(429, "Too many requests — try again shortly.", {
        "Retry-After": String(limited.retryAfter),
      });
    }

    const { alertId } = await params;
    const requeued = await retryFailedAdmin(alertId, resolveBaseUrl(request));
    return json({ requeued }, 202);
  });
}
