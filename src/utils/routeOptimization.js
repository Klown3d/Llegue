import distance from "@turf/distance";
import { point } from "@turf/helpers";

const priorityBiasMeters = { alta: -1400, media: 0, baja: 500 };
const priorityBiasSeconds = { alta: -240, media: 0, baja: 90 };

function scheduleStartMinutes(schedule) {
  const match = String(schedule || "").match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function urgencyBiasMeters(stop, now) {
  const start = scheduleStartMinutes(stop.schedule);
  if (start === null) return 0;
  const current = now.getHours() * 60 + now.getMinutes();
  const remaining = start - current;
  if (remaining <= 0) return -2600;
  if (remaining <= 60) return -1800;
  if (remaining <= 120) return -800;
  return 0;
}

function urgencyBiasSeconds(stop, now) {
  return urgencyBiasMeters(stop, now) / 6;
}

export function distanceMetersBetween(from, to) {
  return distance(point(from), point(to), { units: "kilometers" }) * 1000;
}

export function optimizeStopsFromOrigin(stops, origin, now = new Date()) {
  if (!origin || !Array.isArray(stops) || stops.length < 2) return [...(stops || [])];
  const completed = stops.filter((stop) => stop.status === "completada");
  const remaining = stops.filter((stop) => stop.status !== "completada");
  const ordered = [];
  let cursor = origin;

  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = Infinity;
    remaining.forEach((stop, index) => {
      const travelMeters = distanceMetersBetween(cursor, stop.coordinates);
      const score = travelMeters + (priorityBiasMeters[stop.priority] || 0) + urgencyBiasMeters(stop, now);
      if (score < bestScore) { bestScore = score; bestIndex = index; }
    });
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    cursor = next.coordinates;
  }

  return [...completed, ...ordered];
}

export function optimizeStopsFromTravelMatrix(stops, origin, durations, now = new Date()) {
  if (!origin || !Array.isArray(durations) || !durations.length || !Array.isArray(stops)) return optimizeStopsFromOrigin(stops, origin, now);
  const terminal = stops.filter((stop) => ["completada", "no_entregada"].includes(stop.status));
  const remaining = stops
    .map((stop, index) => ({ stop, matrixIndex: index + 1 }))
    .filter(({ stop }) => !["completada", "no_entregada"].includes(stop.status));
  const ordered = [];
  let cursorIndex = 0;
  let cursorCoordinates = origin;

  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = Infinity;
    remaining.forEach(({ stop, matrixIndex }, index) => {
      const matrixSeconds = durations[cursorIndex]?.[matrixIndex];
      const travelSeconds = Number.isFinite(matrixSeconds) ? matrixSeconds : distanceMetersBetween(cursorCoordinates, stop.coordinates) / 8.3;
      const score = travelSeconds + (priorityBiasSeconds[stop.priority] || 0) + urgencyBiasSeconds(stop, now);
      if (score < bestScore) { bestScore = score; bestIndex = index; }
    });
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next.stop);
    cursorIndex = next.matrixIndex;
    cursorCoordinates = next.stop.coordinates;
  }

  return [...terminal, ...ordered];
}
