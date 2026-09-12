require('dotenv').config();

/** Envía texto al Incoming Webhook configurado en Slack. */
async function postToSlack(message) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    return { success: false, error: 'Falta la variable de entorno SLACK_WEBHOOK_URL.' };
  }
  try {
    const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });
    if (!response.ok) {
      return { success: false, error: `Slack respondió ${response.status}.` };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: `No fue posible notificar a Slack: ${error.message}` };
  }
}

/** Notifica que una gestión necesita intervención humana y el valor de detectarla temprano. */
async function notifyHandoff(message) {
  return postToSlack(`:rotating_light: Requiere intervención humana: ${message}\n\n🕐 Detección instantánea — un humano revisando manualmente esta conversación habría tardado varios minutos en notarlo.`);
}

/** Publica un informe generado y cuantifica el tiempo que ahorró el agente. */
async function postReport(report, elapsedSeconds = 0) {
  return postToSlack(`:bar_chart: Informe de ventas\n${report}\n\n⏱️ Esto le tomaría a un gerente de ventas ~45 min revisando el CRM manualmente. El agente lo hizo en ${elapsedSeconds} segundos.`);
}

module.exports = { postToSlack, notifyHandoff, postReport };
