const slackNotifier = require('./slackNotifier');
const telegramNotifier = require('./telegramNotifier');

/** Publica el mismo texto en Slack y Telegram; un canal caído no bloquea al otro. */
async function broadcast(message) {
  const [slack, telegram] = await Promise.all([
    slackNotifier.postToSlack(message),
    telegramNotifier.postToTelegram(message)
  ]);
  return { success: slack.success || telegram.success, slack, telegram };
}

/** Notifica que una gestión necesita intervención humana, en ambos canales. */
async function notifyHandoff(message) {
  return broadcast(`:rotating_light: Requiere intervención humana: ${message}\n\n🕐 Detección instantánea — un humano revisando manualmente esta conversación habría tardado varios minutos en notarlo.`);
}

/** Publica un informe generado y cuantifica el tiempo que ahorró el agente, en ambos canales. */
async function postReport(report, elapsedSeconds = 0) {
  return broadcast(`:bar_chart: Informe de ventas\n${report}\n\n⏱️ Esto le tomaría a un gerente de ventas ~45 min revisando el CRM manualmente. El agente lo hizo en ${elapsedSeconds} segundos.`);
}

module.exports = { broadcast, notifyHandoff, postReport };
