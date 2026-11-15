/**
 * Informes que corren solos en el PC de Johan (PM2 con cron, desde el
 * ecosystem.config.js de saas-bot). Se corren en el PC porque Lion Platform
 * vive en localhost:8081: desde GitHub Actions no se alcanza, por eso los
 * horarios de GitHub fallaban todos los días.
 *
 * Solo se permiten informes (leen datos y avisan por Telegram). Nada que cree
 * registros o publique corre programado: eso sigue pidiendo aprobación.
 */
const REPORTS = {
  seguimientos: 'acciones_embudo',
  ventas: 'generar_informe',
  marketing: 'informe_marketing'
};

/**
 * @param {string} nombre seguimientos | ventas | marketing
 * @param {{ ejecutarAccion: Function }} agent
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function runScheduledReport(nombre, agent, extras = {}) {
  const tipo = REPORTS[nombre];
  if (!tipo) {
    return { success: false, error: `Informe desconocido "${nombre}". Usa: ${Object.keys(REPORTS).join(', ')}.` };
  }
  const result = await agent.ejecutarAccion({ tipo, datos: {} });
  // Con los seguimientos de la mañana va también el plan del día: a quién escribir y qué decirle (15 nov 2026).
  if (nombre === 'seguimientos' && typeof extras.followUpPlan === 'function') {
    const plan = await extras.followUpPlan();
    if (!plan || !plan.success) return { success: false, error: `plan de seguimiento: ${(plan && plan.error) || 'sin detalle'}` };
  }
  return result && result.success ? { success: true } : { success: false, error: (result && result.error) || 'sin detalle' };
}

module.exports = { runScheduledReport, REPORTS };
