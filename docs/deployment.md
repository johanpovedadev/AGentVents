# Despliegue

Todo el agente funciona hoy sin servidor propio: GitHub Actions lo corre por horario y los datos quedan en Neon.

## 1. Neon (base de datos)

**Qué es:** PostgreSQL "serverless". La base existe siempre, pero el motor que la procesa se apaga solo tras unos 5 minutos sin consultas y se enciende con la siguiente. Por eso el plan gratis alcanza: solo consume cuando algo la usa.

**Plan gratis (2026):** 0,5 GB de almacenamiento y 100 horas de cómputo al mes por proyecto. El primer plan de pago no tiene cuota fija: se paga por uso.

**Por qué Neon:**
- Es el mismo Postgres del CRM.
- No pide tarjeta.
- Permite copiar la base ("branch") para pruebas.

**Pasos:**
1. Usar el mismo proyecto Neon de `lion-platform-api`.
2. Copiar el connection string (`postgresql://…?sslmode=require`) como secreto `DATABASE_URL`.
3. El esquema `social` lo crea el propio workflow con `scripts/migrate.js`.

## 2. GitHub Actions con cron (el "despertador")

**Qué es:** GitHub enciende una máquina temporal a la hora indicada, instala el proyecto, corre el script y la apaga. Cada corrida queda registrada con sus logs en la pestaña Actions.

**Cómo leer el cron:** `minuto hora día mes día-de-semana`, en **UTC**. Bogotá es UTC−5, así que se suman 5 horas: `17 6 * * *` son las 01:17 en Bogotá.

**Límites a tener en cuenta:**
- El horario no es exacto: con carga se retrasa minutos, sobre todo en punto, y en casos raros se salta una ejecución.
- En repos **públicos**, GitHub desactiva los horarios tras 60 días sin commits.
- En repos **privados** el plan gratis trae 2.000 minutos al mes. Este agente usa del orden de 150 a 200.
- Solo corre desde la rama por defecto (`main`).

**Secretos a configurar** (Settings → Secrets and variables → Actions):

| Secreto | Para |
|---|---|
| `DATABASE_URL` | Neon |
| `LION_PLATFORM_BASE_URL`, `LION_EMAIL`, `LION_PASSWORD` | Licencias y prospectos (cuenta SUPER_ADMIN) |
| `GEMINI_API_KEY` | Intenciones y diagnóstico de ventas |
| `HERMES_BOT_TOKEN`, `HERMES_CHAT_ID` | Avisos por Telegram |
| `FB_PAGE_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`, `META_GRAPH_BASE_URL`, `IG_ACCESS_TOKEN` (opcional) | Instagram |
| `YOUTUBE_API_KEY` | YouTube |
| `SOCIAL_TENANT_ID` | Tenant del informe semanal de redes |

Secretos que ya no se usan y se pueden borrar: `HUBSPOT_ACCESS_TOKEN`, `SLACK_WEBHOOK_URL`.

## 3. Lion Platform API (Koyeb hoy, Oracle como opción)

El agente necesita que `lion-platform-api` responda para verificar licencias.

- **Koyeb free (actual):** 512 MB de RAM, 0,1 vCPU, una sola instancia por cuenta, y se duerme tras 1 hora sin tráfico. Al despertar, Spring Boot tarda en arrancar; `fetch` espera, así que el recolector no falla, solo demora.
- **Oracle Cloud Always Free (en evaluación):** servidor Arm de 2 CPU y 12 GB de RAM (en 2026 Oracle redujo el plan a la mitad), sin dormir.
  - Ahí podrían correr la API, los bots de WhatsApp y la parte en vivo de este agente (fase 4).
  - Pide tarjeta para verificar identidad.
  - Puede costar conseguir capacidad Arm.
  - Hay que administrar el servidor.
  - Si se adopta, se documenta como ADR nuevo en `lion-platform-api`.

## 4. Túnel para lo que corre en vivo (fase 4)

El chat por Telegram y el webhook de comentarios de Instagram necesitan un proceso encendido con URL pública. El plan es exponerlo con Cloudflare Tunnel, igual que los bots, desde el servidor 24/7 (tu PC u Oracle). El webhook de Meta exige una URL fija, así que hace falta un túnel con nombre y dominio propio en Cloudflare; el túnel rápido (`trycloudflare.com`) cambia de URL en cada reinicio.
