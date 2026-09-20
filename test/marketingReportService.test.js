const test = require('node:test');
const assert = require('node:assert/strict');
const lionPlatform = require('../services/lionPlatformClient');
const { generateWeeklyMarketingReport, generateFunnelHealthReport } = require('../services/marketingReportService');

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function dateOffset(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

test('generateFunnelHealthReport detecta seguimientos vencidos, ignorando etapas terminales', async () => {
  lionPlatform.listProspects = async () => ({
    success: true,
    data: [
      { id: '1', businessName: 'Panadería Sol', stage: 'CONTACTADO', nextActionDate: dateOffset(-2) },
      { id: '2', businessName: 'Aún no vence', stage: 'DEMO_AGENDADA', nextActionDate: dateOffset(3) },
      { id: '3', businessName: 'Cliente ya cerrado', stage: 'CLIENTE_ACTIVO', nextActionDate: dateOffset(-10) },
      { id: '4', businessName: 'Perdido viejo', stage: 'PERDIDO', nextActionDate: dateOffset(-10) }
    ]
  });

  const result = await generateFunnelHealthReport();
  assert.equal(result.success, true);
  assert.equal(result.counts.vencidos, 1);
  assert.match(result.data, /1 seguimiento\(s\) vencido\(s\)/);
  assert.match(result.data, /Panadería Sol/);
  assert.doesNotMatch(result.data, /Cliente ya cerrado/);
  assert.doesNotMatch(result.data, /Perdido viejo/);
});

test('generateFunnelHealthReport detecta prospectos estancados por inactividad', async () => {
  lionPlatform.listProspects = async () => ({
    success: true,
    data: [
      { id: '1', businessName: 'Sin contacto hace rato', stage: 'CONTACTADO', lastInteractionAt: daysAgo(15) },
      { id: '2', businessName: 'Contacto reciente', stage: 'CONTACTADO', lastInteractionAt: daysAgo(2) },
      { id: '3', businessName: 'Sin fecha registrada', stage: 'CONTACTADO', lastInteractionAt: null }
    ]
  });

  const result = await generateFunnelHealthReport();
  assert.equal(result.counts.estancados, 1);
  assert.match(result.data, /Sin contacto hace rato/);
  assert.doesNotMatch(result.data, /Contacto reciente/);
  assert.doesNotMatch(result.data, /Sin fecha registrada/);
});

test('generateFunnelHealthReport marca riesgo de retención por pago atrasado', async () => {
  lionPlatform.listProspects = async () => ({
    success: true,
    data: [
      { id: '1', businessName: 'Debe el mes', stage: 'CLIENTE_ACTIVO', paymentStatus: 'VENCIDO', tags: [] },
      { id: '2', businessName: 'Al día', stage: 'CLIENTE_ACTIVO', paymentStatus: 'AL_DIA', tags: ['testimonio'] }
    ]
  });

  const result = await generateFunnelHealthReport();
  assert.equal(result.counts.pagoAtrasado, 1);
  assert.match(result.data, /Debe el mes/);
  assert.match(result.data, /riesgo de retención/);
});

test('generateFunnelHealthReport sugiere pedir reseña solo a clientes sanos sin testimonio', async () => {
  lionPlatform.listProspects = async () => ({
    success: true,
    data: [
      { id: '1', businessName: 'Cliente feliz', stage: 'CLIENTE_ACTIVO', paymentStatus: 'AL_DIA', tags: [] },
      { id: '2', businessName: 'Ya dio testimonio', stage: 'CLIENTE_ACTIVO', paymentStatus: 'AL_DIA', tags: ['testimonio'] },
      { id: '3', businessName: 'Debe plata', stage: 'CLIENTE_ACTIVO', paymentStatus: 'VENCIDO', tags: [] }
    ]
  });

  const result = await generateFunnelHealthReport();
  assert.equal(result.counts.clientesSanos, 1);
  assert.match(result.data, /Cliente feliz/);
  assert.doesNotMatch(result.data, /Ya dio testimonio/);
});

test('generateFunnelHealthReport no revienta con listas largas — corta en 8 y resume el resto', async () => {
  const data = Array.from({ length: 12 }, (_, i) => (
    { id: String(i), businessName: `Negocio ${i}`, stage: 'CONTACTADO', nextActionDate: dateOffset(-1) }
  ));
  lionPlatform.listProspects = async () => ({ success: true, data });

  const result = await generateFunnelHealthReport();
  assert.equal(result.counts.vencidos, 12);
  assert.match(result.data, /…y 4 más/);
});

test('generateFunnelHealthReport reporta todo en verde sin nada pendiente', async () => {
  lionPlatform.listProspects = async () => ({ success: true, data: [] });
  const result = await generateFunnelHealthReport();
  assert.equal(result.success, true);
  assert.match(result.data, /Sin seguimientos vencidos/);
  assert.match(result.data, /Sin prospectos estancados/);
  assert.match(result.data, /Sin clientes con pago atrasado/);
});

test('generateFunnelHealthReport propaga un fallo de Lion Platform sin lanzar', async () => {
  lionPlatform.listProspects = async () => ({ success: false, error: 'backend caído' });
  const result = await generateFunnelHealthReport();
  assert.equal(result.success, false);
  assert.equal(result.error, 'backend caído');
});
