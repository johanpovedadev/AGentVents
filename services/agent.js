const lionPlatformClient = require('./lionPlatformClient');
const marketingReportService = require('./marketingReportService');
const metaPublisher = require('./metaPublisher');
const notifier = require('./notifier');
const salesReportService = require('./salesReportService');
const socialReportService = require('./social/socialReportService');

/**
 * Intenciones que cambian algo afuera (crean un registro o publican). Estas
 * esperan aprobación humana salvo que el modo autónomo esté activo. Los
 * informes solo leen datos, así que corren directo.
 */
const ACTION_TYPES = ['crear_prospecto', 'publicar_post'];

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
    case 'crear_prospecto':
      result = await lionPlatformClient.createProspect(intencion.datos);
      description = 'Prospecto creado en Lion Platform';
      break;
    case 'publicar_post':
      result = await metaPublisher.publish(intencion.datos.canal, intencion.datos);
      description = `Post publicado en ${intencion.datos.canal}`;
      break;
    case 'generar_informe':
      result = await salesReportService.generateSalesReport();
      description = 'Informe de ventas generado';
      break;
    case 'informe_marketing':
      result = await marketingReportService.generateWeeklyMarketingReport();
      description = 'Resumen semanal de canales generado';
      break;
    case 'acciones_embudo':
      result = await marketingReportService.generateFunnelHealthReport();
      description = 'Acciones de mejora del embudo generadas';
      break;
    case 'informe_redes':
      result = await socialReportService.generateSocialReport(intencion.datos);
      description = 'Informe de redes generado';
      break;
    default:
      result = { success: false, error: `Tipo de intención no soportado: ${intencion.tipo}.` };
  }

  if (!result.success) {
    await notifier.broadcast(`❌ Error al ${description || 'procesar la acción'}: ${result.error}`);
    return result;
  }

  if (intencion.tipo === 'generar_informe') {
    await notifier.postReport(result.data, result.elapsedSeconds);
  } else if (intencion.tipo === 'informe_marketing') {
    await notifier.postMarketingReport(result.data);
  } else if (intencion.tipo === 'acciones_embudo') {
    await notifier.postFunnelHealthReport(result.data);
  } else if (intencion.tipo === 'informe_redes') {
    await notifier.postSocialReport(result.data);
  } else {
    const recordId = result.data && result.data.id ? ` (ID: ${result.data.id})` : '';
    const autonomyNote = automatico ? '\n✅ Ejecutado automáticamente (modo autónomo activo)' : '';
    await notifier.broadcast(`✅ ${description}${recordId}. Datos:\n${formatActionData(intencion.datos)}${autonomyNote}`);
  }
  return result;
}

/** Punto de entrada del agente de redes y ventas: valida, pide aprobación si toca, y ejecuta. */
async function ejecutarAccion(intencion) {
  if (!intencion || !intencion.tipo || !intencion.datos) {
    const error = 'La intención debe incluir tipo y datos.';
    await notifier.broadcast(`❌ Error del agente: ${error}`);
    return { success: false, error };
  }

  const automatico = process.env.AUTO_APPROVE_ACTIONS === 'true';
  if (ACTION_TYPES.includes(intencion.tipo) && !automatico) {
    await notifier.broadcast(`⏸️ Acción pendiente de aprobación\nTipo: ${intencion.tipo}\nDatos:\n${formatActionData(intencion.datos)}\n\nResponde 'aprobar' para ejecutar o 'rechazar' para descartar.`);
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

module.exports = { ejecutarAccion, aprobarAccionPendiente, ACTION_TYPES };
