import type { Alert, EmergencyContact, NotificationDelivery } from "@prisma/client";
import type { NotificationDeliveryDto, NotificationStatus } from "@/lib/types";
import { resolveBaseUrl } from "./base-url";
import { prisma } from "./db";
import { emailHtml, emailSubject, sendEmail } from "./email";
import { ApiError } from "./errors";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 250, 1_000];
const inFlight = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create one queued email delivery per contact that has an email address.
 * SMS is intentionally not part of this build.
 */
export async function createDeliveriesForAlert(alert: Alert, userId: string): Promise<number> {
  const contacts = await prisma.emergencyContact.findMany({
    where: { userId, email: { not: null } },
  });

  let created = 0;
  for (const contact of contacts) {
    if (!contact.email) continue;
    try {
      await prisma.notificationDelivery.create({
        data: {
          alertId: alert.id,
          contactId: contact.id,
          channel: "email",
        },
      });
      created += 1;
    } catch (error) {
      // A unique delivery may already exist if the trigger is retried.
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  return created;
}

/** Queue all queued deliveries for one alert without blocking the request. */
export async function dispatchAlertNotifications(
  alertId: string,
  baseUrl?: string,
): Promise<void> {
  const deliveries = await prisma.notificationDelivery.findMany({
    where: { alertId, status: "queued" },
    select: { id: true },
  });
  for (const delivery of deliveries) {
    void processDelivery(delivery.id, baseUrl);
  }
}

async function processDelivery(deliveryId: string, baseUrl?: string): Promise<void> {
  if (inFlight.has(deliveryId)) return;
  inFlight.add(deliveryId);

  try {
    const delivery = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        contact: true,
        alert: { include: { user: { select: { name: true } } } },
      },
    });
    if (!delivery || delivery.status !== "queued" || !delivery.contact.email) return;

    const trackingUrl = `${baseUrl ?? resolveBaseUrl()}/track/${delivery.alert.trackingToken}`;
    const subject = emailSubject(delivery.alert.user.name);
    const html = emailHtml({
      userName: delivery.alert.user.name,
      triggeredAt: delivery.alert.triggeredAt.toISOString(),
      trackingUrl,
    });

    let lastError = "Unknown delivery error.";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { attempts: { increment: 1 }, status: "queued" },
      });

      try {
        await sendEmail(delivery.contact.email, subject, html);
        await prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: "sent", sentAt: new Date(), lastError: null },
        });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt >= MAX_ATTEMPTS) break;
        await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
      }
    }

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", lastError },
    });
    console.warn(`[notifications] delivery ${delivery.id} failed: ${lastError}`);
  } catch (error) {
    console.error(`[notifications] delivery ${deliveryId} crashed`, error);
  } finally {
    inFlight.delete(deliveryId);
  }
}

/** Re-drive failed deliveries for an alert (admin only at the route layer). */
export async function retryFailedAdmin(alertId: string, baseUrl?: string): Promise<number> {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new ApiError(404, "Alert not found.");

  const failed = await prisma.notificationDelivery.findMany({
    where: { alertId, status: "failed" },
    select: { id: true },
  });

  for (const delivery of failed) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: "queued", attempts: 0, lastError: null },
    });
  }

  await dispatchAlertNotifications(alertId, baseUrl);
  return failed.length;
}

export async function getStatus(
  userId: string,
  alertId: string,
): Promise<NotificationDeliveryDto[]> {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert || alert.userId !== userId) throw new ApiError(404, "Alert not found.");

  const rows = await prisma.notificationDelivery.findMany({
    where: { alertId },
    include: { contact: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDeliveryDto);
}

function toDeliveryDto(
  row: NotificationDelivery & { contact: Pick<EmergencyContact, "name"> },
): NotificationDeliveryDto {
  return {
    id: row.id,
    contactId: row.contactId,
    contactName: row.contact.name,
    channel: "email",
    status: row.status as NotificationStatus,
    attempts: row.attempts,
    lastError: row.lastError,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
