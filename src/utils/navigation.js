import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import length from "@turf/length";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import pointToLineDistance from "@turf/point-to-line-distance";

export function distanceMeters(from, to) {
  if (!from || !to) return Infinity;
  return distance(point(from), point(to), { units: "kilometers" }) * 1000;
}

export function getReliableGpsSegment(previous, current) {
  if (!previous?.coordinates || !current?.coordinates) return null;
  const elapsed = Math.max(0, (Number(current.timestamp) - Number(previous.timestamp)) / 1000);
  const traveled = distanceMeters(previous.coordinates, current.coordinates);
  if (elapsed <= 0 || elapsed > 60 || traveled > Math.max(1000, elapsed * 55) || Number(current.accuracy) > 120) return null;
  const noiseThreshold = Math.max(3, Math.min(Number(previous.accuracy) || 0, Number(current.accuracy) || 0) * .35);
  return { distanceMeters: traveled >= noiseThreshold ? traveled : 0, durationSeconds: elapsed };
}

export function getNavigationState(position, route) {
  if (!position || !route?.geometry?.coordinates?.length) return null;
  const routeLine = lineString(route.geometry.coordinates);
  const userPoint = point(position);
  const snapped = nearestPointOnLine(routeLine, userPoint, { units: "kilometers" });
  const totalKm = Math.max(length(routeLine, { units: "kilometers" }), .001);
  const traveledKm = Math.min(snapped.properties.location || 0, totalKm);
  const remainingKm = Math.max(0, totalKm - traveledKm);
  const progress = Math.min(100, Math.max(0, traveledKm / totalKm * 100));
  const offRouteMeters = pointToLineDistance(userPoint, routeLine, { units: "kilometers" }) * 1000;
  const steps = (route.legs || []).flatMap((leg) => leg.steps || []);
  const enrichedSteps = steps.map((step) => {
    const maneuverPoint = nearestPointOnLine(routeLine, point(step.maneuver.location), { units: "kilometers" });
    return { ...step, routeLocation: maneuverPoint.properties.location || 0 };
  });
  const nextStep = enrichedSteps.find((step) => step.routeLocation >= traveledKm + .01) || enrichedSteps.at(-1);
  return {
    progress,
    remainingKm,
    remainingSeconds: Math.max(0, Math.round((route.duration || 0) * (remainingKm / totalKm))),
    offRouteMeters,
    instruction: nextStep?.maneuver?.instruction || "Continuá por el trayecto",
    street: nextStep?.name || "",
    modifier: nextStep?.maneuver?.modifier || "straight",
    distanceToManeuver: Math.max(0, ((nextStep?.routeLocation || traveledKm) - traveledKm) * 1000),
  };
}
