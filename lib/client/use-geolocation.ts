"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GeoStatus =
  | "idle"
  | "unsupported"
  | "insecure"
  | "prompting"
  | "granted"
  | "denied"
  | "unavailable";

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 5_000,
};

const INSECURE_MESSAGE =
  "Browsers only allow location over HTTPS or localhost. Open this app on localhost or through an HTTPS tunnel.";

const DENIED_MESSAGE =
  "Location is blocked for this site. Allow it in the browser's site settings (padlock icon), then try again.";

/** Geolocation is a secure-context feature: plain-HTTP LAN URLs get no prompt. */
function isInsecureContext(): boolean {
  return typeof window !== "undefined" && !window.isSecureContext;
}

function queryGeoPermission(): Promise<PermissionStatus> | null {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;
  try {
    return navigator.permissions.query({ name: "geolocation" });
  } catch {
    // Safari and some embedded browsers reject the Permissions API query.
    return null;
  }
}

function toPosition(position: GeolocationPosition): GeoPosition {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? undefined,
    timestamp: position.timestamp,
  };
}

export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startWatching = useCallback(() => {
    // Chrome/Firefox silently refuse geolocation on http://<LAN-IP>: no prompt,
    // just an immediate PERMISSION_DENIED. Surface the real cause instead.
    if (isInsecureContext()) {
      setStatus("insecure");
      setError(INSECURE_MESSAGE);
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      setError(null);
      return;
    }

    // Repeated "Enable" taps used to stack watchers; keep exactly one.
    stopWatching();

    const onSuccess = (next: GeolocationPosition) => {
      setPosition(toPosition(next));
      setStatus("granted");
      setError(null);
    };

    const onError = (next: GeolocationPositionError) => {
      if (next.code === next.PERMISSION_DENIED) {
        setStatus("denied");
        setError(DENIED_MESSAGE);
      } else if (next.code === next.TIMEOUT) {
        setStatus("unavailable");
        setError("Still waiting for a GPS fix — using the last known position.");
      } else {
        setStatus("unavailable");
        setError("GPS unavailable right now — using the last known position.");
      }
    };

    setStatus("prompting");
    setError(null);
    navigator.geolocation.getCurrentPosition(onSuccess, onError, WATCH_OPTIONS);
    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, WATCH_OPTIONS);
  }, [stopWatching]);

  /**
   * Called from the "Enable" button. Keep the geolocation call synchronous
   * inside the click (Safari requires a user gesture) and read the permission
   * state alongside it, because a `denied` site never shows a prompt again.
   */
  const requestPermission = useCallback(() => {
    if (isInsecureContext()) {
      setStatus("insecure");
      setError(INSECURE_MESSAGE);
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    queryGeoPermission()
      ?.then((permission) => {
        if (permission.state === "denied") {
          setStatus("denied");
          setError(DENIED_MESSAGE);
        }
      })
      .catch(() => {
        // Fall through — startWatching reports the browser's own error.
      });

    startWatching();
  }, [startWatching]);

  // Respect an existing decision on load: resume if already granted, explain if
  // blocked. Without this, an already-granted site shows no prompt on "Enable".
  useEffect(() => {
    if (isInsecureContext()) {
      setStatus("insecure");
      setError(INSECURE_MESSAGE);
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    const request = queryGeoPermission();
    if (!request) return;

    let cancelled = false;
    let permissionStatus: PermissionStatus | null = null;

    request
      .then((permission) => {
        if (cancelled) return;
        permissionStatus = permission;
        if (permission.state === "denied") {
          setStatus("denied");
          setError(DENIED_MESSAGE);
        } else if (permission.state === "granted") {
          startWatching();
        }
        permission.onchange = () => {
          if (permission.state === "granted") {
            startWatching();
          } else if (permission.state === "denied") {
            setStatus("denied");
            setError(DENIED_MESSAGE);
          } else {
            setStatus("idle");
            setError(null);
          }
        };
      })
      .catch(() => {
        // Permissions API unsupported — the button still works.
      });

    return () => {
      cancelled = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [startWatching]);

  useEffect(() => stopWatching, [stopWatching]);

  return { status, position, error, requestPermission, startWatching, stopWatching };
}
