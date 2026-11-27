const test = require('node:test');
const assert = require('node:assert/strict');
const notifier = require('../services/telegramNotifier');

test.beforeEach(() => {
  process.env.HERMES_BOT_TOKEN = '123:abc';
  process.env.HERMES_CHAT_ID = '5534032418';
});

test('postToTelegram envía el texto al chat configurado', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.telegram.org/bot123:abc/sendMessage');
    assert.deepEqual(JSON.parse(options.body), { chat_id: '5534032418', text: 'hola' });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  assert.deepEqual(await notifier.postToTelegram('hola'), { success: true });
});

test('postToTelegram maneja configuración, respuesta y red inválidas', async () => {
  delete process.env.HERMES_BOT_TOKEN;
  assert.match((await notifier.postToTelegram('hola')).error, /HERMES_BOT_TOKEN/);
  process.env.HERMES_BOT_TOKEN = '123:abc';
  global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ description: 'chat no encontrado' }) });
  assert.match((await notifier.postToTelegram('hola')).error, /chat no encontrado/);
  global.fetch = async () => { throw new Error('caído'); };
  assert.match((await notifier.postToTelegram('hola')).error, /caído/);
});

test('los mensajes largos (plan con 18 contactos) se parten en varios de menos de 4096', () => {
  const { splitMessage } = require('../services/telegramNotifier');
  const long = Array.from({ length: 30 }, (_, i) => `${i}. Negocio\n   💬 ${'x'.repeat(180)}`).join('\n\n');
  const parts = splitMessage(long);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 4000));
  assert.equal(parts.join('\n\n'), long, 'no se pierde nada');
  assert.deepEqual(splitMessage('corto'), ['corto']);
  assert.ok(splitMessage('y'.repeat(9000)).every((p) => p.length <= 4000));
});
