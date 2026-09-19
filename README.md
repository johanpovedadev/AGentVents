# HubSpot CRM Sales Agent

Agente backend en Node.js para gestionar contactos y deals de HubSpot, generar diagnósticos de ventas con Gemini y comunicar cada resultado por Slack.

Está diseñado para una demo de hackathon: recibe una instrucción en lenguaje natural, obtiene una intención estructurada con Gemini y la ejecuta —o solicita aprobación humana— según el modo de autonomía configurado.

## Capacidades

- Crear y actualizar contactos en HubSpot.
- Crear deals asociados a un contacto y actualizar su etapa.
- Generar un diagnóstico de ventas basado en los deals del CRM.
- Generar el resumen semanal de prospectos nuevos por canal en Lion Platform (qué red está trayendo clientes).
- Publicar posts (foto única o carrusel de hasta 10 imágenes) en la Página de Facebook y en la cuenta de Instagram Business vinculada, vía Meta Graph API.
- Publicar confirmaciones, errores, informes y hand-offs en Slack y Telegram.
- Cuantificar el tiempo que tomó generar cada informe frente a una revisión manual estimada.
- Operar en modo de aprobación humana o modo autónomo.

## Requisitos

- Node.js 18 o superior.
- Token privado de HubSpot con permisos de lectura/escritura para contactos y deals.
- Incoming Webhook de Slack.
- Clave de Gemini API.

## Instalación

```bash
git clone https://github.com/johanpovedadev/AGentVents.git
cd AGentVents
npm install
```

Si el entorno no dispone de `npm`, se puede usar `pnpm install`.

Duplica `.env.example` como `.env` y completa las credenciales:

```env
HUBSPOT_ACCESS_TOKEN=pat-na1-tu-token
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
GEMINI_API_KEY=tu-api-key
AUTO_APPROVE_ACTIONS=false

# Notificaciones por Telegram (bot Jarvis León / LionTelegram), en paralelo a Slack.
HERMES_BOT_TOKEN=tu_token_de_botfather
HERMES_CHAT_ID=tu_chat_id

# Espejo de crear_contacto en Lion Platform (CRM real de Service Store VIP).
LION_PLATFORM_BASE_URL=http://localhost:8081/api/v1
LION_EMAIL=super@lionplatform.com
LION_PASSWORD=password123

# Publicación en redes (publicar_post) vía Meta Graph API.
META_GRAPH_BASE_URL=https://graph.facebook.com/v21.0
FB_PAGE_ID=tu-page-id
FB_PAGE_ACCESS_TOKEN=tu-page-access-token
IG_BUSINESS_ACCOUNT_ID=tu-ig-business-account-id
```

> `.env` está ignorado por Git y nunca debe publicarse.

## Ejecución para la demo

### Modo aprobación

Con `AUTO_APPROVE_ACTIONS=false` o sin definir la variable, toda creación o actualización se detiene antes de tocar HubSpot. Slack recibe los datos en formato legible y pide la aprobación humana.

```bash
node scripts/runAgent.js "crea un contacto para Juan Pérez, teléfono 3001234567"
```

La consola devuelve `pendiente_aprobacion`; HubSpot no recibe cambios todavía.

Para simular que el humano aprobó la misma intención, la integración de Slack puede llamar a `aprobarAccionPendiente`:

```js
const { aprobarAccionPendiente } = require('./services/crmAgent');

await aprobarAccionPendiente({
  tipo: 'crear_contacto',
  datos: { firstname: 'Juan', lastname: 'Pérez', phone: '3001234567' }
});
```

### Modo autónomo

El flag `--auto` activa la autonomía únicamente para esa ejecución; no hace falta modificar `.env` ni reiniciar el proceso.

```bash
node scripts/runAgent.js "crea un contacto para Juan Pérez, teléfono 3001234567" --auto
```

Slack confirma la acción con el texto `Ejecutado automáticamente (modo autónomo activo)`.

### Crear un deal

Se requiere el identificador del contacto existente para asociar el deal.

```bash
node scripts/runAgent.js "crea un deal llamado Plan Premium por 500000 para el contacto con ID 123" --auto
```

### Actualizar un deal

```bash
node scripts/runAgent.js "actualiza el deal 456 a la etapa closedwon" --auto
```

### Generar informe

Los informes siempre se ejecutan directamente, incluso cuando el modo de aprobación está activo.

```bash
node scripts/runAgent.js "genera un informe de ventas"
```

El mensaje de Slack incluye cuánto tardó el agente en segundos y la comparación estimada con una revisión manual de 45 minutos.

### Publicar en redes sociales

`publicar_post` requiere aprobación humana igual que las acciones de CRM — publicar en un canal real y público nunca se ejecuta en silencio.

