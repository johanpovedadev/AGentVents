require('dotenv').config();

const TELEGRAM_BASE_URL = 'https://api.telegram.org';

/** Envía texto al chat configurado del bot de Telegram (Jarvis León). */
async function postToTelegram(message) {
  if (!process.env.HERMES_BOT_TOKEN || !process.env.HERMES_CHAT_ID) {
    return { success: false, error: 'Faltan las variables de entorno HERMES_BOT_TOKEN o HERMES_CHAT_ID.' };
  }
  try {
    const response = await fetch(`${TELEGRAM_BASE_URL}/bot${process.env.HERMES_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.HERMES_CHAT_ID, text: message })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, error: `Telegram respondió ${response.status}: ${body.description || 'No fue posible enviar el mensaje.'}` };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: `No fue posible notificar a Telegram: ${error.message}` };
  }
}

module.exports = { postToTelegram };
