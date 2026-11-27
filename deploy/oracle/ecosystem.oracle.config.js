/**
 * AGentVents en el servidor de Oracle (PM2). Cada tarea corre a su hora (cron_restart) y termina sola.
 * Hora del servidor: America/Bogota (la pone deploy/oracle/setup.sh de saas-bot).
 * El importador de chats de WhatsApp (data/chats_entrantes) sigue en el PC: esos archivos se dejan allá.
 */
const base = {
  cwd: require('path').resolve(__dirname, '..', '..'),
  interpreter: 'node',
  watch: false,
  autorestart: false,
  max_restarts: 10,
  min_uptime: '20s',
  stop_exit_codes: [78],
  env: { NODE_ENV: 'production', TZ: 'America/Bogota' },
};

const tareas = [
  // Informes (antes en PM2 del PC)
  { name: 'agentvents-seguimientos', script: 'scripts/runScheduledReport.js', args: 'seguimientos', cron_restart: '0 6 * * 1-6' },
  { name: 'agentvents-ventas', script: 'scripts/runScheduledReport.js', args: 'ventas', cron_restart: '10 8 * * 1' },
  { name: 'agentvents-marketing', script: 'scripts/runScheduledReport.js', args: 'marketing', cron_restart: '20 8 * * 1' },
  // Redes (antes en GitHub Actions: social-collect.yml y social-inbox.yml)
  { name: 'agentvents-redes-metricas', script: 'scripts/collectSocial.js', cron_restart: '47 6 * * *' },
  { name: 'agentvents-redes-mensajes', script: 'scripts/collectMessages.js', cron_restart: '43 */2 * * *' },
];

module.exports = { apps: tareas.map((t) => ({ ...base, ...t })), tareas };
