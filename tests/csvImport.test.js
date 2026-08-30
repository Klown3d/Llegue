import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAddress, parseDeliveryCsv } from "../src/utils/csvImport.js";

test("importa un CSV de entregas con encabezados en español", () => {
  const rows = parseDeliveryCsv('Dirección,Cliente,Teléfono,Prioridad\n"Av. Santa Fe 1234, CABA",Ana,1122334455,Alta');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].address, "Av. Santa Fe 1234, CABA");
  assert.equal(rows[0].client, "Ana");
  assert.equal(rows[0].priority, "alta");
});

test("normaliza direcciones para detectar duplicados", () => {
  assert.equal(normalizeAddress("Av. Córdoba 123"), normalizeAddress("av cordoba 123"));
});

test("acepta CSV de Excel separado por punto y coma", () => {
  const rows = parseDeliveryCsv("Dirección;Cliente;Teléfono\nAv. Cabildo 2000;Juan;1199998888");
  assert.equal(rows[0].client, "Juan");
  assert.equal(rows[0].address, "Av. Cabildo 2000");
});
