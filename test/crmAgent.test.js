const test = require('node:test');
const assert = require('node:assert/strict');
const hubspot = require('../services/hubspotClient');
const slack = require('../services/slackNotifier');
const report = require('../services/reportService');
const { ejecutarAccionCRM, aprobarAccionPendiente } = require('../services/crmAgent');

let messages;
test.beforeEach(() => {
  process.env.AUTO_APPROVE_ACTIONS = 'true';
  messages = [];
  slack.postToSlack = async (message) => { messages.push(message); return { success: true }; };
  slack.postReport = async (message) => { messages.push(message); return { success: true }; };
  hubspot.createContact = async () => ({ success: true, data: { id: '1' } });
  hubspot.createDeal = async () => ({ success: true, data: { id: '2' } });
  hubspot.updateDealStage = async () => ({ success: true, data: { id: '3' } });
  hubspot.updateContact = async () => ({ success: true, data: { id: '4' } });
  report.generateSalesReport = async () => ({ success: true, data: 'Informe listo' });
});

test('ejecuta las cuatro operaciones CRM y las notifica', async () => {
  for (const intencion of [
    { tipo: 'crear_contacto', datos: { firstname: 'Ana' } },
    { tipo: 'crear_deal', datos: { dealname: 'Plan', contactId: '1' } },
    { tipo: 'actualizar_deal', datos: { dealId: '2', dealstage: 'closedwon' } },
    { tipo: 'actualizar_contacto', datos: { contactId: '1', propiedades: { phone: '300' } } }
  ]) assert.equal((await ejecutarAccionCRM(intencion)).success, true);
  assert.equal(messages.length, 4);
  assert.match(messages[0], /Contacto creado/);
});

test('genera informe y lo publica en Slack', async () => {
  const result = await ejecutarAccionCRM({ tipo: 'generar_informe', datos: {} });
  assert.equal(result.data, 'Informe listo');
  assert.deepEqual(messages, ['Informe listo']);
});

test('notifica fallos y valida intenciones inválidas', async () => {
  hubspot.createContact = async () => ({ success: false, error: 'duplicado' });
  assert.equal((await ejecutarAccionCRM({ tipo: 'crear_contacto', datos: {} })).success, false);
  assert.match(messages[0], /duplicado/);
  assert.equal((await ejecutarAccionCRM({ tipo: 'desconocido', datos: {} })).success, false);
  assert.equal((await ejecutarAccionCRM()).success, false);
});

test('deja la acción pendiente y permite ejecutarla tras aprobación humana', async () => {
  process.env.AUTO_APPROVE_ACTIONS = 'false';
  const intencion = { tipo: 'crear_contacto', datos: { firstname: 'Ana' } };
  const pending = await ejecutarAccionCRM(intencion);
  assert.equal(pending.estado, 'pendiente_aprobacion');
  assert.match(messages[0], /Acción pendiente de aprobación/);

  const approved = await aprobarAccionPendiente(intencion);
  assert.equal(approved.success, true);
  assert.match(messages[1], /Contacto creado/);
});
