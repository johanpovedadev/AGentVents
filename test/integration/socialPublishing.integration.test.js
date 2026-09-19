const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Prueba global: ejercita el flujo completo instrucción → intención → aprobación →
 * publicación → notificación, encadenando los módulos reales (intentParser, crmAgent,
 * metaPublisher, notifier) y falseando solo la frontera externa real: el SDK de
 * Gemini y las llamadas de red (Graph API, Slack, Telegram). Las pruebas unitarias
 * de cada servicio ya cubren sus ramas de error por separado; esta prueba confirma
 * que, cableados entre sí, el resultado de punta a punta es el esperado.
 */

let nextGeminiText = '{"tipo":"publicar_post","datos":{}}';
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
process.env.FB_PAGE_ID = '111';
process.env.FB_PAGE_ACCESS_TOKEN = 'token-fb';
process.env.IG_BUSINESS_ACCOUNT_ID = '999';
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test';
process.env.HERMES_BOT_TOKEN = 'bot-token';
process.env.HERMES_CHAT_ID = 'chat-1';

for (const modulePath of [
  '../../services/intentParser',
  '../../services/crmAgent',
  '../../services/metaPublisher',
  '../../services/notifier',
  '../../services/slackNotifier',
  '../../services/telegramNotifier'
]) delete require.cache[require.resolve(modulePath)];

const { parseIntent } = require('../../services/intentParser');
const { ejecutarAccionCRM, aprobarAccionPendiente } = require('../../services/crmAgent');

/** Enruta cada fetch al backend correspondiente según la URL, como lo haría la red real. */
function routedFetch(requests) {
  return async (url, options) => {
    requests.push({ url, body: options && options.body });
    if (url.endsWith('/111/feed')) return { ok: true, status: 200, json: async () => ({ id: '111_555' }) };
    if (url.endsWith('/999/media')) return { ok: true, status: 200, json: async () => ({ id: 'container-1' }) };
    if (url.endsWith('/999/media_publish')) return { ok: true, status: 200, json: async () => ({ id: 'post-1' }) };
    if (url.startsWith('https://hooks.slack.com')) return { ok: true, status: 200, json: async () => ({}) };
    if (url.includes('api.telegram.org')) return { ok: true, status: 200, json: async () => ({}) };
    throw new Error(`URL inesperada en la prueba de integración: ${url}`);
  };
}

test('flujo completo: instrucción en lenguaje natural publica en Facebook tras aprobación y notifica a Slack y Telegram', async () => {
  process.env.AUTO_APPROVE_ACTIONS = 'false';
  const requests = [];
  global.fetch = routedFetch(requests);

  nextGeminiText = '{"tipo":"publicar_post","datos":{"canal":"facebook","texto":"Automatiza tu WhatsApp con IA","enlace":"https://lioncore.co"}}';
  const parsed = await parseIntent('publica en facebook que automatizamos WhatsApp con IA, enlaza lioncore.co');
  assert.equal(parsed.success, true);

  const pending = await ejecutarAccionCRM(parsed.data);
  assert.equal(pending.estado, 'pendiente_aprobacion');
  assert.ok(requests.some((r) => r.url.startsWith('https://hooks.slack.com')), 'debe avisar la pendiente de aprobación por Slack');
  assert.ok(requests.some((r) => r.url.includes('api.telegram.org')), 'debe avisar la pendiente de aprobación por Telegram');
  assert.ok(!requests.some((r) => r.url.endsWith('/111/feed')), 'no debe publicar antes de la aprobación humana');

  const approved = await aprobarAccionPendiente(parsed.data);
  assert.equal(approved.success, true);
  assert.equal(approved.data.id, '111_555');

  const feedRequest = requests.find((r) => r.url.endsWith('/111/feed'));
  assert.equal(feedRequest.body.get('message'), 'Automatiza tu WhatsApp con IA');
  assert.equal(feedRequest.body.get('link'), 'https://lioncore.co');
});

test('flujo completo: modo autónomo publica en Instagram sin esperar aprobación', async () => {
  process.env.AUTO_APPROVE_ACTIONS = 'true';
  const requests = [];
  global.fetch = routedFetch(requests);

  nextGeminiText = '{"tipo":"publicar_post","datos":{"canal":"instagram","texto":"Demo del bot","imagenUrl":"https://cdn.example.com/demo.jpg"}}';
  const parsed = await parseIntent('publica en instagram la demo del bot con la imagen https://cdn.example.com/demo.jpg');
  assert.equal(parsed.success, true);

  const result = await ejecutarAccionCRM(parsed.data);
  assert.equal(result.success, true);
  assert.equal(result.data.id, 'post-1');
  assert.ok(requests.some((r) => r.url.endsWith('/999/media')), 'debe crear el contenedor de medios');
  assert.ok(requests.some((r) => r.url.endsWith('/999/media_publish')), 'debe publicar el contenedor');
  assert.ok(requests.some((r) => r.url.startsWith('https://hooks.slack.com')), 'debe confirmar la publicación por Slack');
});

test('flujo completo: modo autónomo publica un carrusel de Instagram con varias imágenes', async () => {
  process.env.AUTO_APPROVE_ACTIONS = 'true';
  const requests = [];
  global.fetch = routedFetch(requests);

  nextGeminiText = '{"tipo":"publicar_post","datos":{"canal":"instagram","texto":"Antes y después del bot","imagenes":["https://cdn.example.com/1.jpg","https://cdn.example.com/2.jpg","https://cdn.example.com/3.jpg"]}}';
  const parsed = await parseIntent('publica un carrusel en instagram con estas tres imágenes');
  assert.equal(parsed.success, true);

  const result = await ejecutarAccionCRM(parsed.data);
  assert.equal(result.success, true);
  assert.equal(result.data.id, 'post-1');

  const mediaRequests = requests.filter((r) => r.url.endsWith('/999/media'));
  assert.equal(mediaRequests.length, 4, '3 contenedores hijo + 1 contenedor padre del carrusel');
  assert.ok(requests.some((r) => r.url.endsWith('/999/media_publish')), 'debe publicar el contenedor del carrusel');
});

test('flujo completo: un canal no soportado se notifica como error sin llamar a la Graph API', async () => {
  process.env.AUTO_APPROVE_ACTIONS = 'true';
  const requests = [];
  global.fetch = routedFetch(requests);

  nextGeminiText = '{"tipo":"publicar_post","datos":{"canal":"tiktok","texto":"no soportado"}}';
  const parsed = await parseIntent('publica en tiktok algo');
  const result = await ejecutarAccionCRM(parsed.data);

  assert.equal(result.success, false);
  assert.match(result.error, /Canal no soportado/);
  assert.ok(!requests.some((r) => r.url.includes('graph.facebook.com')), 'no debe tocar la Graph API para un canal inválido');
  assert.ok(requests.some((r) => r.url.startsWith('https://hooks.slack.com')), 'debe notificar el error por Slack');
});
