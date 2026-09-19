# Guía de Pruebas - AGentVents

Proyecto enviado al hackathon **"Agents, Everywhere"** - Bogotá

## Estado Actual ✅

- ✅ **18/18 tests pasados** (99.24% cobertura)
- ✅ **Estructura de proyecto validada**
- ✅ **Gemini API Key configurada**
- ✅ **Scripts de demostración listos**

## Ejecución de Pruebas

### 1. Pruebas Unitarias (Unit Tests)
Ejecuta todos los tests con cobertura:

```bash
npm test
```

**Resultado esperado:**
- 18 tests pasados ✓
- Cobertura: >80% en todas las métricas

---

### 2. Demostración del Agente
Visualiza un flujo completo del agente sin necesidad de credenciales reales:

```bash
node scripts/demoBuild.js
```

**Qué hace:**
- ✓ Simula 3 acciones CRM (crear contacto, crear deal, actualizar deal)
- ✓ Muestra modo de aprobación humana con Slack
- ✓ Genera un informe de ventas
- ✓ Cuenta el tiempo y lo compara con revisión manual

**Salida:**
```
✅ DEMOSTRACIÓN COMPLETADA

Resumen:
  • 3 acciones CRM ejecutadas con aprobación humana
  • 1 informe de ventas generado con Gemini
  • 4 notificaciones enviadas a Slack
  • Tiempo total: ~3 segundos
```

---

## Para Pruebas Reales (Producción)

Si quieres ejecutar el agente contra HubSpot y Slack reales:

### Paso 1: Configura las credenciales en `.env`

```env
HUBSPOT_ACCESS_TOKEN=pat-na1-tu-token-aqui
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/tu-webhook
GEMINI_API_KEY=tu-api-key-de-gemini-aqui
AUTO_APPROVE_ACTIONS=false
```

### Paso 2: Ejecuta el agente con instrucciones

**Modo con aprobación humana (recomendado):**
```bash
node scripts/runAgent.js "crea un contacto para Juan Pérez, teléfono 3001234567"
```

**Modo autónomo:**
```bash
node scripts/runAgent.js "crea un contacto para Juan Pérez, teléfono 3001234567" --auto
```

**Generar informe:**
```bash
node scripts/runAgent.js "genera un informe de ventas"
```

---

## Datos de Prueba

El archivo `test-data.json` contiene datos mock:

```json
{
  "contacts": [
    { "id": 101, "firstname": "Juan", "lastname": "Pérez", "phone": "3001234567" },
    { "id": 102, "firstname": "María", "lastname": "García", "phone": "3109876543" },
    { "id": 103, "firstname": "Carlos", "lastname": "López", "phone": "3215555555" }
  ],
  "deals": [
    { "id": 201, "dealname": "Plan Premium", "amount": 500000, "dealstage": "negotiation" },
    { "id": 202, "dealname": "Consultoría Digital", "amount": 1500000, "dealstage": "closedwon" },
    { "id": 203, "dealname": "Soporte Anual", "amount": 200000, "dealstage": "closedlost" }
  ]
}
```

Puedes usar estos IDs en tus instrucciones:
```bash
node scripts/runAgent.js "crea un deal para el contacto con ID 101" --auto
node scripts/runAgent.js "actualiza el deal 201 a closedwon" --auto
```

---

## Flujo de Ejecución

```
Instrucción Natural
        ↓
Gemini: Parsear intención (JSON)
        ↓
crmAgent: Validar estructura
        ↓
¿Modo autónomo? → NO → Slack: Solicitar aprobación
                      ↓
                    Humano aprueba
                      ↓
                      ✓
        ↓
HubSpot: Ejecutar acción
        ↓
Slack: Confirmar resultado
        ↓
✅ Completado
```

---

## Checklist para el Hackathon

- [x] Repositorio público en GitHub
- [x] Tests pasados (99.24% cobertura)
- [x] Agente CRM funcional
- [x] Integración con Gemini ✓
- [x] Scripts de demostración
- [ ] Video de 2 minutos
- [ ] Descripción en el README
- [ ] Post en redes sociales

---

## Troubleshooting

### Error: "GEMINI_API_KEY no configurada"
**Solución:** Verifica que existe el archivo `.env` con la clave configurada.

### Error: "Modelo no disponible"
**Solución:** El script usa `gemini-1.5-flash`. Si no está disponible, actualiza a `gemini-2.0-flash` o superior.

### Error: "HubSpot no responde"
**Solución:** Verifica que el token de HubSpot es válido y tiene permisos de lectura/escritura.

### Error: "Slack Webhook inválido"
**Solución:** Verifica la URL en Settings → Incoming Webhooks del workspace de Slack.

---

## Contacto y Soporte

Para reportar issues: [GitHub Issues](https://github.com/johanpovedadev/AGentVents/issues)

**Última actualización:** 2026-09-12
**Estado del hackathon:** Activo hasta las 4:30 PM Bogotá

🚀 ¡Éxito en el envío!
