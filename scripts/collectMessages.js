require('dotenv').config();

const { collectMessages, formatSummary, shouldNotify } = require('../services/social/inboxCollector');
const notifier = require('../services/notifier');
const db = require('../services/social/db');

/**
 * Escucha de mensajes de Instagram y Messenger (GitHub Actions cada 2 horas).
 * Avisa por Telegram solo si llegaron mensajes nuevos sin responder o algo falló.
 */
async function main() {
  const outcome = await collectMessages();
  const text = formatSummary(outcome);
  console.log(text);
  if (shouldNotify(outcome)) await notifier.broadcast(text);
  if (!outcome.success) process.exitCode = 1;
}

main()
  .catch(async (error) => {
    console.error(error.message);
    await notifier.broadcast(`❌ La escucha de mensajes de redes falló: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
