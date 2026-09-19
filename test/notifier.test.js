const test = require('node:test');
const assert = require('node:assert/strict');
const slack = require('../services/slackNotifier');
const telegram = require('../services/telegramNotifier');
const notifier = require('../services/notifier');

test.beforeEach(() => {
  slack.postToSlack = async () => ({ success: true });
  telegram.postToTelegram = async () => ({ success: true });
});

test('broadcast manda el mismo texto a Slack y Telegram', async () => {
  const seen = [];
  slack.postToSlack = async (message) => { seen.push(['slack', message]); return { success: true }; };
  telegram.postToTelegram = async (message) => { seen.push(['telegram', message]); return { success: true }; };
  const result = await notifier.broadcast('hola');
  assert.equal(result.success, true);
  assert.deepEqual(seen, [['slack', 'hola'], ['telegram', 'hola']]);
});

test('broadcast sigue siendo success si un solo canal responde', async () => {
  slack.postToSlack = async () => ({ success: false, error: 'caído' });
  const result = await notifier.broadcast('hola');
  assert.equal(result.success, true);
  assert.equal(result.slack.success, false);
});

test('notifyHandoff y postReport formatean y mandan a ambos canales', async () => {
  const seen = [];
  slack.postToSlack = async (message) => { seen.push(message); return { success: true }; };
  telegram.postToTelegram = async (message) => { seen.push(message); return { success: true }; };
  await notifier.notifyHandoff('revisar');
  await notifier.postReport('todo bien', 3);
  await notifier.postMarketingReport('5 prospectos nuevos');
  assert.match(seen[0], /intervención humana/);
  assert.match(seen[2], /Informe de ventas/);
  assert.match(seen[4], /Resumen semanal de canales/);
});
