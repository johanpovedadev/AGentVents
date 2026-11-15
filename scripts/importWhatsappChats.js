require('dotenv').config();

const fs = require('fs');
const path = require('path');
const client = require('../services/lionPlatformClient');
const notifier = require('../services/notifier');
const { importChats, formatSummary } = require('../services/whatsappChatImporter');

/**
 * Importa a Lion Platform los JSON que dejó la tarea de Claude en data/chats_entrantes/
 * y los mueve a data/chats_entrantes/procesados/. Si no hay archivos, no hace nada
 * (ni avisa). Lo lanza PM2 cada 15 minutos (ecosystem.config.js de saas-bot).
 */
async function main(baseDir = path.join(__dirname, '..', 'data', 'chats_entrantes')) {
  if (!fs.existsSync(baseDir)) return;
  const files = fs.readdirSync(baseDir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) return;
  const doneDir = path.join(baseDir, 'procesados');
  fs.mkdirSync(doneDir, { recursive: true });

  for (const file of files) {
    const full = path.join(baseDir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (error) {
      await notifier.broadcast(`⚠️ Chats de WhatsApp: el archivo ${file} no se pudo leer (${error.message}). Lo dejo para revisar.`);
      fs.renameSync(full, path.join(doneDir, `ERROR_${file}`));
      continue;
    }
    const result = await importChats(data.chats, client);
    fs.renameSync(full, path.join(doneDir, file));
    console.log(formatSummary(result));
    await notifier.broadcast(formatSummary(result));
  }
}

main().catch((error) => {
  console.error(`Error importando chats: ${error.message}`);
  process.exitCode = 1;
});
