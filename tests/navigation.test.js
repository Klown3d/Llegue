import test from "node:test";
import assert from "node:assert/strict";
import { getReliableGpsSegment } from "../src/utils/navigation.js";

test("ignora el ruido del GPS sin perder el tiempo transcurrido", () => {
  const segment = getReliableGpsSegment(
    { coordinates: [-58.3816, -34.6037], accuracy: 20, timestamp: 1000 },
    { coordinates: [-58.38161, -34.60371], accuracy: 20, timestamp: 11000 },
  );
  assert.equal(segment.distanceMeters, 0);
  assert.equal(segment.durationSeconds, 10);
});

test("descarta saltos imposibles del GPS", () => {
  const segment = getReliableGpsSegment(
    { coordinates: [-58.3816, -34.6037], accuracy: 10, timestamp: 1000 },
    { coordinates: [-58.50, -34.70], accuracy: 10, timestamp: 3000 },
  );
  assert.equal(segment, null);
});
