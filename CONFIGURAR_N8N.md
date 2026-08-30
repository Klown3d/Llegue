# Configuración rápida de n8n + Supabase para Llegue

## Qué necesitás

- Una instancia de n8n accesible por HTTPS.
- Un proyecto de Supabase. Supabase administrará PostgreSQL.
- El dominio donde se publicará el portal.

## 1. Preparar Supabase

1. Creá un proyecto en Supabase.
2. Entrá en **SQL Editor**.
3. Creá una consulta nueva, pegá todo el contenido de este archivo y ejecutalo:

`supabase/setup.sql`

El script crea un esquema privado llamado `llegue_private`, las tablas, índices,
funciones y permisos. Las claves públicas `anon` y `authenticated` no tienen
acceso directo a estos datos.

## 2. Habilitar la API RPC

En Supabase abrí la configuración de **Data API** y agregá este esquema en **Exposed schemas**:

`llegue_api`

No expongas `llegue_private`. Las tablas deben permanecer ocultas y sólo las funciones RPC quedan disponibles.

## 3. Crear la credencial segura en n8n

1. En Supabase abrí **Settings → API Keys**.
2. Creá o copiá una clave secreta con formato `sb_secret_...`.
3. En n8n abrí **Credentials → Add credential → Header Auth**.
4. Configurá:

| Campo | Valor |
| --- | --- |
| Credential name | `Supabase Secret - Llegue` |
| Name | `apikey` |
| Value | La clave `sb_secret_...` |

La clave debe existir solamente dentro de las credenciales cifradas de n8n. Nunca la agregues al frontend, a `.env`, al workflow o a una URL.

## 4. Importar los workflows

En n8n seleccioná **Import from File** e importá, en este orden:

1. `n8n/workflows/01-register-tracking.json`
2. `n8n/workflows/02-public-tracking.json`
3. `n8n/workflows/03-delivery-event.json`

### Qué hace cada workflow

#### 1. Registrar seguimiento

Recibe los datos iniciales de una parada cuando se comparte su seguimiento. Valida el contenido, llama a Supabase y crea dos credenciales diferentes:

- `publicToken`: se incluye en el enlace que recibe el cliente.
- `updateToken`: permite actualizar esa entrega y queda guardado solamente en el dispositivo operativo.

Si la parada ya existe, exige el `updateToken` correcto antes de modificar sus datos.

#### 2. Consultar seguimiento público

Recibe el `publicToken` como parámetro `?token=...` y consulta el estado más reciente en Supabase. Supabase valida que sea un UUID. Devuelve al portal únicamente el snapshot público: estado, progreso, destino, horario, conductor y vehículo.

Si el token no existe o venció, responde `404`. Este workflow nunca permite modificar una entrega.

#### 3. Actualizar entrega

Recibe eventos desde la navegación, por ejemplo:

- `delivery.en_route`: entrega en camino.
- `delivery.completed`: entrega completada.
- `delivery.failed`: entrega no realizada.
- `delivery.eta_changed`: cambió el horario estimado.
- `delivery.exception`: ocurrió una incidencia que puede enviarse al agente.

Valida el `updateToken`, limita los tipos de eventos permitidos y utiliza `Idempotency-Key` para no procesar dos veces el mismo aviso. Después actualiza el portal en Supabase y confirma el resultado a la aplicación.

En cada nodo **Supabase RPC**:

1. Asigná la credencial `Supabase Secret - Llegue`.
2. Reemplazá `TU-PROYECTO` por el identificador del Project URL de Supabase.

Ejemplo: `https://abcdefghijk.supabase.co/rest/v1/rpc/register_tracking`

## 5. CORS y proxy del portal

No conectes el navegador directamente con n8n Cloud. Su Webhook permite limitar
orígenes para solicitudes normales, pero no resuelve de forma confiable el
preflight `OPTIONS` que generan algunas llamadas del navegador.

La aplicación usa una ruta del mismo origen:

`VITE_TRACKING_API_BASE=/api/llegue`

Durante el desarrollo, `vite.config.js` ya redirige esa ruta a:

`https://klown3d2.app.n8n.cloud/webhook/llegue`

En producción configurá la misma regla en el hosting o reverse proxy del portal.
No coloques claves de Supabase en el frontend: la llamada autenticada se realiza
exclusivamente desde n8n.

## 6. Publicar los webhooks

Guardá y activá los tres workflows. Las rutas productivas resultantes serán:

- `POST /webhook/llegue/tracking/register`
- `GET /webhook/llegue/tracking?token=PUBLIC_TOKEN`
- `POST /webhook/llegue/tracking/event`

Usá siempre las URLs de producción de n8n, no las URLs `/webhook-test/`.

## 7. Conectar el portal

Copiá `.env.example` como `.env.local` y configurá:

```env
VITE_MAPBOX_ACCESS_TOKEN=tu_token_publico_de_mapbox
VITE_TRACKING_API_BASE=/api/llegue
```

En el servidor del portal configurá un proxy:

```text
/api/llegue/*  ->  https://klown3d2.app.n8n.cloud/webhook/llegue/*
```

Así el navegador se comunica con el mismo dominio y n8n no queda expuesto directamente.

Después generá la versión publicable del portal:

```text
npm run build
```

El resultado quedará en la carpeta `dist`.

### Workflows activos en la instancia de prueba

- Registrar seguimiento: `L2C0J4HKIAuxpfFb`
- Consultar seguimiento público: `xxAUKjDjBAw9Ls3R`

Los workflows de consulta anteriores quedaron despublicados durante las pruebas
porque contenían nodos duplicados. Sólo la versión indicada arriba atiende la
ruta pública.

## 8. Probar

1. Abrí una ruta en Llegue.
2. Elegí una parada con teléfono válido.
3. Presioná **Enviar seguimiento** o **WhatsApp**.
4. Abrí el enlace generado en otra pestaña.
5. Desde navegación presioná **Avisar que está en camino**.
6. Confirmá que el portal cambie a **Tu entrega está en camino**.

## Antes de producción

- Protegé el panel operativo con inicio de sesión y roles.
- Aplicá rate limit en el proxy: como inicio, 60 consultas y 10 actualizaciones por minuto por IP.
- Rotá la clave secreta de Supabase si alguna vez se copia fuera de n8n.
- No utilices la clave `anon`, `publishable` o una contraseña de base en los nodos RPC.
- Configurá un workflow con `Error Trigger` para alertas y reintentos.
- No guardes tokens, teléfonos o direcciones completas en logs de error.

Si un workflow devuelve `401`, revisá la credencial `apikey`. Si devuelve `404` o `PGRST106`, confirmá que `llegue_api` esté agregado en **Exposed schemas** y que hayas ejecutado nuevamente `supabase/setup.sql`.
