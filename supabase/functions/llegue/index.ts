import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16_000;
const MAX_WORKSPACE_BYTES = 1_000_000;
const WORKSPACE_BUCKET = "llegue-workspaces";

function corsHeaders(request: Request) {
  const requestOrigin = request.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes("*")
    ? "*"
    : ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0] || "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, idempotency-key, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maxLength = 200) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new RequestError(`${field} es obligatorio.`, 400);
  if (normalized.length > maxLength) throw new RequestError(`${field} supera el máximo permitido.`, 400);
  return normalized;
}

class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function readBody(request: Request, maxBytes = MAX_BODY_BYTES) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new RequestError("La solicitud supera el máximo permitido.", 413);
  }
  try {
    const body = JSON.parse(raw || "{}");
    if (!isObject(body)) throw new Error();
    return body;
  } catch {
    throw new RequestError("El cuerpo debe ser un objeto JSON válido.", 400);
  }
}

async function authenticatedUser(request: Request, supabase: any) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new RequestError("Necesitás iniciar sesión.", 401);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new RequestError("La sesión venció o no es válida.", 401);
  return data.user;
}

async function ensureWorkspaceBucket(supabase: any) {
  const { data } = await supabase.storage.getBucket(WORKSPACE_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(WORKSPACE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_WORKSPACE_BYTES,
    allowedMimeTypes: ["application/json"],
  });
  if (error && !error.message.toLowerCase().includes("already exists")) throw new RequestError("No se pudo preparar el almacenamiento privado.", 502);
}

async function readStoredWorkspace(supabase: any, path: string) {
  const { data, error } = await supabase.storage.from(WORKSPACE_BUCKET).download(path);
  if (error) {
    const status = String((error as { statusCode?: string | number }).statusCode || "");
    if (status === "404" || error.message.toLowerCase().includes("not found")) return null;
    throw new RequestError("No se pudo leer el espacio de trabajo.", 502);
  }
  try {
    const parsed = JSON.parse(await data.text());
    return isObject(parsed) ? parsed : null;
  } catch {
    throw new RequestError("El espacio guardado no es válido.", 502);
  }
}

function databaseError(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  if (error.code === "42501") return new RequestError("Autorización de actualización inválida.", 403);
  if (error.code === "22023" || error.code === "22P02") return new RequestError(error.message || "Datos inválidos.", 400);
  console.error("Supabase RPC error", { code: error.code, message: error.message });
  return new RequestError("No se pudo completar la operación de seguimiento.", 502);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(request, { message: "La función no está configurada." }, 503);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const path = new URL(request.url).pathname.replace(/\/+$/, "");

  try {
    if (path.endsWith("/workspace") && (request.method === "GET" || request.method === "PUT")) {
      const user = await authenticatedUser(request, supabase);
      await ensureWorkspaceBucket(supabase);
      const workspacePath = `${user.id}/workspace.json`;
      const current = await readStoredWorkspace(supabase, workspacePath);

      if (request.method === "GET") {
        if (!current) return json(request, { message: "Todavía no hay datos sincronizados." }, 404);
        return json(request, current, 200);
      }

      const body = await readBody(request, MAX_WORKSPACE_BYTES);
      if (!isObject(body.payload) || !Array.isArray(body.payload.routes)) throw new RequestError("El espacio de trabajo no es válido.", 400);
      const expectedVersion = Number(body.expectedVersion || 0);
      const currentVersion = Number(current?.version || 0);
      if (expectedVersion !== currentVersion) return json(request, { message: "Hay una versión más reciente en la nube.", current }, 409);

      const stored = {
        version: currentVersion + 1,
        updatedAt: new Date().toISOString(),
        payload: body.payload,
      };
      const encoded = JSON.stringify(stored);
      if (new TextEncoder().encode(encoded).byteLength > MAX_WORKSPACE_BYTES) throw new RequestError("El espacio de trabajo supera el máximo permitido.", 413);
      const { error } = await supabase.storage.from(WORKSPACE_BUCKET).upload(workspacePath, encoded, {
        contentType: "application/json",
        cacheControl: "0",
        upsert: true,
      });
      if (error) throw new RequestError("No se pudo guardar el espacio de trabajo.", 502);
      return json(request, stored, 200);
    }

    if (request.method === "POST" && path.endsWith("/tracking/register")) {
      await authenticatedUser(request, supabase);
      const body = await readBody(request);
      if (!isObject(body.snapshot)) throw new RequestError("snapshot debe ser un objeto.");
      const { data, error } = await supabase.schema("llegue_api").rpc("register_tracking", {
        p_route_id: requiredText(body.routeId, "routeId"),
        p_stop_id: requiredText(body.stopId, "stopId"),
        p_snapshot: body.snapshot,
        p_update_token: body.updateToken ? String(body.updateToken) : null,
      });
      if (error) throw databaseError(error);
      if (!isObject(data) || !data.publicToken) throw new RequestError("Supabase no devolvió las credenciales de seguimiento.", 502);
      return json(request, data, 200);
    }

    if (request.method === "GET" && path.endsWith("/tracking")) {
      const token = new URL(request.url).searchParams.get("token") || "";
      if (!UUID_PATTERN.test(token)) throw new RequestError("El token de seguimiento no es válido.", 400);
      const { data, error } = await supabase.schema("llegue_api").rpc("get_public_tracking", {
        p_public_token: token,
      });
      if (error) throw databaseError(error);
      if (!isObject(data) || data._notFound) return json(request, { message: "Seguimiento no encontrado o vencido." }, 404);
      return json(request, data, 200);
    }

    if (request.method === "POST" && path.endsWith("/tracking/event")) {
      const body = await readBody(request);
      if (!isObject(body.snapshot)) throw new RequestError("snapshot debe ser un objeto.");
      const idempotencyKey = request.headers.get("idempotency-key") || "";
      if (!UUID_PATTERN.test(idempotencyKey)) throw new RequestError("Idempotency-Key debe ser un UUID válido.", 400);
      const occurredAt = String(body.occurredAt || "");
      if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) throw new RequestError("occurredAt no es una fecha válida.", 400);

      const eventParameters = {
        p_route_id: requiredText(body.routeId, "routeId"),
        p_stop_id: requiredText(body.stopId, "stopId"),
        p_update_token: requiredText(body.updateToken, "updateToken", 256),
        p_idempotency_key: idempotencyKey,
        p_event_type: requiredText(body.type, "type", 80),
        p_occurred_at: occurredAt,
        p_payload: isObject(body.data) ? body.data : {},
        p_snapshot: body.snapshot,
      };
      let { data, error } = await supabase.schema("llegue_api").rpc("apply_tracking_event_realtime", eventParameters);
      if (error?.code === "PGRST202" || error?.message?.includes("schema cache")) {
        ({ data, error } = await supabase.schema("llegue_api").rpc("apply_tracking_event", eventParameters));
      }
      if (error) throw databaseError(error);
      if (!isObject(data)) throw new RequestError("Supabase no confirmó el evento.", 502);
      return json(request, data, 200);
    }

    return json(request, { message: "Ruta de seguimiento no encontrada." }, 404);
  } catch (error) {
    const requestError = error instanceof RequestError ? error : new RequestError("Error interno de seguimiento.", 500);
    if (!(error instanceof RequestError)) console.error("Unhandled tracking error", error);
    return json(request, { message: requestError.message }, requestError.status);
  }
});
