function encodePayload(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeTrackingPayload(token) {
  try {
    const normalized = token.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function createTrackingUrl(route, stop, publicToken = "") {
  if (publicToken) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("tracking", publicToken);
    return url.toString();
  }
  const payload = {
    version: 1,
    routeId: route.id,
    stopId: stop.id,
    routeName: route.name,
    driver: route.driver,
    vehicle: route.vehicle,
    customer: stop.client,
    address: stop.address,
    coordinates: stop.coordinates,
    schedule: stop.schedule,
    status: stop.status,
    generatedAt: new Date().toISOString(),
  };
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("tracking", encodePayload(payload));
  return url.toString();
}

export function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("54") && (digits.length === 10 || digits.length === 11)) digits = `54${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}

export function customerMessage(type, route, stop, trackingUrl) {
  const greeting = stop.client && stop.client !== "Nuevo destinatario" ? `Hola ${stop.client}. ` : "Hola. ";
  const messages = {
    scheduled: `Tu entrega de Llegue está programada para ${stop.schedule}.`,
    en_route: `Tu entrega de Llegue ya está en camino hacia ${stop.shortAddress}.`,
    arrived: `Llegamos a ${stop.shortAddress} con tu entrega.`,
    delivered: "Tu entrega fue completada. Gracias por elegirnos.",
  };
  return `${greeting}${messages[type] || messages.scheduled}\n\nSeguí el estado acá: ${trackingUrl}`;
}

export function openWhatsApp(phone, message) {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  return true;
}

export async function shareTracking(message, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title: "Seguimiento de entrega · Llegue", text: message.replace(url, "").trim(), url });
      return "shared";
    } catch (error) {
      if (error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "unavailable";
  }
}
