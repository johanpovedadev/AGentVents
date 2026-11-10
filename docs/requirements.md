# Requisitos — Agente de redes y ventas

Módulo vendible de Lion Platform. Se usa primero en las cuentas propias (piloto) y luego se vende a clientes como el producto `SOCIAL`. Estado a la fecha de esta versión: ✅ hecho · 🟡 parcial · ⏳ pendiente.

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Recolección de Instagram y YouTube, propias y competencia | ✅ código listo, falta conectar credenciales reales |
| 2 | Analítica y pestaña "Redes" en el CRM | 🟡 analítica lista; pestaña pendiente en `lion-platform-web` |
| 3 | Etiquetado de videos con IA; ideas y guiones | ⏳ |
| 4 | Agente semanal y chat por Telegram; agendar en el calendario de contenido | 🟡 informe semanal listo; chat pendiente |
| 5 | Comentario → DM → WhatsApp → lead en el CRM; atribución | ⏳ |
| 6 | Venta a clientes: OAuth por tenant, revisión de apps de Meta/Google/TikTok, informes de ventas por cliente | ⏳ |

## Roles

Los de Lion Platform: `SUPER_ADMIN` (dueño de la plataforma), `TENANT_ADMIN` (dueño del negocio cliente), `OPERATOR` (empleado). El agente entra a Lion Platform como `SUPER_ADMIN` para poder verificar licencias de todos los tenants.

## Requisitos funcionales

### Licencias y multi-tenant

| ID | Requisito | Estado |
|---|---|---|
| SOC-RF-01 | Cada servicio se entrega solo si el tenant tiene el producto en Lion Platform: `SOCIAL` (redes), `CRM` (ventas), `BOT` (WhatsApp). | ✅ `licenseService.js` |
| SOC-RF-02 | Un tenant `SUSPENDED` (por ejemplo por no pago) no recibe ningún servicio aunque tenga productos. | ✅ |
| SOC-RF-03 | Si Lion Platform no responde, no se entrega servicio a nadie (falla cerrado) y se avisa. | ✅ |
| SOC-RF-04 | Lion Platform es la única fuente de verdad de licencias: el agente no guarda copia. | ✅ |
| SOC-RF-05 | `lion-platform-api` reconoce el producto `SOCIAL` (enum `TenantProduct`) y la pestaña Redes se ve con 🔒 sin licencia. | ⏳ PR aparte en `lion-platform-api` / `lion-platform-web` |

### Cuentas

| ID | Requisito | Estado |
|---|---|---|
| SOC-RF-06 | Registrar cuentas propias y de competencia por tenant (Instagram, YouTube). | ✅ `scripts/addAccount.js` |
| SOC-RF-07 | Al registrar, validar que la cuenta existe y se puede consultar; si no, mostrar el motivo (p. ej. "debe ser Business o Creator"). | ✅ |
| SOC-RF-08 | Máximo 10 competidores por red por tenant. | ✅ |
| SOC-RF-09 | Cuentas propias de clientes conectadas por OAuth desde el CRM. | ⏳ fase 6 |

### Recolección

| ID | Requisito | Estado |
|---|---|---|
| SOC-RF-10 | Foto diaria por cuenta: seguidores y número de publicaciones. | ✅ |
| SOC-RF-11 | Foto de métricas por publicación (últimas 30 por cuenta). | ✅ |
| SOC-RF-12 | Cuenta propia de Instagram: alcance, vistas, guardados, compartidos, tiempo medio de reels. | ✅ |
| SOC-RF-13 | Competencia: solo datos públicos (Instagram: likes y comentarios; YouTube: vistas, likes, comentarios). | ✅ |
| SOC-RF-14 | El error de una cuenta no detiene las demás; queda en `social.job_run`. | ✅ |
| SOC-RF-15 | Ejecución manual además del horario automático. | ✅ `workflow_dispatch` |

### Analítica e informes

| ID | Requisito | Estado |
|---|---|---|
| SOC-RF-16 | Score atípico: rendimiento ÷ mediana de la propia cuenta. Ganador ≥ 2×, no repetir ≤ 0,5×. | ✅ |
| SOC-RF-17 | Velocidad: valor de la métrica a las 48 h de publicado. | ✅ función lista; falta mostrarla |
| SOC-RF-18 | Cuadrantes (alcance × interacción): estrella, joya oculta, alcance sin conexión, descartar. | ✅ función lista; falta mostrarla |
| SOC-RF-19 | Crecimiento de seguidores en el periodo. | ✅ |
| SOC-RF-20 | Avisar "poca muestra" con menos de 10 publicaciones. | ✅ |
| SOC-RF-21 | Informe semanal de redes por Telegram. | ✅ |
| SOC-RF-22 | Gráficas en `lion-platform-web` (barras de seguidores, dispersión, ganadores). | ⏳ fase 2 |

### Ventas

| ID | Requisito | Estado |
|---|---|---|
| SOC-RF-23 | Crear prospectos en Lion Platform con su fuente (Instagram, Facebook…). | ✅ |
| SOC-RF-24 | Resumen semanal de prospectos nuevos por canal. | ✅ |
| SOC-RF-25 | Acciones de mejora del embudo (vencidos, estancados, pagos atrasados, pedir reseña). | ✅ |
| SOC-RF-26 | Diagnóstico de ventas con Gemini sobre el embudo de Lion Platform (sin enviar teléfonos al modelo). | ✅ |
| SOC-RF-27 | Publicar en Facebook e Instagram (imagen o carrusel) con aprobación. | ✅ |

## Requisitos no funcionales

| ID | Categoría | Requisito | Estado |
|---|---|---|---|
| SOC-RNF-01 | Multi-tenant | Toda tabla con datos de cliente lleva `tenant_id`; toda lectura filtra por él. | ✅ |
| SOC-RNF-02 | Seguridad | Secretos solo en `.env` o GitHub Secrets. | ✅ |
| SOC-RNF-03 | Seguridad | Conexión a Neon con SSL verificado. | ✅ |
| SOC-RNF-04 | Legal | Solo APIs oficiales; nada de scraping sin decisión documentada. | ✅ |
| SOC-RNF-05 | Costo | Fases 1 a 3 sin costo de infraestructura (Neon free, GitHub Actions). | ✅ |
| SOC-RNF-06 | Datos | Publicaciones de los últimos 30 días: foto diaria; más viejas: solo los lunes. | ✅ |
| SOC-RNF-07 | Datos | Dato que la red no entrega = `null`, nunca 0. | ✅ |
| SOC-RNF-08 | Confiabilidad | Recolector idempotente: dos corridas el mismo día no duplican. | ✅ verificado contra Postgres real |
| SOC-RNF-09 | Confiabilidad | Aviso por Telegram si la recolección falla u omite cuentas. | ✅ |
| SOC-RNF-10 | Confiabilidad | Nunca dos recolecciones simultáneas. | ✅ `concurrency` del workflow |
| SOC-RNF-11 | IA | Toda cifra de un informe sale de datos, no del modelo. | ✅ |
| SOC-RNF-12 | Mantenibilidad | Un conector por red con la misma interfaz. | ✅ |
| SOC-RNF-13 | Mantenibilidad | Migraciones versionadas; nunca editar una aplicada. | ✅ |
| SOC-RNF-14 | Calidad | Gitflow con PR; pruebas con 80 % de cobertura mínima en CI. | ✅ |

## Fuera de alcance por ahora

Scraping, competencia de TikTok, edición de video, pagos automáticos con pasarela, más de 10 competidores por red.
