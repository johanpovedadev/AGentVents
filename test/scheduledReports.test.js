const test = require('node:test');
const assert = require('node:assert/strict');
const { runScheduledReport, REPORTS } = require('../services/scheduledReports');

function fakeAgent(result) {
  const calls = [];
  return { calls, ejecutarAccion: async (intencion) => { calls.push(intencion); return result; } };
}

test('seguimientos corre las acciones del embudo (seguimientos vencidos)', async () => {
  const agent = fakeAgent({ success: true, data: 'ok' });
  const result = await runScheduledReport('seguimientos', agent);
  assert.deepEqual(result, { success: true });
  assert.deepEqual(agent.calls, [{ tipo: 'acciones_embudo', datos: {} }]);
});

test('ventas y marketing corren sus informes', async () => {
  const agent = fakeAgent({ success: true });
  await runScheduledReport('ventas', agent);
  await runScheduledReport('marketing', agent);
  assert.deepEqual(agent.calls.map((c) => c.tipo), ['generar_informe', 'informe_marketing']);
});

test('solo hay informes programables: nada que cree o publique', () => {
  for (const tipo of Object.values(REPORTS)) {
    assert.ok(!['crear_prospecto', 'publicar_post'].includes(tipo), tipo);
  }
});

test('un nombre desconocido no llama al agente', async () => {
  const agent = fakeAgent({ success: true });
  const result = await runScheduledReport('publicar', agent);
  assert.equal(result.success, false);
  assert.match(result.error, /seguimientos, ventas, marketing/);
  assert.equal(agent.calls.length, 0);
});

test('si el informe falla devuelve el error', async () => {
  assert.deepEqual(await runScheduledReport('ventas', fakeAgent({ success: false, error: 'Lion caído' })), { success: false, error: 'Lion caído' });
  assert.deepEqual(await runScheduledReport('ventas', fakeAgent(undefined)), { success: false, error: 'sin detalle' });
});
