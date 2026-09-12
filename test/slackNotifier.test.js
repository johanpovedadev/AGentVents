const test = require('node:test');
const assert = require('node:assert/strict');
const notifier = require('../services/slackNotifier');

test('postToSlack envía el texto al webhook', async () => {
  process.env.SLACK_WEBHOOK_URL = 'https://slack.test/webhook';
  global.fetch = async (url, options) => {
    assert.equal(url, process.env.SLACK_WEBHOOK_URL);
    assert.deepEqual(JSON.parse(options.body), { text: 'hola' });
    return { ok: true, status: 200 };
  };
  assert.deepEqual(await notifier.postToSlack('hola'), { success: true });
});

test('postToSlack maneja configuración, respuesta y red inválidas', async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  assert.match((await notifier.postToSlack('hola')).error, /SLACK_WEBHOOK_URL/);
  process.env.SLACK_WEBHOOK_URL = 'https://slack.test/webhook';
  global.fetch = async () => ({ ok: false, status: 500 });
  assert.match((await notifier.postToSlack('hola')).error, /500/);
  global.fetch = async () => { throw new Error('caído'); };
  assert.match((await notifier.postToSlack('hola')).error, /caído/);
});

test('helpers formatean handoff e informe', async () => {
  process.env.SLACK_WEBHOOK_URL = 'https://slack.test/webhook';
  const messages = [];
  global.fetch = async (url, options) => { messages.push(JSON.parse(options.body).text); return { ok: true, status: 200 }; };
  await notifier.notifyHandoff('revisar');
  await notifier.postReport('todo bien');
  assert.match(messages[0], /intervención humana/);
  assert.match(messages[1], /Informe de ventas/);
});
