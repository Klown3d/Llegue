function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] || "";
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const character of firstLine) {
    if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") commas += 1;
    else if (!quoted && character === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

function parseRows(text) {
  const rows = [];
  const delimiter = detectDelimiter(text);
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) { row.push(value.trim()); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = "";
    } else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function first(record, keys) {
  for (const key of keys) if (record[key]) return record[key];
  return "";
}

export function normalizeAddress(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseDeliveryCsv(text) {
  const rows = parseRows(String(text || "").replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((values) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return {
      address: first(record, ["direccion", "domicilio", "address"]),
      client: first(record, ["cliente", "destinatario", "customer"]),
      phone: first(record, ["telefono", "celular", "phone"]),
      schedule: first(record, ["horario", "franja", "schedule"]),
      notes: first(record, ["observaciones", "notas", "notes"]),
      priority: first(record, ["prioridad", "priority"]).toLowerCase(),
      longitude: Number(first(record, ["longitud", "longitude", "lon", "lng"])),
      latitude: Number(first(record, ["latitud", "latitude", "lat"])),
    };
  }).filter((row) => row.address);
}
