require('dotenv').config();

const { parseIntent } = require('../services/intentParser');
const { ejecutarAccionCRM } = require('../services/crmAgent');

/** Ejecuta la demostración de extremo a extremo desde la línea de comandos. */
async function main() {
  const args = process.argv.slice(2);
  const autoApprove = args.includes('--auto');
  const message = args.filter((arg) => arg !== '--auto').join(' ').trim();
  if (!message) {
    console.error('Uso: node scripts/runAgent.js "crea un contacto para María López, teléfono 3001234567"');
    process.exitCode = 1;
    return;
  }

  // Permite alternar al modo autónomo durante la demo sin editar el archivo .env.
  if (autoApprove) process.env.AUTO_APPROVE_ACTIONS = 'true';

  const parsed = await parseIntent(message);
  if (!parsed.success) {
    console.error(`Error al interpretar la intención: ${parsed.error}`);
    process.exitCode = 1;
    return;
  }

  console.log('Intención detectada:', JSON.stringify(parsed.data, null, 2));
  const result = await ejecutarAccionCRM(parsed.data);
  if (result.estado === 'pendiente_aprobacion') {
    console.log('Acción pendiente de aprobación. Revisa el mensaje enviado a Slack.');
    return;
  }
  if (!result.success) {
    console.error(`Acción fallida: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Acción completada:', JSON.stringify(result.data, null, 2));
}

main().catch((error) => {
  console.error(`Error inesperado del agente: ${error.message}`);
  process.exitCode = 1;
});
