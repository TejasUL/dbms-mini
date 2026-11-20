"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { AlertDto, TriggerType } from "@/lib/types";
import { useContacts } from "@/lib/client/contacts";
import { useGeolocation, type GeoPosition } from "@/lib/client/use-geolocation";
import {
  sendLocationViaREST,
  useAlert,
  useTriggerAlert,
  useUpdateAlertStatus,
} from "@/lib/client/alerts";
import { SosButton } from "./SosButton";
import { AlertTriangleIcon, MapPinIcon, PlusIcon, UsersIcon } from "./icons";

const LOCATION_INTERVAL_MS = 12_000;
const ACTIVE_ALERT_KEY = "bsafe.activeAlertId";

function readActiveAlertId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_ALERT_KEY);
}

/**
 * SOS trigger panel: geolocation onboarding (permission requested up-front, not
 * at the crisis moment), silent tap/long-press trigger, and the live location
 * stream that runs until the alert is resolved.
 */
export function SosPanel() {
  const contacts = useContacts();
  const geo = useGeolocation();
  const trigger = useTriggerAlert();
  const updateStatus = useUpdateAlertStatus();
  const queryClient = useQueryClient();

  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const positionRef = useRef<GeoPosition | null>(null);
  const position = geo.position;

  useEffect(() => {
    setActiveAlertId(readActiveAlertId());
  }, []);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const alertQuery = useAlert(activeAlertId);
  const alert: AlertDto | null = alertQuery.data ?? null;
  const resolved = alert?.status === "resolved";
  const isActive = Boolean(activeAlertId) && !resolved;

  const clearActiveAlert = useCallback(() => {
    localStorage.removeItem(ACTIVE_ALERT_KEY);
    setActiveAlertId(null);
  }, []);

  const handleTrigger = useCallback(
    (type: TriggerType) => {
      if (isActive || contacts.data?.length === 0) return;
      const last = positionRef.current;
      trigger.mutate(
        {
          triggerType: type,
          ...(last
            ? { latitude: last.latitude, longitude: last.longitude, accuracy: last.accuracy }
            : {}),
        },
        {
          onSuccess: (created) => {
            localStorage.setItem(ACTIVE_ALERT_KEY, created.id);
            setActiveAlertId(created.id);
            queryClient.setQueryData(["alert", created.id], created);
          },
        },
      );
    },
    [isActive, contacts.data?.length, trigger, queryClient],
  );

  const handleResolve = useCallback(() => {
    if (!activeAlertId) return;
    updateStatus.mutate(
      { id: activeAlertId, status: "resolved" },
      { onSuccess: clearActiveAlert },
    );
  }, [activeAlertId, updateStatus, clearActiveAlert]);

  // A saved alert that no longer exists (or belongs to another account) is stale.
  useEffect(() => {
    if (
      activeAlertId &&
      alertQuery.isError &&
      isAxiosError(alertQuery.error) &&
      alertQuery.error.response?.status === 404
    ) {
      clearActiveAlert();
    }
  }, [activeAlertId, alertQuery.isError, alertQuery.error, clearActiveAlert]);

  // Live owner updates over SSE; 15s polling remains as a fallback.
  useEffect(() => {
    if (!activeAlertId || resolved) return;
    const source = new EventSource(`/api/alerts/${activeAlertId}/stream`);
    source.addEventListener("update", () => {
      void queryClient.invalidateQueries({ queryKey: ["alert", activeAlertId] });
    });
    return () => source.close();
  }, [activeAlertId, resolved, queryClient]);

  // Stop streaming and forget the active id once the alert resolves.
  useEffect(() => {
    if (resolved) clearActiveAlert();
  }, [resolved, clearActiveAlert]);

  // Live location loop: one fix every 12s, plus last-known on backgrounding.
  useEffect(() => {
    if (!activeAlertId || resolved) return;
    const alertId = activeAlertId;

    const tick = () => {
      const current = positionRef.current;
      if (!current) return;
      sendLocationViaREST(alertId, {
        latitude: current.latitude,
        longitude: current.longitude,
        accuracy: current.accuracy,
      }).catch(() => {
        // Degraded network — next tick retries.
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") tick();
    };

    tick();
    const intervalId = window.setInterval(tick, LOCATION_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeAlertId, resolved]);

  const count = contacts.data?.length ?? 0;
  const geoNeedsFix = geo.status === "denied" || geo.status === "insecure";
  const canRequestLocation =
    geo.status === "idle" ||
    geo.status === "prompting" ||
    geo.status === "denied" ||
    geo.status === "unavailable";
  const geoTitle =
    geo.status === "granted"
      ? "Live location on"
      : geo.status === "insecure"
        ? "Location needs HTTPS"
        : geo.status === "denied"
          ? "Location blocked in browser"
          : geo.status === "unsupported"
            ? "Location unsupported"
            : geo.status === "unavailable"
              ? "GPS unavailable"
              : "Enable location during setup";
  const geoBody =
    geo.status === "granted"
      ? "Trusted contacts will see your live position during an alert."
      : geo.status === "insecure"
        ? "Browsers only share location over HTTPS or localhost. Open this app on localhost or through an HTTPS tunnel."
        : geo.status === "denied"
          ? "Allow location for this site in the browser's site settings (padlock icon), then retry."
          : geo.status === "unsupported"
            ? "This browser does not support geolocation."
            : geo.status === "unavailable"
              ? "GPS unavailable right now — using the last known position."
              : "Requested up-front so SOS works instantly in an emergency.";

  if (contacts.isError) {
    return <p className="text-sm text-signal-soft">Could not load contacts.</p>;
  }

  if (contacts.isPending) {
    return <p className="text-sm text-mist">Loading…</p>;
  }

  if (count === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line bg-panel/60 p-10 text-center">
        <UsersIcon className="mx-auto h-8 w-8 text-faint" />
        <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-caution">
          <AlertTriangleIcon className="h-4 w-4 shrink-0" />
          SOS is disabled — you need at least one emergency contact.
        </p>
        <a
          href="/contacts"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-signal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-signal-bright"
        >
          <PlusIcon className="h-4 w-4" />
          Add an emergency contact
        </a>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Location onboarding — permission requested here, not at the crisis moment. */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5">
        <div className="flex items-start gap-3">
          <MapPinIcon
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              geo.status === "granted"
                ? "text-safe"
                : geoNeedsFix
                  ? "text-caution"
                  : "text-faint"
            }`}
          />
          <div>
            <p className="text-sm font-medium text-chalk">{geoTitle}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-mist">{geoBody}</p>
          </div>
        </div>
        {canRequestLocation && (
          <button
            onClick={() => geo.requestPermission()}
            className="shrink-0 rounded-lg border border-line-bright px-3 py-1.5 font-mono text-xs font-medium text-chalk transition-colors hover:border-safe/60 hover:text-safe-soft"
          >
            {geo.status === "denied" ? "Retry" : "Enable"}
          </button>
        )}
      </div>

      <div className="flex justify-center py-2">
        <SosButton
          onTrigger={handleTrigger}
          disabled={trigger.isPending}
          active={isActive}
        />
      </div>

      {trigger.isPending && (
        <p className="text-center font-mono text-xs text-faint">…</p>
      )}

      {isActive && (
        <div className="space-y-1.5 text-center">
          <p className="font-mono text-xs tracking-[0.22em] text-signal-soft/80">SOS ACTIVE</p>
          {alert?.locationCount !== undefined && (
            <p className="font-mono text-xs text-mist">
              {alert.locationCount} location updates shared
            </p>
          )}
          <button
            onClick={handleResolve}
            disabled={updateStatus.isPending}
            className="text-xs text-faint underline-offset-4 transition-colors hover:text-mist hover:underline"
          >
            {updateStatus.isPending ? "Resolving…" : "Resolve alert"}
          </button>
        </div>
      )}
    </div>
  );
}
