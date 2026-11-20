import type { Alert, AlertLocation } from "@prisma/client";
import type { AlertDto, AlertLocationDto } from "@/lib/types";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { publish } from "./events";
import {
  createDeliveriesForAlert,
  dispatchAlertNotifications,
} from "./notifications";

type AlertWithLocation = Alert & {
  lastLocation: AlertLocation | null;
  _count: { locations: number };
};

function toLocationDto(location: AlertLocation): AlertLocationDto {
  return {
    id: location.id,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    recordedAt: location.recordedAt.toISOString(),
  };
}

function toAlertDto(alert: AlertWithLocation): AlertDto {
  return {
    id: alert.id,
    status: alert.status as AlertDto["status"],
    triggeredAt: alert.triggeredAt.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    lastLocation: alert.lastLocation ? toLocationDto(alert.lastLocation) : null,
    locationCount: alert._count.locations,
  };
}

function channels(alert: Alert): string[] {
  return [`alert:${alert.id}`, `track:${alert.trackingToken}`];
}

export async function findOwned(userId: string, alertId: string): Promise<Alert> {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert || alert.userId !== userId) throw new ApiError(404, "Alert not found.");
  return alert;
}

/**
 * Fire a silent SOS: create the alert, record the first fix when supplied,
 * persist one email delivery per reachable contact, and dispatch in the
 * background so the trigger endpoint stays fast.
 */
export async function triggerAlert(
  userId: string,
  input: {
    triggerType?: "tap" | "longPress";
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  },
  /** Public base URL for the tracking link (network URL, not localhost). */
  baseUrl?: string,
): Promise<AlertDto> {
  const alert = await prisma.alert.create({ data: { userId } });

  await prisma.activityLog.create({
    data: { alertId: alert.id, eventType: "triggered", actor: `user:${userId}` },
  });

  if (input.latitude !== undefined && input.longitude !== undefined) {
    await addLocation(userId, alert.id, {
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
    });
  }

  await createDeliveriesForAlert(alert, userId);
  void dispatchAlertNotifications(alert.id, baseUrl).catch((error) => {
    console.error(`[alerts] notification dispatch for ${alert.id} failed`, error);
  });

  return getAlert(userId, alert.id);
}

export async function addLocation(
  userId: string,
  alertId: string,
  input: { latitude: number; longitude: number; accuracy?: number },
): Promise<AlertLocationDto> {
  const alert = await findOwned(userId, alertId);
  if (alert.status === "resolved") {
    throw new ApiError(409, "Alert is already resolved — location streaming stopped.");
  }

  const location = await prisma.alertLocation.create({
    data: {
      alertId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy ?? null,
    },
  });

  await prisma.alert.update({
    where: { id: alertId },
    data: { lastLocationId: location.id },
  });

  publish(channels(alert), "location");
  return toLocationDto(location);
}

export async function updateStatus(
  userId: string,
  alertId: string,
  status: "acknowledged" | "resolved",
): Promise<AlertDto> {
  const alert = await findOwned(userId, alertId);
  if (alert.status === "resolved") throw new ApiError(400, "Alert is already resolved.");
  if (status === "acknowledged" && alert.status !== "sent") {
    throw new ApiError(400, "Only a sent alert can be acknowledged.");
  }

  await prisma.alert.update({
    where: { id: alertId },
    data: {
      status,
      ...(status === "resolved" ? { resolvedAt: new Date() } : {}),
    },
  });
  await prisma.activityLog.create({
    data: { alertId, eventType: status, actor: `user:${userId}` },
  });

  publish(channels(alert), "status");
  return getAlert(userId, alertId);
}

export async function getAlert(userId: string, alertId: string): Promise<AlertDto> {
  await findOwned(userId, alertId);
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { lastLocation: true, _count: { select: { locations: true } } },
  });
  if (!alert) throw new ApiError(404, "Alert not found.");
  return toAlertDto(alert);
}

export async function listAlerts(userId: string): Promise<AlertDto[]> {
  const alerts = await prisma.alert.findMany({
    where: { userId },
    orderBy: { triggeredAt: "desc" },
    include: { lastLocation: true, _count: { select: { locations: true } } },
  });
  return alerts.map(toAlertDto);
}
