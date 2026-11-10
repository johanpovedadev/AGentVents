const telegramNotifier = require('./telegramNotifier');

/**
 * Único canal de avisos: Telegram (bot Jarvis León). Slack se retiró junto con
 * lo del hackathon. Se conserva esta capa para que el resto del agente no sepa
 * por qué canal sale cada mensaje — agregar WhatsApp después no toca a nadie más.
 */
async function broadcast(message) {
  const telegram = await telegramNotifier.postToTelegram(message);
  return { success: telegram.success, telegram };
}

/** Notifica que una gestión necesita intervención humana. */
async function notifyHandoff(message) {
  return broadcast(`🚨 Requiere intervención humana: ${message}`);
}

/** Publica el diagnóstico de ventas y cuánto tardó el agente en armarlo. */
async function postReport(report, elapsedSeconds = 0) {
  return broadcast(`📊 Informe de ventas\n${report}\n\n⏱️ Generado en ${elapsedSeconds} s.`);
}

/** Publica el resumen semanal de prospectos nuevos por canal. */
async function postMarketingReport(report) {
  return broadcast(`📈 Resumen semanal de canales\n${report}`);
}

/** Publica las acciones de mejora del embudo (captación y retención) de la semana. */
async function postFunnelHealthReport(report) {
  return broadcast(`🔎 Acciones de mejora del embudo esta semana\n${report}`);
}

/** Publica el informe de redes sociales (ganadores, competencia, seguidores). */
async function postSocialReport(report) {
  return broadcast(`🎬 Informe de redes\n${report}`);
}

module.exports = { broadcast, notifyHandoff, postReport, postMarketingReport, postFunnelHealthReport, postSocialReport };
