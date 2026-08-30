# Integración n8n de Llegue

## Arquitectura

El portal consulta un snapshot público mediante un token opaco. n8n accede a Supabase exclusivamente por HTTPS mediante funciones RPC; no utiliza una conexión PostgreSQL. Las tablas permanecen en `llegue_private` y sólo la superficie mínima `llegue_api` se expone a Data API.

La lógica de estado es determinística. Un agente de IA se incorpora únicamente para `delivery.exception` y anomalías de ETA; nunca calcula el estado oficial ni modifica una entrega sin pasar por herramientas permitidas.

## Instalación

1. Crear un proyecto Supabase y ejecutar `../supabase/setup.sql` desde **SQL Editor**.
2. Agregar `llegue_api` a **Data API → Exposed schemas**. No exponer `llegue_private`.
3. Crear en n8n una credencial **Header Auth** con nombre `apikey` y una clave `sb_secret_...` de Supabase.
4. Importar los tres JSON de `workflows/` y asignar esa credencial a cada nodo Supabase RPC.
5. Reemplazar `TU-PROYECTO` en las URLs RPC por el identificador real de Supabase.
6. Sustituir `https://TU-DOMINIO-DEL-PORTAL` por el origen exacto del frontend. No usar `*` en producción.
7. Activar los workflows y configurar `VITE_TRACKING_API_BASE=/api/llegue` al compilar el portal.
8. En el dominio del portal, hacer proxy de `/api/llegue/*` hacia `https://klown3d.app.n8n.cloud/webhook/llegue/*`.
9. Aplicar rate limit en el proxy: sugerencia inicial, 60 GET/min por IP y 10 POST/min por IP.

Los workflows están inactivos al importar para evitar exponer webhooks antes de configurar base, CORS y credenciales.

## Sub-workflow agéntico recomendado

Crear `Llegue | Agente | Resolver excepción`, invocado desde el workflow de eventos sólo cuando `type = delivery.exception`.

Secuencia:

`Execute Workflow Trigger -> Normalizar contexto -> AI Agent -> Structured Output Parser -> Validar acción -> Switch -> Execute Workflow`

Contexto mínimo para el agente: tipo de incidente, ETA, cantidad de reintentos, horario prometido, canal disponible y últimos eventos. Omitir dirección completa y teléfono del prompt cuando no sean necesarios.

Salida obligatoria:

```json
{
  "action": "WAIT_RETRY | DRAFT_WHATSAPP | REQUEST_OPERATOR | REPLAN_ROUTE",
  "reason": "explicación breve",
  "retryAfterSeconds": 0,
  "messageDraft": "texto opcional"
}
```

Reglas:

- `WAIT_RETRY`: máximo 3 intentos, espera exponencial 30/120/300 segundos con jitter.
- `DRAFT_WHATSAPP`: el modelo redacta; un nodo Code valida longitud, enlace y lenguaje antes del envío.
- `REQUEST_OPERATOR`: aprobación humana obligatoria para reprogramar, cancelar o cambiar destinatario.
- `REPLAN_ROUTE`: llama un sub-workflow que calcula una propuesta; requiere aprobación antes de persistirla.
- Toda acción se valida contra la lista permitida. Una salida inválida se transforma en `REQUEST_OPERATOR`.

## Manejo de errores

Configurar un workflow separado `Error Trigger -> Clasificar error -> Registrar -> IF reintentable -> Wait -> Execute Workflow / Alertar operador`. No incluir tokens, teléfonos ni snapshots completos en alertas o logs.

Para HTTP 429/502/503/504, usar reintentos con backoff y jitter. No reintentar errores de validación, autenticación o permisos. Definir un tiempo máximo de ejecución y una cola de fallos para eventos no procesados.

## Limitaciones conocidas

- n8n orquesta; Supabase es la fuente de verdad. No usar datos de ejecución de n8n como base del portal.
- La actualización remota es polling cada 12 segundos, más refresco inmediato por `BroadcastChannel` entre pestañas del mismo dispositivo. Para tiempo real estricto entre dispositivos, agregar SSE/WebSocket mediante un servicio realtime.
- El token de actualización es una capacidad. Si se borra el almacenamiento local, debe regenerarse desde una sesión operativa autenticada; nunca se recupera desde la base porque sólo se almacena su hash.
- Antes de producción se debe sumar autenticación real para el panel operativo. El token de capacidad protege cada parada, pero no reemplaza identidad, roles ni auditoría del operador.
