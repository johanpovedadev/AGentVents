require('dotenv').config();

const { collect, formatSummary } = require('../services/social/collector');
const notifier = require('../services/notifier');
const db = require('../services/social/db');

/**
 * Corrida diaria del recolector (GitHub Actions con cron). Solo avisa por
 * Telegram si algo falló o se omitió, para no llenar el chat todos los días.
 */
async function main() {
  const result = await collect();
  const text = formatSummary(result);
  console.log(text);
  const s = result.summary;
  if (!result.success || s.errores.length > 0 || s.omitidas.length > 0) {
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
