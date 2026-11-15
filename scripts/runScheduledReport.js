require('dotenv').config();

const agent = require('../services/agent');
const { runScheduledReport } = require('../services/scheduledReports');
const lionPlatformClient = require('../services/lionPlatformClient');
const notifier = require('../services/notifier');
const { generateFollowUpPlan, geminiWriter, todayBogota } = require('../services/followUpPlan');

/** Plan de seguimiento del día: se arma con Lion Platform y se manda a Telegram. */
async function followUpPlan() {
  const plan = await generateFollowUpPlan(lionPlatformClient, { today: todayBogota(), writer: geminiWriter() });
  if (plan.success) await notifier.broadcast(plan.data);
  return plan;
}

/**
 * Corre un informe y termina. Lo lanza PM2 con cron_restart y autorestart:false
 * (ver ecosystem.config.js de saas-bot). Uso: node scripts/runScheduledReport.js seguimientos
 */
runScheduledReport(process.argv[2], agent, { followUpPlan })
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
