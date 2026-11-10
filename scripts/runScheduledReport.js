require('dotenv').config();

const agent = require('../services/agent');
const { runScheduledReport } = require('../services/scheduledReports');

/**
 * Corre un informe y termina. Lo lanza PM2 con cron_restart y autorestart:false
 * (ver ecosystem.config.js de saas-bot). Uso: node scripts/runScheduledReport.js seguimientos
 */
runScheduledReport(process.argv[2], agent)
  .then((result) => {
    if (!result.success) {
      console.error(`Informe "${process.argv[2]}" falló: ${result.error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Informe "${process.argv[2]}" enviado a Telegram.`);
  })
  .catch((error) => {
    console.error(`Error inesperado: ${error.message}`);
    process.exitCode = 1;
  });
