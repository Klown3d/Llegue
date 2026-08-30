# Reemplazo temporal de n8n con Supabase

La aplicación usa una Edge Function llamada `llegue` para registrar seguimientos,
consultar el estado público y aplicar eventos de entrega.

## Estado actual

- La Edge Function `llegue` está publicada en `lfmzcyyryjpqgjqxlumk`.
- Alta, consulta pública y eventos fueron verificados de punta a punta.
- El proyecto remoto tiene un bloqueo heredado sobre el rol `cli_login_postgres`;
  por eso la migración Realtime aún no pudo aplicarse mediante la CLI.
- Hasta aplicar esa migración, la función usa automáticamente el RPC existente y
  el portal actualiza mediante polling cada 12 segundos.

## 1. Actualizar la base

Ejecutá nuevamente `supabase/setup.sql` en **Supabase → SQL Editor**. El script
agrega `llegue_api.apply_tracking_event_realtime`, que conserva el evento y
emite una actualización Realtime sin bloquear la entrega si el canal falla.

## 2. Publicar la función

Desde la carpeta del proyecto:

```text
npx supabase login
npx supabase link --project-ref lfmzcyyryjpqgjqxlumk
npx supabase functions deploy llegue --use-api
```

Supabase agrega automáticamente `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` a
la función. Para limitar CORS al dominio publicado se puede agregar:

```text
npx supabase secrets set ALLOWED_ORIGINS=https://tu-dominio.com
```

Mientras no se configure, la función acepta cualquier origen como medida
temporal. Los cambios de estado continúan protegidos por el `updateToken`.

## 3. Activar Realtime en el portal

Copiá la clave pública `sb_publishable_...` desde **Supabase → Connect** y
agregala a `.env.local`:

```env
VITE_SUPABASE_URL=https://lfmzcyyryjpqgjqxlumk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

Sin estas dos variables, el portal sigue funcionando mediante polling cada
12 segundos. Con ellas, recibe `tracking.updated` inmediatamente y mantiene una
consulta de respaldo cada 60 segundos.

## 4. Prueba rápida

1. Abrí una ruta y compartí el seguimiento de una parada.
2. Abrí el enlace público en otro navegador.
3. Marcá la entrega como "en camino" desde navegación.
4. Confirmá que el portal cambie sin recargar.
