const test = require('node:test');
const assert = require('node:assert/strict');

const MODULE_PATH = require.resolve('../services/lionPlatformClient');

/** Cada test necesita su propio JWT cacheado, así que se recarga el módulo. */
function freshClient() {
  delete require.cache[MODULE_PATH];
  return require('../services/lionPlatformClient');
}

test('createProspect inicia sesión, cachea el JWT y crea el prospecto', async () => {
  const client = freshClient();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(url);
    if (url.endsWith('/auth/login')) {
      return { ok: true, status: 200, json: async () => ({ token: 'jwt-de-prueba' }) };
    }
    assert.equal(options.headers.Authorization, 'Bearer jwt-de-prueba');
    assert.deepEqual(JSON.parse(options.body), { businessName: 'Ana', phone: '3001234567', source: 'INSTAGRAM' });
    return { ok: true, status: 201, json: async () => ({ id: '592' }) };
  };
  const result = await client.createProspect({ nombre: 'Ana', telefono: '3001234567', fuente: 'instagram' });
  assert.deepEqual(result, { success: true, data: { id: '592' } });

  // Segunda llamada: no debe volver a loguearse, el JWT ya está cacheado.
  await client.createProspect({ nombre: 'Bea' });
  assert.equal(calls.filter((url) => url.endsWith('/auth/login')).length, 1);
});

test('createProspect exige nombre o telefono', async () => {
  const client = freshClient();
  const result = await client.createProspect({});
  assert.equal(result.success, false);
  assert.match(result.error, /nombre o telefono/);
});

test('createProspect reporta un login fallido', async () => {
  const client = freshClient();
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const result = await client.createProspect({ nombre: 'Ana' });
  assert.equal(result.success, false);
  assert.match(result.error, /No fue posible conectar con Lion Platform/);
});

test('listProspects devuelve el listado del tenant autenticado', async () => {
  const client = freshClient();
  global.fetch = async (url) => {
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 'jwt' }) };
    assert.ok(url.endsWith('/prospects'));
    return { ok: true, status: 200, json: async () => ([{ id: '1', source: 'INSTAGRAM' }]) };
  };
  const result = await client.listProspects();
  assert.deepEqual(result, { success: true, data: [{ id: '1', source: 'INSTAGRAM' }] });
});

test('createProspect reporta un error de Lion Platform tras loguearse', async () => {
  const client = freshClient();
  global.fetch = async (url) => {
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 'jwt' }) };
    return { ok: false, status: 500, json: async () => ({ message: 'error interno' }) };
  };
  const result = await client.createProspect({ nombre: 'Ana' });
  assert.equal(result.success, false);
  assert.match(result.error, /error interno/);
});

test('createProspect usa el teléfono como nombre y guarda una fuente desconocida como OTRO', async () => {
  const client = freshClient();
  global.fetch = async (url, options) => {
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 'jwt' }) };
    assert.deepEqual(JSON.parse(options.body), { businessName: '3001112233', phone: '3001112233', source: 'OTRO' });
    return { ok: true, status: 201, json: async () => ({ id: '9' }) };
  };
  const result = await client.createProspect({ telefono: 3001112233, fuente: 'tiktok' });
  assert.equal(result.success, true);
});

test('listTenants consulta los tenants con sus productos (solo SUPER_ADMIN)', async () => {
  const client = freshClient();
  global.fetch = async (url) => {
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 'jwt' }) };
    assert.ok(url.endsWith('/admin/tenants'));
    return { ok: true, status: 200, json: async () => ([{ id: '1', status: 'ACTIVE', products: ['CRM', 'SOCIAL'] }]) };
  };
  const result = await client.listTenants();
  assert.equal(result.data[0].products[1], 'SOCIAL');
});
