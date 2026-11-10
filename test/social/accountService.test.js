const test = require('node:test');
const assert = require('node:assert/strict');
const { addAccount, MAX_COMPETITORS } = require('../../services/social/accountService');
const { createFakeDb } = require('./fakeDb');

const licensed = async () => ({ success: true });
const okConnector = { fetchAccount: async () => ({ account: { externalId: '777', followers: 52000, mediaCount: 3 }, media: [{}, {}] }) };

test('registra un competidor tras validar licencia y que la cuenta existe', async () => {
  const db = createFakeDb([[/count\(\*\)/, [{ total: 2 }]]]);
  const result = await addAccount(
    { tenantId: 1, platform: 'Instagram', handle: '@ViajeroX', isCompetitor: true },
    { db, connectors: { instagram: okConnector }, requireProduct: licensed }
  );
  assert.equal(result.success, true);
  assert.deepEqual(result.data, { id: 101, followers: 52000, publicaciones: 2 });
  const insert = db.calls.find((c) => /INSERT INTO social\.account/.test(c.sql));
  assert.deepEqual(insert.params, [1, 'instagram', 'viajerox', '777', true]);
});

test('rechaza sin licencia SOCIAL, sin datos o con red no soportada', async () => {
  const db = createFakeDb();
  const deps = { db, connectors: { instagram: okConnector }, requireProduct: async () => ({ success: false, error: 'El tenant 2 no tiene licencia activa de SOCIAL.' }) };
  assert.match((await addAccount({ tenantId: 2, platform: 'instagram', handle: 'x' }, deps)).error, /licencia activa de SOCIAL/);
  assert.match((await addAccount({ platform: 'instagram', handle: 'x' }, deps)).error, /tenant y usuario/);
  assert.match((await addAccount({ tenantId: 1, platform: 'tiktok', handle: 'x' }, deps)).error, /no soportada/);
  assert.equal(db.count(/INSERT/), 0);
});

test('respeta el tope de competidores y avisa si la cuenta no se puede consultar', async () => {
  const full = createFakeDb([[/count\(\*\)/, [{ total: MAX_COMPETITORS }]]]);
  const deps = { db: full, connectors: { instagram: okConnector }, requireProduct: licensed };
  assert.match((await addAccount({ tenantId: 1, platform: 'instagram', handle: 'x', isCompetitor: true }, deps)).error, /Máximo 10/);

  const db = createFakeDb();
  const broken = { fetchAccount: async () => { throw new Error('debe ser una cuenta Business o Creator'); } };
  const result = await addAccount({ tenantId: 1, platform: 'instagram', handle: 'personal' }, { db, connectors: { instagram: broken }, requireProduct: licensed });
  assert.match(result.error, /No se pudo validar @personal en instagram: debe ser una cuenta Business o Creator/);
  assert.equal(db.count(/INSERT/), 0);
});
