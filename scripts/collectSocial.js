require('dotenv').config();

const { collect, formatSummary } = require('../services/social/collector');
const notifier = require('../services/notifier');
const { realErrors } = require('../services/social/inboxCollector');
const db = require('../services/social/db');

/**
 * Corrida diaria del recolector (PM2 en Oracle, en la mañana). Solo avisa por Telegram si algo falló de verdad:
 * las cuentas omitidas o sin conectar todavía no avisan (Johan, 27 nov 2026: sin redes conectadas, nada).
 */
async function main() {
  const result = await collect();
  const text = formatSummary(result);
  console.log(text);
  const s = result.summary;
  if (!result.success || realErrors(s.errores.map((e) => e.error)).length > 0) {
    await notifier.broadcast(`${result.success ? '⚠️' : '❌'} ${text}`);
  }
  if (!result.success) process.exitCode = 1;
}

main()
  .catch(async (error) => {
    console.error(error.message);
    await notifier.broadcast(`❌ El recolector de redes falló: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
