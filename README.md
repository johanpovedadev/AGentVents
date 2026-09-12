# HubSpot CRM Sales Agent

Agente backend en Node.js para gestionar contactos y deals de HubSpot, generar diagnósticos de ventas con Gemini y comunicar cada resultado por Slack.

Está diseñado para una demo de hackathon: recibe una instrucción en lenguaje natural, obtiene una intención estructurada con Gemini y la ejecuta —o solicita aprobación humana— según el modo de autonomía configurado.

## Capacidades

- Crear y actualizar contactos en HubSpot.
- Crear deals asociados a un contacto y actualizar su etapa.
- Generar un diagnóstico de ventas basado en los deals del CRM.
- Publicar confirmaciones, errores, informes y hand-offs en Slack.
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

## Flujo de una acción CRM

```text
Instrucción natural
       ↓
intentParser (Gemini → JSON)
       ↓
crmAgent
  ├─ aprobación requerida → Slack → pendiente_aprobacion
  └─ autónomo/aprobado → HubSpot → Slack confirma resultado
```

## Servicios principales

| Archivo | Responsabilidad |
| --- | --- |
| `services/intentParser.js` | Convierte lenguaje natural a una intención CRM válida. |
| `services/crmAgent.js` | Controla la autonomía, orquesta HubSpot y notifica Slack. |
| `services/hubspotClient.js` | Cliente REST v3 de contactos y deals de HubSpot. |
| `services/reportService.js` | Consulta deals, genera el diagnóstico y mide su duración. |
| `services/slackNotifier.js` | Envía informes, hand-offs, confirmaciones y errores a Slack. |
| `scripts/runAgent.js` | Entrada de línea de comandos para la demo. |

## Verificación

El proyecto ya incluye pruebas con la cobertura nativa de Node. Para ejecutarlas:

```bash
npm test
```

El umbral configurado es 80% para líneas, funciones y ramas.

## Automatización con GitHub Actions

El workflow `.github/workflows/sales-report.yml` genera el informe a las 08:00 de Bogotá de lunes a viernes, y también permite una ejecución manual desde **Actions → Informe de ventas CRM → Run workflow**.

Antes de activarlo, configura estos secretos en **Settings → Secrets and variables → Actions** del repositorio:

- `HUBSPOT_ACCESS_TOKEN`
- `GEMINI_API_KEY`
- `SLACK_WEBHOOK_URL`

El workflow solo genera informes: no crea ni actualiza contactos o deals.
