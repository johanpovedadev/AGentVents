require('dotenv').config();

const { publishDueScheduledContent } = require('../services/scheduledContentPublisher');
const notifier = require('../services/notifier');

/**
 * Corre directo, sin pasar por el intérprete de Gemini -- esto es
 * determinístico (revisar fechas, publicar, actualizar estado), no hace
 * falta interpretar lenguaje natural, así que no cuesta cuota de LLM.
 */
async function main() {
  const result = await publishDueScheduledContent();
  if (!result.success) {
    console.error(`Error al publicar contenido programado: ${result.error}`);
    await notifier.broadcast(`:x: Error al publicar contenido programado del calendario: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(result.data);
  await notifier.postScheduledContentReport(result.data);
}

main().catch((error) => {
  console.error(`Error inesperado publicando contenido programado: ${error.message}`);
  process.exitCode = 1;
});
