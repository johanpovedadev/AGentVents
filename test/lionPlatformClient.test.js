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

test('createProspect manda los campos opcionales del importador de chats', async () => {
  const client = freshClient();
  let body;
  global.fetch = async (url, options) => {
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 't' }) };
    body = JSON.parse(options.body);
    return { ok: true, status: 201, json: async () => ({ id: 1 }) };
  };
  await client.createProspect({ nombre: 'Kate', telefono: '57321', fuente: 'otro', canal: 'WHATSAPP', resumen: 'Termales', siguientePaso: 'Escribir', ciudad: 'Bogotá', temperatura: 'warm' });
  assert.deepEqual(body, { businessName: 'Kate', phone: '57321', source: 'OTRO', priorityReason: 'Termales', contactChannel: 'WHATSAPP', nextStep: 'Escribir', city: 'Bogotá', temperature: 'WARM' });
  await client.createProspect({ nombre: 'Ana', temperatura: 'tibio' });
  assert.equal(body.temperature, undefined, 'una temperatura desconocida no se manda');
});

test('recordMessages y updateNextAction llaman a sus rutas', async () => {
  const client = freshClient();
  const calls = [];
  global.fetch = async (url, options) => {
    if (url.endsWith('/auth/login')) return { ok: true, status: 200, json: async () => ({ token: 't' }) };
    calls.push({ url, method: options.method, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ saved: 1 }) };
  };
  await client.recordMessages(7, [{ direction: 'INBOUND', body: 'hola', sentAt: '2026-11-10T16:35:00.000Z' }]);
  await client.updateNextAction(7, 'Llamar', '2026-11-16');
  assert.match(calls[0].url, /\/prospects\/7\/messages$/);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body.messages.length, 1);
  assert.match(calls[1].url, /\/prospects\/7\/next-action$/);
  assert.equal(calls[1].method, 'PATCH');
  assert.deepEqual(calls[1].body, { nextStep: 'Llamar', nextActionDate: '2026-11-16' });
});
