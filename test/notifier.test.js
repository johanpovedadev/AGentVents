const test = require('node:test');
const assert = require('node:assert/strict');
const telegram = require('../services/telegramNotifier');
const notifier = require('../services/notifier');

test('broadcast manda el texto a Telegram y devuelve su resultado', async () => {
  const seen = [];
  telegram.postToTelegram = async (message) => { seen.push(message); return { success: true }; };
  const result = await notifier.broadcast('hola');
  assert.equal(result.success, true);
  assert.deepEqual(seen, ['hola']);
});

test('broadcast refleja un fallo de Telegram', async () => {
  telegram.postToTelegram = async () => ({ success: false, error: 'caído' });
  const result = await notifier.broadcast('hola');
  assert.equal(result.success, false);
  assert.equal(result.telegram.error, 'caído');
});

test('los formateadores de informes agregan su encabezado', async () => {
  const seen = [];
  telegram.postToTelegram = async (message) => { seen.push(message); return { success: true }; };
  await notifier.notifyHandoff('revisar');
  await notifier.postReport('todo bien', 3);
  await notifier.postReport('sin tiempo');
  await notifier.postMarketingReport('5 prospectos nuevos');
  await notifier.postFunnelHealthReport('2 vencidos');
  await notifier.postSocialReport('3 ganadores');
  assert.match(seen[0], /intervención humana/);
  assert.match(seen[1], /Informe de ventas[\s\S]*3 s/);
  assert.match(seen[2], /0 s/);
  assert.match(seen[3], /Resumen semanal de canales/);
  assert.match(seen[4], /embudo/);
  assert.match(seen[5], /Informe de redes\n3 ganadores/);
});
