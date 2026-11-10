require('dotenv').config();

const { parseIntent } = require('../services/intentParser');
const { ejecutarAccion } = require('../services/agent');

/** Ejecuta una instrucción en lenguaje natural de punta a punta desde la línea de comandos. */
async function main() {
  const args = process.argv.slice(2);
  const autoApprove = args.includes('--auto');
  const message = args.filter((arg) => arg !== '--auto').join(' ').trim();
  if (!message) {
    console.error('Uso: node scripts/runAgent.js "dame el informe de redes de esta semana"');
    process.exitCode = 1;
    return;
  }

  // Permite activar el modo autónomo para una sola ejecución sin editar el .env.
  if (autoApprove) process.env.AUTO_APPROVE_ACTIONS = 'true';

  const parsed = await parseIntent(message);
  if (!parsed.success) {
    console.error(`Error al interpretar la intención: ${parsed.error}`);
    process.exitCode = 1;
    return;
  }

  console.log('Intención detectada:', JSON.stringify(parsed.data, null, 2));
  const result = await ejecutarAccion(parsed.data);
  if (result.estado === 'pendiente_aprobacion') {
    console.log('Acción pendiente de aprobación. Revisa el mensaje enviado a Telegram.');
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
