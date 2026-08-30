import test from "node:test";
import assert from "node:assert/strict";
import { optimizeStopsFromOrigin, optimizeStopsFromTravelMatrix } from "../src/utils/routeOptimization.js";

const origin = [-58.42, -34.59];
const stop = (id, coordinates, changes = {}) => ({ id, coordinates, priority: "media", schedule: "Horario abierto", status: "pendiente", ...changes });

test("ordena las paradas desde la ubicación más cercana", () => {
  const ordered = optimizeStopsFromOrigin([
    stop("lejos", [-58.50, -34.65]),
    stop("cerca", [-58.421, -34.591]),
    stop("medio", [-58.44, -34.60]),
  ], origin, new Date("2026-08-29T08:00:00"));
  assert.deepEqual(ordered.map((item) => item.id), ["cerca", "medio", "lejos"]);
});

test("conserva las entregas completadas fuera del recorrido pendiente", () => {
  const ordered = optimizeStopsFromOrigin([
    stop("pendiente", [-58.421, -34.591]),
    stop("completada", [-58.50, -34.65], { status: "completada" }),
  ], origin);
  assert.equal(ordered[0].id, "completada");
  assert.equal(ordered[1].id, "pendiente");
});

test("considera prioridad y horario cuando las distancias son similares", () => {
  const ordered = optimizeStopsFromOrigin([
    stop("normal", [-58.43, -34.59]),
    stop("urgente", [-58.432, -34.59], { priority: "alta", schedule: "08:15 — 09:00" }),
  ], origin, new Date("2026-08-29T08:00:00"));
  assert.equal(ordered[0].id, "urgente");
});

test("ordena con tiempos reales de conducción de la matriz", () => {
  const stops = [
    stop("a", [-58.39, -34.60]),
    stop("b", [-58.40, -34.61]),
    stop("c", [-58.41, -34.62]),
  ];
  const durations = [
    [0, 900, 240, 600],
    [900, 0, 300, 200],
    [240, 300, 0, 180],
    [600, 200, 180, 0],
  ];

  const ordered = optimizeStopsFromTravelMatrix(stops, [-58.38, -34.60], durations);

  assert.deepEqual(ordered.map((item) => item.id), ["b", "c", "a"]);
});
