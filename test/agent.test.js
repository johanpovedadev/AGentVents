const test = require('node:test');
const assert = require('node:assert/strict');
const lionPlatform = require('../services/lionPlatformClient');
const marketingReport = require('../services/marketingReportService');
const metaPublisher = require('../services/metaPublisher');
const notifier = require('../services/notifier');
const salesReport = require('../services/salesReportService');
const socialReport = require('../services/social/socialReportService');
const { ejecutarAccion, aprobarAccionPendiente } = require('../services/agent');

let messages;
test.beforeEach(() => {
  process.env.AUTO_APPROVE_ACTIONS = 'true';
  messages = [];
  const capture = async (message) => { messages.push(message); return { success: true }; };
  notifier.broadcast = capture;
  notifier.postReport = capture;
  notifier.postMarketingReport = capture;
  notifier.postFunnelHealthReport = capture;
  notifier.postSocialReport = capture;
  lionPlatform.createProspect = async () => ({ success: true, data: { id: '592' } });
  salesReport.generateSalesReport = async () => ({ success: true, data: 'Informe listo', elapsedSeconds: 1 });
  metaPublisher.publish = async () => ({ success: true, data: { id: 'post-1' } });
  marketingReport.generateWeeklyMarketingReport = async () => ({ success: true, data: '3 prospectos nuevos', totalNuevos: 3 });
  marketingReport.generateFunnelHealthReport = async () => ({ success: true, data: 'Todo en orden' });
  socialReport.generateSocialReport = async () => ({ success: true, data: 'Redes al día' });
});

test('crear_prospecto crea el prospecto en Lion Platform y lo notifica', async () => {
  const result = await ejecutarAccion({ tipo: 'crear_prospecto', datos: { nombre: 'Ana', fuente: 'INSTAGRAM' } });
  assert.equal(result.success, true);
  assert.match(messages[0], /Prospecto creado en Lion Platform \(ID: 592\)/);
  assert.match(messages[0], /modo autónomo/);
});

test('crear_prospecto pide aprobación por defecto y se ejecuta al aprobarla', async () => {
  process.env.AUTO_APPROVE_ACTIONS = 'false';
  const intencion = { tipo: 'crear_prospecto', datos: { nombre: 'Ana', contacto: { telefono: '300' } } };
  const pending = await ejecutarAccion(intencion);
  assert.equal(pending.estado, 'pendiente_aprobacion');
  assert.match(messages[0], /pendiente de aprobación[\s\S]*telefono: 300/);

  const approved = await aprobarAccionPendiente(intencion);
  assert.equal(approved.success, true);
  assert.match(messages[1], /Prospecto creado/);
  assert.doesNotMatch(messages[1], /modo autónomo/);
});

test('los informes corren sin aprobación y salen por su formateador', async () => {
  process.env.AUTO_APPROVE_ACTIONS = 'false';
  for (const tipo of ['generar_informe', 'informe_marketing', 'acciones_embudo', 'informe_redes']) {
    assert.equal((await ejecutarAccion({ tipo, datos: {} })).success, true);
  }
  assert.deepEqual(messages, ['Informe listo', '3 prospectos nuevos', 'Todo en orden', 'Redes al día']);
});

test('informe_redes recibe los datos de la intención (días, tenant)', async () => {
  let received;
  socialReport.generateSocialReport = async (datos) => { received = datos; return { success: true, data: 'ok' }; };
  await ejecutarAccion({ tipo: 'informe_redes', datos: { dias: 14 } });
  assert.deepEqual(received, { dias: 14 });
});

test('publicar_post llama al canal indicado y notifica el resultado', async () => {
  let received;
  metaPublisher.publish = async (canal, datos) => { received = { canal, datos }; return { success: true, data: { id: 'post-1' } }; };
  const datos = { canal: 'instagram', texto: 'Demo del bot', imagenUrl: 'https://cdn.example.com/a.jpg' };
  const result = await ejecutarAccion({ tipo: 'publicar_post', datos });
  assert.equal(result.success, true);
  assert.deepEqual(received, { canal: 'instagram', datos });
  assert.match(messages[0], /Post publicado en instagram/);
});

test('un fallo de cualquier servicio se notifica como error', async () => {
  socialReport.generateSocialReport = async () => ({ success: false, error: 'sin licencia SOCIAL' });
  const result = await ejecutarAccion({ tipo: 'informe_redes', datos: {} });
  assert.equal(result.success, false);
  assert.match(messages[0], /Error al Informe de redes generado: sin licencia SOCIAL/);
});

test('valida intenciones inválidas', async () => {
  assert.equal((await ejecutarAccion({ tipo: 'desconocido', datos: {} })).success, false);
  assert.match(messages[0], /no soportado/);
  assert.equal((await ejecutarAccion()).success, false);
  assert.equal((await aprobarAccionPendiente({ tipo: 'publicar_post' })).success, false);
});
