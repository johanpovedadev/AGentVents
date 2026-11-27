require('dotenv').config();

const TELEGRAM_BASE_URL = 'https://api.telegram.org';

const MAX_CHARS = 4000; // Telegram acepta hasta 4096 por mensaje

/**
 * Parte un texto largo en trozos de máximo MAX_CHARS, cortando en líneas en blanco (entre contactos del plan)
 * y, si un bloque solo ya es muy largo, por líneas.
 */
function splitMessage(text, max = MAX_CHARS) {
  const t = String(text || '');
  if (t.length <= max) return [t];
  const parts = [];
  let cur = '';
  const push = (piece, sep) => {
    if (!cur) { cur = piece; return; }
    if (cur.length + sep.length + piece.length <= max) { cur += sep + piece; return; }
    parts.push(cur);
    cur = piece;
  };
  for (const block of t.split('\n\n')) {
    if (block.length <= max) { push(block, '\n\n'); continue; }
    for (const line of block.split('\n')) push(line.slice(0, max), '\n');
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Envía texto al chat configurado del bot de Telegram (Jarvis León). Si es muy largo, lo manda en varios mensajes. */
async function postToTelegram(message) {
  if (!process.env.HERMES_BOT_TOKEN || !process.env.HERMES_CHAT_ID) {
    return { success: false, error: 'Faltan las variables de entorno HERMES_BOT_TOKEN o HERMES_CHAT_ID.' };
  }
  for (const part of splitMessage(message)) {
    const sent = await postOne(part);
    if (!sent.success) return sent;
  }
  return { success: true };
}

async function postOne(message) {
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

module.exports = { postToTelegram, splitMessage, MAX_CHARS };
