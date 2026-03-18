import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { ConversionEvent } from "@shared/schema";

declare global {
  interface Window {
    fbq?: (action: string, eventName: string) => void;
    __pixelEventContext?: { path: string; firedEvents: Set<string> };
  }
}

function getPixelContext(pagePath: string): Set<string> {
  if (!window.__pixelEventContext || window.__pixelEventContext.path !== pagePath) {
    window.__pixelEventContext = { path: pagePath, firedEvents: new Set() };
  }
  return window.__pixelEventContext.firedEvents;
}

export function firePixelEvent(eventName: string, pagePath: string): void {
  if (!window.fbq) return;
  const firedEvents = getPixelContext(pagePath);
  if (firedEvents.has(eventName)) return;
  firedEvents.add(eventName);
  window.fbq("track", eventName);
}

export function useMetaPixelEvents() {
  const [location] = useLocation();
  const firedRef = useRef<string | null>(null);

  const { data: conversionEvents } = useQuery<ConversionEvent[]>({
    queryKey: ["/api/conversion-events"],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!conversionEvents || conversionEvents.length === 0) return;
    if (!window.fbq) return;

    if (firedRef.current === location) return;
    firedRef.current = location;

    const matching = conversionEvents.filter(
      (e) => e.pagePath === location || location.startsWith(e.pagePath + "/")
    );

    for (const event of matching) {
      firePixelEvent(event.eventName, location);
    }
  }, [location, conversionEvents]);
}
