# AGENTS.md — agente de redes y ventas

Instrucciones para agentes de IA (Claude Code, Copilot, Cursor, etc.) que trabajen en este repositorio.

## Qué es

Agente Node.js (CommonJS, Node 22) de Lion Platform para redes sociales y ventas. No es el CRM ni el bot de WhatsApp: habla con `lion-platform-api` por HTTP y con la base Neon solo en el esquema `social`.

## Reglas que no se rompen

1. **Multi-tenant.** Toda tabla de `social` con datos de cliente lleva `tenant_id`, y toda consulta de lectura filtra por él. Nunca mezclar datos de dos tenants en una respuesta.
2. **Licencias.** Antes de entregar un servicio a un tenant, verificar su producto con `services/licenseService.js` (`SOCIAL` para redes, `CRM` para ventas). Lion Platform es la única fuente de verdad: no copiar licencias a otra tabla ni cachearlas entre ejecuciones. Si no se pueden verificar, **fallar cerrado**.
3. **Solo APIs oficiales** (Graph API de Meta, YouTube Data API). Nada de scraping sin una decisión explícita documentada en `docs/architecture-decisions.md`.
4. **Dato ausente = `null`, nunca 0.** El alcance de un competidor no es 0; es desconocido.
5. **El agente no inventa cifras.** Todo número de un informe sale de la base o de una API, no del modelo.
6. **Acciones que cambian algo afuera** (crear, publicar) piden aprobación salvo `AUTO_APPROVE_ACTIONS=true`.
7. **Migraciones**: archivo nuevo en `migrations/NNN_nombre.sql`; nunca editar uno ya aplicado.
8. **Secretos**: solo en `.env` local o GitHub Secrets. Nunca en el código ni en los commits.
9. **Puertos libres antes de arrancar (regla del 17 oct 2026, todos los proyectos).** Todo servicio que escuche en un puerto, como el webhook o panel de redes en el 3100, primero se registra en el registro único `config/ports.json` del repo saas-bot y se valida con `node scripts/check-ports.js --new <puerto>`. Nunca se deja corriendo en PM2 a mano desde una rama de trabajo: va en el `ecosystem.config.js` de saas-bot (límite de reinicios) y se arranca con `npm run start:safe -- <app>`. Origen: `agentes-redes` apuntaba a `scripts/runRedes.js` de la rama `feature/agente-redes-sociales`. Al cambiar de rama el archivo desapareció, PM2 lo reinició unos 3,5 millones de veces y terminó tumbando a todos los bots.

## Gitflow

- `main`: lo que está en producción. Solo recibe PR desde `develop` (o `hotfix/*`).
- `develop`: integración. Recibe PR desde `feature/*`.
- `feature/<tema>`: una rama por cambio, creada desde `develop`.
- `hotfix/<tema>`: desde `main`, se une a `main` y a `develop`.
- Antes de abrir un PR: `pnpm test` debe pasar (cobertura mínima 80 % en líneas, funciones y ramas). CI lo vuelve a correr.

## Estructura

```
services/
  agent.js               orquesta intenciones, aprobación y avisos
  intentParser.js        lenguaje natural → intención (Gemini)
  licenseService.js      licencias por tenant (Lion Platform)
  lionPlatformClient.js  API de Lion Platform
  salesReportService.js  diagnóstico de ventas
  marketingReportService.js
  metaPublisher.js       publicar en Facebook/Instagram
  notifier.js            Telegram
  social/
    connectors/          instagram.js, youtube.js (misma interfaz: fetchAccount)
    analytics.js         funciones puras: mediana, score atípico, cuadrantes
    collector.js         recolector diario
    accountService.js    registrar cuentas
    socialReportService.js
    db.js                Postgres (Neon)
migrations/              SQL del esquema social
scripts/                 CLI: runAgent, migrate, collectSocial, addAccount
```

## Agregar una red nueva

Crear `services/social/connectors/<red>.js` que exporte `fetchAccount(account)` y devuelva `{ account: { externalId, followers, mediaCount }, media: [...] }` con el mismo formato de métricas de los otros conectores. Registrarlo en `collector.js` y `accountService.js`, y agregar la red al `CHECK` de `social.account` con una migración nueva.
