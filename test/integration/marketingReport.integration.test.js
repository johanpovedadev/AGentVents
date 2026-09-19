const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Prueba global: instrucción en lenguaje natural → intención → Lion Platform →
 * resumen semanal → Slack/Telegram, encadenando los módulos reales. Solo se
 * falsea el SDK de Gemini y la red externa (login de Lion Platform, listado de
 * prospectos, webhooks de notificación).
 */

let nextGeminiText = '{"tipo":"informe_marketing","datos":{}}';
const geminiPath = require.resolve('@google/generative-ai');
require.cache[geminiPath] = {
  id: geminiPath,
  filename: geminiPath,
  loaded: true,
  exports: {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return { generateContent: async () => ({ response: { text: () => nextGeminiText } }) };
      }
    }
  }
};

process.env.GEMINI_API_KEY = 'clave-de-prueba';
process.env.LION_PLATFORM_BASE_URL = 'https://lion.test/api/v1';
process.env.LION_EMAIL = 'super@lionplatform.com';
process.env.LION_PASSWORD = 'password123';
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test';
process.env.HERMES_BOT_TOKEN = 'bot-token';
process.env.HERMES_CHAT_ID = 'chat-1';
process.env.AUTO_APPROVE_ACTIONS = 'true';

for (const modulePath of [
  '../../services/intentParser',
  '../../services/crmAgent',
  '../../services/marketingReportService',
  '../../services/lionPlatformClient',
  '../../services/notifier',
  '../../services/slackNotifier',
  '../../services/telegramNotifier'
]) delete require.cache[require.resolve(modulePath)];

const { parseIntent } = require('../../services/intentParser');
const { ejecutarAccionCRM } = require('../../services/crmAgent');

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

test('flujo completo: informe_marketing lee Lion Platform y notifica el resumen por canal', async () => {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push(url);
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 'jwt-de-prueba' }) };
    if (url.endsWith('/prospects')) {
      return {
        ok: true,
        status: 200,
        json: async () => ([
          { id: '1', source: 'INSTAGRAM', createdAt: daysAgo(1) },
          { id: '2', source: 'INSTAGRAM', createdAt: daysAgo(2) },
          { id: '3', source: 'MARKETPLACE', createdAt: daysAgo(30) }
        ])
      };
    }
    if (url.startsWith('https://hooks.slack.com')) return { ok: true, status: 200, json: async () => ({}) };
    if (url.includes('api.telegram.org')) return { ok: true, status: 200, json: async () => ({}) };
    throw new Error(`URL inesperada en la prueba de integración: ${url}`);
  };

  const parsed = await parseIntent('dame el resumen semanal de canales');
  assert.equal(parsed.success, true);

  const result = await ejecutarAccionCRM(parsed.data);
  assert.equal(result.success, true);
  assert.equal(result.totalNuevos, 2);
  assert.match(result.data, /Instagram: 2/);
  assert.ok(!result.data.includes('Marketplace'), 'el prospecto de hace 30 días no debe contar como nuevo');

  assert.ok(requests.some((u) => u.endsWith('/prospects')), 'debe consultar Lion Platform');
  assert.ok(requests.some((u) => u.startsWith('https://hooks.slack.com')), 'debe notificar el resumen por Slack');
  assert.ok(requests.some((u) => u.includes('api.telegram.org')), 'debe notificar el resumen por Telegram');
});
