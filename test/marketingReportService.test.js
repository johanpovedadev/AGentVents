const test = require('node:test');
const assert = require('node:assert/strict');
const lionPlatform = require('../services/lionPlatformClient');
const { generateWeeklyMarketingReport } = require('../services/marketingReportService');

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

test('agrupa por fuente solo los prospectos creados en los últimos 7 días', async () => {
  lionPlatform.listProspects = async () => ({
    success: true,
    data: [
      { id: '1', source: 'INSTAGRAM', createdAt: daysAgo(1) },
      { id: '2', source: 'INSTAGRAM', createdAt: daysAgo(3) },
      { id: '3', source: 'MARKETPLACE', createdAt: daysAgo(6) },
      { id: '4', source: 'MARKETPLACE', createdAt: daysAgo(10) }, // fuera de la ventana
      { id: '5', source: 'GOOGLE_MAPS', createdAt: null } // sin fecha, nunca cuenta como nuevo
    ]
  });

  const result = await generateWeeklyMarketingReport();
  assert.equal(result.success, true);
  assert.equal(result.totalNuevos, 3);
  assert.match(result.data, /3 prospectos nuevos en los últimos 7 días/);
  assert.match(result.data, /Instagram: 2/);
  assert.match(result.data, /Marketplace: 1/);
  assert.doesNotMatch(result.data, /Google Maps/);
});

test('agrupa prospectos sin fuente registrada bajo un rótulo legible', async () => {
  lionPlatform.listProspects = async () => ({
    success: true,
    data: [{ id: '1', source: null, createdAt: daysAgo(1) }]
  });

  const result = await generateWeeklyMarketingReport();
  assert.match(result.data, /Sin fuente registrada: 1/);
});

test('reporta cero prospectos nuevos sin fallar', async () => {
  lionPlatform.listProspects = async () => ({ success: true, data: [] });
  const result = await generateWeeklyMarketingReport();
  assert.equal(result.success, true);
  assert.equal(result.totalNuevos, 0);
  assert.match(result.data, /No se registraron prospectos nuevos/);
});

test('propaga un fallo de Lion Platform sin lanzar', async () => {
  lionPlatform.listProspects = async () => ({ success: false, error: 'backend caído' });
  const result = await generateWeeklyMarketingReport();
  assert.equal(result.success, false);
  assert.equal(result.error, 'backend caído');
});
