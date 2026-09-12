const hubspotClient = require('./hubspotClient');
const slackNotifier = require('./slackNotifier');
const reportService = require('./reportService');

/** Ejecuta una intención CRM y deja trazabilidad en Slack. */
async function ejecutarAccionCRM(intencion) {
  if (!intencion || !intencion.tipo || !intencion.datos) {
    const error = 'La intención debe incluir tipo y datos.';
    await slackNotifier.postToSlack(`:x: Error del agente CRM: ${error}`);
    return { success: false, error };
  }

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
    await slackNotifier.postReport(result.data);
  } else {
    const recordId = result.data && result.data.id ? ` (ID: ${result.data.id})` : '';
    await slackNotifier.postToSlack(`:white_check_mark: ${description}${recordId}. Datos: ${JSON.stringify(intencion.datos)}`);
  }
  return result;
}

module.exports = { ejecutarAccionCRM };
