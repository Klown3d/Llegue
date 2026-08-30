import { supabase } from "./supabase";

const API_BASE = String(import.meta.env.VITE_TRACKING_API_BASE || "").replace(/\/$/, "");
const POLL_INTERVAL_MS = 12000;
const REALTIME_POLL_INTERVAL_MS = 60000;
const TOKEN_PREFIX = "llegue.tracking.token.";
const QUEUE_KEY = "llegue.tracking.queue";
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
let realtimeClientPromise = null;

async function authenticatedHeaders() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Necesitás iniciar sesión para preparar el seguimiento.");
  return { "Authorization": `Bearer ${accessToken}` };
}

export const hasTrackingApi = Boolean(API_BASE);
export const hasRealtimeTracking = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

function getRealtimeClient() {
  if (!hasRealtimeTracking) return Promise.resolve(null);
  if (!realtimeClientPromise) {
    realtimeClientPromise = import("@supabase/supabase-js").then(({ createClient }) => createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ));
  }
  return realtimeClientPromise;
}

function tokenKey(routeId, stopId) {
  return `${TOKEN_PREFIX}${routeId}.${stopId}`;
}

function readUpdateToken(routeId, stopId) {
  try { return localStorage.getItem(tokenKey(routeId, stopId)) || ""; } catch { return ""; }
}

function storeUpdateToken(routeId, stopId, token) {
  if (!token) return;
  try { localStorage.setItem(tokenKey(routeId, stopId), token); } catch { /* El modo privado puede bloquear el almacenamiento. */ }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `El servicio de seguimiento respondió ${response.status}.`);
  return payload;
}

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}

function writeQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-100))); } catch { /* Almacenamiento no disponible. */ }
}

function enqueueTrackingEvent(event) {
  const queue = readQueue();
  if (!queue.some((item) => item.idempotencyKey === event.idempotencyKey)) queue.push(event);
  writeQueue(queue);
}

export async function flushTrackingQueue() {
  const queue = readQueue();
  if (!queue.length || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  const pending = [];
  let sent = 0;
  for (const event of queue) {
    try {
      await request("/tracking/event", { method: "POST", headers: { "Idempotency-Key": event.idempotencyKey }, body: JSON.stringify(event.body) });
      sent += 1;
    } catch { pending.push(event); }
  }
  writeQueue(pending);
  return sent;
}

export async function registerTracking(route, stop) {
  if (!hasTrackingApi) return null;
  const updateToken = readUpdateToken(route.id, stop.id);
  const authorization = await authenticatedHeaders();
  const result = await request("/tracking/register", {
    method: "POST",
    headers: authorization,
    body: JSON.stringify({
      routeId: route.id,
      stopId: stop.id,
      updateToken: updateToken || undefined,
      snapshot: {
        routeName: route.name,
        driver: route.driver,
        vehicle: route.vehicle,
        customer: stop.client,
        address: stop.address,
        coordinates: stop.coordinates,
        schedule: stop.schedule,
        status: stop.status,
        progress: stop.progress || null,
        eta: stop.eta || null,
      },
    }),
  });
  storeUpdateToken(route.id, stop.id, result.updateToken);
  return result;
}

export async function sendTrackingEvent(route, stop, type, extra = {}) {
  if (!hasTrackingApi) return null;
  let updateToken = readUpdateToken(route.id, stop.id);
  if (!updateToken) {
    const registration = await registerTracking(route, stop);
    updateToken = registration?.updateToken || readUpdateToken(route.id, stop.id);
  }
  if (!updateToken) throw new Error("No se pudo obtener autorización para actualizar el seguimiento.");
  const idempotencyKey = crypto.randomUUID();
  const { snapshot: snapshotPatch = {}, ...eventData } = extra;
  const body = {
      routeId: route.id,
      stopId: stop.id,
      updateToken,
      type,
      occurredAt: new Date().toISOString(),
      data: eventData,
      snapshot: {
        routeName: route.name,
        driver: route.driver,
        vehicle: route.vehicle,
        customer: stop.client,
        address: stop.address,
        coordinates: stop.coordinates,
        schedule: stop.schedule,
        status: stop.status,
        progress: stop.progress || null,
        eta: stop.eta || null,
        ...snapshotPatch,
      },
  };
  let result;
  try {
    result = await request("/tracking/event", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) });
  } catch (error) {
    if (typeof navigator !== "undefined" && (!navigator.onLine || error instanceof TypeError)) {
      enqueueTrackingEvent({ idempotencyKey, body });
      return { queued: true };
    }
    throw error;
  }
  try { new BroadcastChannel("llegue-tracking").postMessage({ routeId: route.id, stopId: stop.id }); } catch { /* Compatibilidad. */ }
  return result;
}

if (typeof window !== "undefined") window.addEventListener("online", () => { flushTrackingQueue(); });

export async function fetchTrackingSnapshot(publicToken, signal) {
  if (!hasTrackingApi || !publicToken) return null;
  return request(`/tracking?token=${encodeURIComponent(publicToken)}`, { method: "GET", signal, headers: {} });
}

export function subscribeTracking(publicToken, onSnapshot, onError) {
  if (!hasTrackingApi || !publicToken) return () => {};
  let stopped = false;
  let controller = null;
  let timer = null;
  let channel = null;
  let realtimeChannel = null;
  let realtimeClient = null;

  const refresh = async () => {
    if (stopped || document.hidden) return;
    controller?.abort();
    controller = new AbortController();
    try { onSnapshot(await fetchTrackingSnapshot(publicToken, controller.signal)); }
    catch (error) { if (error.name !== "AbortError") onError?.(error); }
  };
  const schedule = () => { clearInterval(timer); timer = setInterval(refresh, hasRealtimeTracking ? REALTIME_POLL_INTERVAL_MS : POLL_INTERVAL_MS); };
  const onVisibility = () => { if (!document.hidden) refresh(); };
  try { channel = new BroadcastChannel("llegue-tracking"); channel.onmessage = refresh; } catch { /* Compatibilidad. */ }
  getRealtimeClient().then((client) => {
    if (!client || stopped) return;
    realtimeClient = client;
    realtimeChannel = client
      .channel(`tracking:${publicToken}`, { config: { private: false, broadcast: { self: false, ack: false } } })
      .on("broadcast", { event: "tracking.updated" }, (message) => {
        const snapshot = message?.payload?.snapshot;
        if (snapshot && typeof snapshot === "object") onSnapshot(snapshot);
        else refresh();
      })
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
  }).catch(() => { /* El polling continúa como respaldo. */ });
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", onVisibility);
  refresh();
  schedule();
  return () => {
    stopped = true;
    controller?.abort();
    clearInterval(timer);
    channel?.close();
    if (realtimeChannel) realtimeClient?.removeChannel(realtimeChannel);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
