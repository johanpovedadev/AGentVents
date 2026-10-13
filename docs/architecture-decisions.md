# Decisiones de arquitectura (ADR) — Agente de redes y ventas

Cuando una decisión cambie no se edita el ADR viejo: se agrega uno nuevo que lo reemplaza.

## ADR-001: Reutilizar el repo del hackathon en vez de crear uno nuevo

**Contexto:** el agente de HubSpot del hackathon ya no se usa, pero tenía piezas reutilizables: intérprete de intenciones con Gemini, avisos por Telegram, publicación en Meta, cliente de Lion Platform, modo aprobación y workflows de GitHub Actions con sus secretos.

**Decisión:** convertir este repo en el agente de redes y ventas. Se retiran HubSpot y Slack; se agrega el módulo `services/social/`.

**Consecuencia:** el lenguaje es Node.js (no Python, como se evaluó al principio). La analítica que se necesita (medianas, cocientes, agrupaciones) es sencilla en JavaScript, y queda un solo lenguaje con los bots.

## ADR-002: Licencias leídas de Lion Platform en cada ejecución, fallando cerrado

**Contexto:** el agente sirve a varios tenants y cada uno paga por servicios distintos (`SOCIAL`, `CRM`, `BOT`). Lion Platform ya modela esto con `Tenant.products` y `TenantStatus`.

**Opciones:** (1) consultar `GET /admin/tenants` en cada ejecución (elegida); (2) copiar las licencias a una tabla propia; (3) confiar en una lista en variables de entorno.

**Decisión:** opción 1. Una sola fuente de verdad: si Johan suspende a un cliente o le quita `SOCIAL` en el CRM, la siguiente corrida ya no lo atiende, sin sincronizar nada. Si Lion Platform no responde, nadie recibe servicio y llega un aviso.

**Consecuencia:** el agente entra con la cuenta `SUPER_ADMIN`. La recolección depende de que la API esté despierta; en Koyeb free la primera llamada puede tardar mientras despierta, y `fetch` espera.

## ADR-003: Datos de redes en el esquema `social` de la misma base Neon

**Decisión:** mismo proyecto Neon que el CRM, esquema separado. El CRM lee estas tablas para las gráficas sin integraciones extra; el agente nunca escribe en tablas del CRM.

**Cuándo reconsiderar:** si el uso de almacenamiento pasa de unos 350 MB (el plan gratis da 0,5 GB por proyecto), pasar a pago o a un proyecto Neon aparte.

## ADR-004: Recolección por horario en GitHub Actions, sin servidor propio

**Decisión:** la recolección diaria y los informes semanales corren en GitHub Actions con cron. No necesitan un proceso encendido 24/7.

**Consecuencia:** el horario puede retrasarse unos minutos (por eso se usa el minuto :17 y no :00) y en casos raros saltarse una ejecución; el recolector es idempotente, así que no hay daño. Lo que sí necesita estar encendido (chat por Telegram, webhook de comentarios) se monta en la fase 4 en el servidor 24/7 (ver `deployment.md`).

## ADR-005: Solo APIs oficiales

**Decisión:** Instagram vía Graph API (Business Discovery para competencia) y YouTube vía Data API. TikTok de competencia queda fuera: su Research API prohíbe uso comercial y la alternativa sería scraping.

**Consecuencia:** de la competencia solo se conocen datos públicos; por eso las comparaciones usan el score contra la mediana de cada cuenta, que no necesita alcance.

## ADR-006: Cuentas propias de clientes esperan OAuth (fase 6)

**Contexto:** hoy el agente tiene un solo token de Instagram (el de la cuenta de Johan).

**Decisión:** para cuentas propias de Instagram, el conector verifica que la cuenta pedida sea la conectada; si no, responde "necesita OAuth del cliente (fase 6)". La competencia y YouTube (datos públicos) sí funcionan para cualquier tenant desde ya.

## ADR-007: Telegram como único canal de avisos

**Decisión:** se retira Slack. `notifier.js` se mantiene como capa para que agregar WhatsApp después no toque al resto del código.
