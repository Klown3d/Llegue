import { useMemo } from "react";
import length from "@turf/length";
import { lineString } from "@turf/helpers";

export function useRouteMetrics(stops, routeData) {
  return useMemo(() => {
    const fallbackDistance = stops.length > 1
      ? length(lineString(stops.map((stop) => stop.coordinates)), { units: "kilometers" }) * 1.22
      : 0;
    const fallbackMinutes = stops.reduce((total, stop) => total + stop.minutes, 0);
    const distance = routeData ? routeData.distance / 1000 : fallbackDistance;
    const minutes = routeData ? Math.round(routeData.duration / 60) : fallbackMinutes;
    const eta = new Date(Date.now() + minutes * 60_000).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return { distance, minutes, eta };
  }, [routeData, stops]);
}
