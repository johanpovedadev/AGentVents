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

/** Notifica que una gestión necesita intervención humana. */
async function notifyHandoff(message) {
  return postToSlack(`:rotating_light: Requiere intervención humana: ${message}`);
}

/** Publica un informe generado por el agente. */
async function postReport(report) {
  return postToSlack(`:bar_chart: Informe de ventas\n${report}`);
}

module.exports = { postToSlack, notifyHandoff, postReport };
