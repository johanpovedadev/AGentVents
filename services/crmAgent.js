const hubspotClient = require('./hubspotClient');
const slackNotifier = require('./slackNotifier');
const reportService = require('./reportService');

const ACTION_TYPES = ['crear_contacto', 'crear_deal', 'actualizar_deal', 'actualizar_contacto'];

/** Convierte los datos de la intención en texto legible para una aprobación humana. */
function formatActionData(datos) {
  return Object.entries(datos).map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
    const formattedValue = value && typeof value === 'object'
      ? Object.entries(value).map(([nestedKey, nestedValue]) => `${nestedKey}: ${nestedValue}`).join(', ')
      : value;
    return `• ${label}: ${formattedValue}`;
  }).join('\n');
}

/** Ejecuta la intención ya aprobada, sin volver a evaluar el modo de autonomía. */
async function ejecutarAccionAprobada(intencion, automatico = false) {
  let result;
  let description;
  switch (intencion.tipo) {
    case 'crear_contacto':
      result = await hubspotClient.createContact(intencion.datos);
      description = 'Contacto creado';
      break;
    case 'crear_deal':
      result = await hubspotClient.createDeal(intencion.datos);
      description = 'Deal creado';
      break;
    case 'actualizar_deal':
      result = await hubspotClient.updateDealStage(intencion.datos.dealId, intencion.datos.dealstage);
      description = 'Etapa del deal actualizada';
      break;
    case 'actualizar_contacto':
      result = await hubspotClient.updateContact(intencion.datos.contactId, intencion.datos.propiedades);
      description = 'Contacto actualizado';
      break;
    case 'generar_informe':
      result = await reportService.generateSalesReport();
      description = 'Informe de ventas generado';
      break;
    default:
      result = { success: false, error: `Tipo de intención no soportado: ${intencion.tipo}.` };
  }

  if (!result.success) {
    await slackNotifier.postToSlack(`:x: Error al ${description || 'procesar la acción'}: ${result.error}`);
    return result;
  }

  if (intencion.tipo === 'generar_informe') {
    await slackNotifier.postReport(result.data, result.elapsedSeconds);
  } else {
    const recordId = result.data && result.data.id ? ` (ID: ${result.data.id})` : '';
    const autonomyNote = automatico ? '\n✅ Ejecutado automáticamente (modo autónomo activo)' : '';
    await slackNotifier.postToSlack(`:white_check_mark: ${description}${recordId}. Datos: ${formatActionData(intencion.datos)}${autonomyNote}`);
  }
  return result;
}

/** Ejecuta una intención CRM y deja trazabilidad en Slack. */
async function ejecutarAccionCRM(intencion) {
  if (!intencion || !intencion.tipo || !intencion.datos) {
    const error = 'La intención debe incluir tipo y datos.';
    await slackNotifier.postToSlack(`:x: Error del agente CRM: ${error}`);
    return { success: false, error };
  }

  const automatico = process.env.AUTO_APPROVE_ACTIONS === 'true';
  if (ACTION_TYPES.includes(intencion.tipo) && !automatico) {
    await slackNotifier.postToSlack(`⏸️ *Acción pendiente de aprobación*\nTipo: ${intencion.tipo}\nDatos:\n${formatActionData(intencion.datos)}\n\nResponde 'aprobar' en este hilo para ejecutar, o 'rechazar' para descartar.`);
    return { estado: 'pendiente_aprobacion', intencion };
  }

  return ejecutarAccionAprobada(intencion, automatico && ACTION_TYPES.includes(intencion.tipo));
}

/** Ejecuta directamente una intención que un humano ya aprobó. */
async function aprobarAccionPendiente(intencion) {
  if (!intencion || !intencion.tipo || !intencion.datos) {
    return { success: false, error: 'La intención aprobada debe incluir tipo y datos.' };
  }
  return ejecutarAccionAprobada(intencion, false);
}

module.exports = { ejecutarAccionCRM, aprobarAccionPendiente };
