const test = require('node:test');
const assert = require('node:assert/strict');

const client = require('../services/hubspotClient');

function mockResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test.beforeEach(() => {
  process.env.HUBSPOT_ACCESS_TOKEN = 'token-prueba';
});

test('createContact crea el contacto con las propiedades recibidas', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.hubapi.com/crm/v3/objects/contacts');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { properties: { firstname: 'Ana', phone: '3001' } });
    return mockResponse(201, { id: '10' });
  };
  assert.deepEqual(await client.createContact({ firstname: 'Ana', phone: '3001' }), { success: true, data: { id: '10' } });
});

test('createContact valida que existan propiedades', async () => {
  assert.equal((await client.createContact({})).success, false);
});

test('createDeal crea el deal con asociación al contacto', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.hubapi.com/crm/v3/objects/deals');
    const payload = JSON.parse(options.body);
    assert.equal(payload.associations[0].to.id, '15');
    assert.equal(payload.properties.dealname, 'Plan');
    return mockResponse(201, { id: '20' });
  };
  assert.equal((await client.createDeal({ contactId: 15, dealname: 'Plan', amount: 500 })).data.id, '20');
});

test('createDeal valida contacto y nombre', async () => {
  assert.match((await client.createDeal({ dealname: 'Plan' })).error, /contactId/);
  assert.match((await client.createDeal({ contactId: '1' })).error, /dealname/);
});

test('actualiza contacto y etapa de deal', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return mockResponse(200, { id: '1' });
  };
  assert.equal((await client.updateContact('1', { email: 'a@b.co' })).success, true);
  assert.equal((await client.updateDealStage('2', 'closedwon')).success, true);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(calls[1].url.endsWith('/deals/2'), true);
});

test('valida entradas de actualizaciones y búsqueda', async () => {
  assert.equal((await client.updateContact()).success, false);
  assert.equal((await client.updateDealStage()).success, false);
  assert.equal((await client.searchContactByPhone()).success, false);
});

test('consulta deals y contactos por teléfono', async () => {
  global.fetch = async (url, options) => {
    if (url.includes('/search')) {
      assert.equal(options.method, 'POST');
      return mockResponse(200, { results: [{ id: '9' }] });
    }
    return mockResponse(200, { results: [{ id: '8' }] });
  };
  assert.equal((await client.getDeals()).data.results[0].id, '8');
  assert.equal((await client.searchContactByPhone('3001')).data.results[0].id, '9');
});

test('devuelve errores claros de HubSpot, red y credenciales', async () => {
  global.fetch = async () => mockResponse(400, { message: 'Dato inválido' });
  assert.match((await client.getDeals()).error, /400: Dato inválido/);
  global.fetch = async () => { throw new Error('sin red'); };
  assert.match((await client.getDeals()).error, /sin red/);
  delete process.env.HUBSPOT_ACCESS_TOKEN;
  assert.match((await client.getDeals()).error, /HUBSPOT_ACCESS_TOKEN/);
});
