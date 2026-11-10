# Agente de redes y ventas — Lion Platform

Agente en Node.js que trabaja para Lion Platform en dos frentes:

- **Redes:** sigue cuentas propias y de la competencia (Instagram y YouTube), guarda una foto diaria de sus métricas y detecta qué publicaciones funcionan comparando cada una contra la mediana de su propia cuenta.
- **Ventas:** lee el embudo de prospectos de Lion Platform y genera el resumen de canales, las acciones de mejora del embudo y un diagnóstico de ventas con Gemini. También crea prospectos y publica en Facebook e Instagram.

Es **multi-tenant**: cada servicio se entrega solo a los tenants que tienen la licencia correspondiente en Lion Platform (`SOCIAL` para redes, `CRM` para ventas). Lion Platform es la única fuente de verdad de licencias; si no responde, el agente no entrega servicio a nadie (falla cerrado).

> Este repo nació como el agente de HubSpot del hackathon "Agents, Everywhere". HubSpot y Slack se retiraron en la v2.0; lo reutilizable (Gemini, Telegram, publicación en Meta, cliente de Lion Platform, modo aprobación) se conservó.

## Cómo encaja en el ecosistema

| Repo | Rol |
|---|---|
| `lion-platform-api` | Centro: tenants, usuarios, **licencias por producto**, prospectos |
| `lion-platform-web` | Tablero (aquí irá la pestaña "Redes") |
| `saas-bot` | Bots de WhatsApp |
| **este repo** | Agente de redes y ventas |

Los datos de redes viven en el esquema `social` de la misma base Neon del CRM. El agente escribe ahí; el CRM solo los lee para pintar las gráficas.

## Qué puede hacer

| Intención | Qué hace | ¿Pide aprobación? | Licencia |
|---|---|---|---|
| `informe_redes` | Seguidores, ganadores propios y de la competencia | No | SOCIAL |
| `generar_informe` | Diagnóstico de ventas del embudo con Gemini | No | — (cuenta propia) |
| `informe_marketing` | Prospectos nuevos por canal, últimos 7 días | No | — (cuenta propia) |
| `acciones_embudo` | Seguimientos vencidos, estancados, pagos atrasados, pedir reseña | No | — (cuenta propia) |
| `crear_prospecto` | Crea un prospecto en Lion Platform | Sí | — (cuenta propia) |
| `publicar_post` | Publica en Facebook o Instagram (foto o carrusel) | Sí | — (cuenta propia) |

Las intenciones de ventas operan hoy sobre la cuenta con la que el agente entra a Lion Platform (la tuya). Servirlas por cliente es parte de la fase 6 (ver `docs/requirements.md`).

## Uso rápido

```bash
pnpm install
cp .env.example .env          # completar credenciales
pnpm migrate                  # crea/actualiza el esquema social
pnpm add-account -- --tenant 1 --red instagram --usuario rutadeviajelion
pnpm add-account -- --tenant 1 --red youtube --usuario @competidor --competencia
pnpm collect                  # recolección (normalmente la corre GitHub Actions)
node scripts/runAgent.js "dame el informe de redes de esta semana"
node scripts/runAgent.js "crea un prospecto Heladería Mundo, 3001234567, llegó por instagram"
```

`--auto` en `runAgent.js` activa el modo autónomo solo para esa ejecución.

## Automatizaciones (GitHub Actions)

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `social-collect.yml` | Diario 01:17 Bogotá | Migraciones + recolección de redes (solo tenants con SOCIAL) |
| `marketing-report.yml` | Lunes 08:00 Bogotá | Informes de canales, embudo, ventas y redes por Telegram |
| `ci.yml` | Cada PR y push a `develop`/`main` | Pruebas con cobertura mínima del 80 % |

## Documentación

- [`docs/requirements.md`](docs/requirements.md): requisitos funcionales y no funcionales.
- [`docs/architecture-decisions.md`](docs/architecture-decisions.md): decisiones y por qué.
- [`docs/deployment.md`](docs/deployment.md): Neon, GitHub Actions, Koyeb, Oracle y túnel.
- [`TESTING.md`](TESTING.md): cómo probar.
- [`AGENTS.md`](AGENTS.md): reglas para agentes de IA que trabajen en este repo.