```bash
node scripts/runAgent.js "publica en facebook: Automatiza tu WhatsApp con IA, enlaza a https://lioncore.co" --auto
node scripts/runAgent.js "publica en instagram la demo del bot con la imagen https://cdn.example.com/demo.jpg" --auto
node scripts/runAgent.js "publica un carrusel en instagram con https://cdn.example.com/1.jpg, https://cdn.example.com/2.jpg y https://cdn.example.com/3.jpg" --auto
```

Facebook necesita `texto` (y opcionalmente `enlace`); Instagram necesita `imagenUrl` (Graph API no publica solo texto en Instagram) y opcionalmente `texto` como pie de foto. Para un carrusel, `imagenes` es un arreglo de 2 a 10 URLs en vez de `imagenUrl` — cada imagen se sube como contenedor hijo antes de publicar el carrusel completo.

### Resumen semanal de marketing

Cuenta, con el `createdAt` real de cada prospecto en Lion Platform, cuántos son nuevos en los últimos 7 días y de qué canal vinieron. No requiere aprobación (es solo lectura) y corre automáticamente cada lunes vía `.github/workflows/marketing-report.yml`.

```bash
node scripts/runAgent.js "dame el resumen semanal de canales"
```

## Flujo de una acción CRM

```text
Instrucción natural
       ↓
intentParser (Gemini → JSON)
       ↓
crmAgent
  ├─ aprobación requerida → notifier (Slack + Telegram) → pendiente_aprobacion
  └─ autónomo/aprobado → HubSpot (+ Lion Platform si es crear_contacto)
                          o metaPublisher (si es publicar_post) → notifier confirma resultado
```

`crear_contacto` es el único tipo que se espeja en Lion Platform (el CRM real de
Service Store VIP): además de crear el contacto en HubSpot, crea un prospecto
nuevo vía `lionPlatformClient`. Los deals no tienen equivalente en ese modelo
y `actualizar_contacto`/`actualizar_deal` no tienen forma de saber a qué
prospecto de Lion Platform corresponde un `contactId`/`dealId` de HubSpot, así
que esos tres tipos siguen viviendo solo en HubSpot. Si el espejo falla, la
acción en HubSpot no se revierte — el error queda anotado en la notificación.

## Servicios principales

| Archivo | Responsabilidad |
| --- | --- |
| `services/intentParser.js` | Convierte lenguaje natural a una intención CRM válida. |
| `services/crmAgent.js` | Controla la autonomía, orquesta HubSpot/Lion Platform y notifica. |
| `services/hubspotClient.js` | Cliente REST v3 de contactos y deals de HubSpot. |
| `services/lionPlatformClient.js` | Cliente del CRM de Lion Platform — espeja `crear_contacto` como prospecto. |
| `services/metaPublisher.js` | Cliente de Meta Graph API — publica en la Página de Facebook y en Instagram Business. |
| `services/marketingReportService.js` | Resumen semanal de prospectos nuevos por canal, desde Lion Platform. |
| `services/reportService.js` | Consulta deals, genera el diagnóstico y mide su duración. |
| `services/notifier.js` | Publica el mismo mensaje en Slack y Telegram a la vez. |
| `services/slackNotifier.js` | Envía texto al Incoming Webhook de Slack. |
| `services/telegramNotifier.js` | Envía texto al bot de Telegram (Jarvis León / LionTelegram). |
| `scripts/runAgent.js` | Entrada de línea de comandos para la demo. |

## Verificación

El proyecto ya incluye pruebas con la cobertura nativa de Node. Para ejecutarlas:

```bash
npm test
```

El umbral configurado es 80% para líneas, funciones y ramas. `test/` tiene una prueba unitaria por servicio (mockeando solo su propia frontera de red) y `test/integration/` tiene pruebas de punta a punta que encadenan los módulos reales y solo falsean el SDK de Gemini y la red externa.

## Automatización con GitHub Actions

El workflow `.github/workflows/sales-report.yml` genera el informe a las 08:00 de Bogotá de lunes a viernes, y también permite una ejecución manual desde **Actions → Informe de ventas CRM → Run workflow**.

Antes de activarlo, configura estos secretos en **Settings → Secrets and variables → Actions** del repositorio:

- `HUBSPOT_ACCESS_TOKEN`
- `GEMINI_API_KEY`
- `SLACK_WEBHOOK_URL`

El workflow solo genera informes: no crea ni actualiza contactos o deals.

`.github/workflows/marketing-report.yml` corre el resumen semanal de canales cada lunes a las 08:00 de Bogotá. Además de los anteriores, necesita `LION_PLATFORM_BASE_URL`, `LION_EMAIL`, `LION_PASSWORD`, `HERMES_BOT_TOKEN` y `HERMES_CHAT_ID` como secretos del repositorio.
