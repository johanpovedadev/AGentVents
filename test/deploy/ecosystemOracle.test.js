const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const config = require('../../deploy/oracle/ecosystem.oracle.config.js');

test('el servidor corre los 3 informes y las 2 tareas de redes, cada una a su hora', () => {
  const byName = Object.fromEntries(config.apps.map((a) => [a.name, a]));
  assert.deepStrictEqual(Object.keys(byName).sort(), [
    'agentvents-marketing', 'agentvents-redes-mensajes', 'agentvents-redes-metricas', 'agentvents-seguimientos', 'agentvents-ventas',
  ]);
  assert.strictEqual(byName['agentvents-seguimientos'].cron_restart, '0 6 * * 1-6');
  assert.strictEqual(byName['agentvents-redes-mensajes'].cron_restart, '43 */2 * * *');
  assert.strictEqual(byName['agentvents-redes-metricas'].cron_restart, '47 6 * * *', 'el resumen de redes va en la mañana');
});

test('cada tarea termina sola, en hora de Bogotá, y su script existe en el repo', () => {
  const root = path.resolve(__dirname, '..', '..');
  for (const app of config.apps) {
    assert.strictEqual(app.autorestart, false, app.name);
    assert.strictEqual(app.env.TZ, 'America/Bogota', app.name);
    assert.strictEqual(app.cwd, root, app.name);
    assert.ok(fs.existsSync(path.join(root, app.script)), `${app.name}: ${app.script}`);
  }
});

test('el importador de chats de WhatsApp NO se muda (lee archivos del PC)', () => {
  assert.ok(!config.apps.some((a) => /importWhatsappChats/.test(a.script)));
});
