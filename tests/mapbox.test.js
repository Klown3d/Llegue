import test from "node:test";
import assert from "node:assert/strict";
import { AMBA_BBOX, buildAddressSearchParams, hasStreetNumber, isInsideAmba } from "../src/services/mapbox.js";

test("la búsqueda queda limitada geográficamente a CABA y AMBA", () => {
  const params = buildAddressSearchParams("San Martín 123", undefined);

  assert.equal(params.get("country"), "ar");
  assert.equal(params.get("bbox"), AMBA_BBOX.join(","));
  assert.equal(params.get("worldview"), "ar");
  assert.equal(params.get("types"), "address");
});

test("exige una altura al final de la calle", () => {
  assert.equal(hasStreetNumber("Av. Santa Fe 3253"), true);
  assert.equal(hasStreetNumber("Av. Santa Fe 3253 Palermo"), true);
  assert.equal(hasStreetNumber("11 de Septiembre 1234, CABA"), true);
  assert.equal(hasStreetNumber("Av. 9 de Julio"), false);
  assert.equal(hasStreetNumber("Av. Santa Fe"), false);
  assert.equal(hasStreetNumber("Ruta 8"), false);
  assert.equal(hasStreetNumber("Calle 12"), false);
  assert.equal(hasStreetNumber("Calle 12 345"), true);
});

test("valida coordenadas dentro del alcance operativo", () => {
  assert.equal(isInsideAmba([-58.3816, -34.6037]), true);
  assert.equal(isInsideAmba([-58.5237, -34.4708]), true);
  assert.equal(isInsideAmba([-64.1888, -31.4201]), false);
});

test("la búsqueda prioriza resultados cercanos cuando hay ubicación", () => {
  const params = buildAddressSearchParams("San Martín 123", [-58.3816, -34.6037]);

  assert.equal(params.get("proximity"), "-58.3816,-34.6037");
});

test("la búsqueda ignora una ubicación inválida", () => {
  const params = buildAddressSearchParams("San Martín 123", [-58.3816]);

  assert.equal(params.has("proximity"), false);
});
