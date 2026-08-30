const TOKEN = import.meta.env?.VITE_MAPBOX_ACCESS_TOKEN?.trim();

export const hasMapboxToken = Boolean(TOKEN && TOKEN.startsWith("pk."));

// Rectángulo operativo que cubre CABA y el AMBA ampliado.
export const AMBA_BBOX = [-59.3, -35.25, -57.75, -34.05];

export function hasStreetNumber(query) {
  const value = String(query || "").trim();
  if (!/[a-záéíóúüñ]/i.test(value)) return false;
  const numbers = [...value.matchAll(/\b\d{1,6}[a-z]?\b/gi)];
  if (!numbers.length) return false;
  if (numbers.length > 1) return true;
  const number = numbers[0];
  const before = value.slice(0, number.index).trim();
  const after = value.slice(number.index + number[0].length).trim().replace(/^,\s*/, "");
  if (!before || /\b(?:ruta|rn|rp|calle)\s*$/i.test(before)) return false;
  if (/^(?:de|del|al)\b/i.test(after)) return false;
  return true;
}

export function isInsideAmba(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) return false;
  const [longitude, latitude] = coordinates;
  const [west, south, east, north] = AMBA_BBOX;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

export function buildAddressSearchParams(query, proximity) {
  const params = new URLSearchParams({
    q: query.trim(),
    access_token: TOKEN || "",
    autocomplete: "true",
    language: "es",
    country: "ar",
    bbox: AMBA_BBOX.join(","),
    worldview: "ar",
    types: "address",
    limit: "5",
    permanent: "true",
  });
  if (Array.isArray(proximity) && proximity.length === 2 && proximity.every(Number.isFinite)) {
    params.set("proximity", proximity.join(","));
  }
  return params;
}

export async function searchAddresses(query, { signal, proximity } = {}) {
  if (!hasMapboxToken || query.trim().length < 3 || !hasStreetNumber(query)) return [];
  const params = buildAddressSearchParams(query, proximity);
  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, { signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "No se pudieron buscar direcciones.");
  }
  const data = await response.json();
  return data.features.filter((feature) => isInsideAmba(feature.geometry?.coordinates)).map((feature) => ({
    id: feature.id,
    address: feature.properties?.full_address || feature.place_name,
    area: feature.properties?.context?.place?.name || "Argentina",
    coordinates: feature.geometry.coordinates,
  }));
}

export async function fetchDirections(stops, { signal, origin } = {}) {
  const points = origin ? [{ coordinates: origin }, ...stops] : stops;
  if (!hasMapboxToken || points.length < 2) return null;
  if (points.length > 25) throw new Error("Mapbox admite hasta 25 puntos por trayecto.");
  const coordinates = points.map((stop) => stop.coordinates.join(",")).join(";");
  const params = new URLSearchParams({
    access_token: TOKEN,
    geometries: "geojson",
    overview: "full",
    steps: "true",
    annotations: "distance,duration",
    language: "es",
    voice_instructions: "true",
    banner_instructions: "true",
    voice_units: "metric",
    waypoints_per_route: "true",
  });
  const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?${params}`, { signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "No se pudo calcular el trayecto.");
  }
  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.length) throw new Error(data.message || "No hay un trayecto disponible para estas paradas.");
  return { ...data.routes[0], originIncluded: Boolean(origin) };
}

export async function fetchTravelTimeMatrix(stops, { signal, origin } = {}) {
  const points = origin ? [{ coordinates: origin }, ...stops] : stops;
  if (!hasMapboxToken || points.length < 2) return null;
  if (points.length > 25) throw new Error("La optimización admite hasta 24 paradas más el punto de partida.");
  const profile = points.length <= 10 ? "driving-traffic" : "driving";
  const coordinates = points.map((item) => item.coordinates.join(",")).join(";");
  const params = new URLSearchParams({ access_token: TOKEN, annotations: "duration,distance" });
  const response = await fetch(`https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coordinates}?${params}`, { signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "No se pudieron comparar los tiempos entre paradas.");
  }
  const data = await response.json();
  if (data.code !== "Ok" || !data.durations?.length) throw new Error(data.message || "No hay tiempos disponibles para optimizar estas paradas.");
  return { durations: data.durations, distances: data.distances, profile, originIncluded: Boolean(origin) };
}

export { TOKEN as mapboxToken };
