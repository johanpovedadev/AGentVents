const test = require('node:test');
const assert = require('node:assert/strict');
const { collect, formatSummary, shouldSnapshot, isoDay } = require('../../services/social/collector');
const { createFakeDb } = require('./fakeDb');

const TODAY = new Date('2026-10-13T06:17:00Z'); // martes

function licenses(map) {
  const data = new Map(Object.entries(map).map(([id, products]) => [id, { id, active: products !== 'SUSPENDED', products: new Set(products === 'SUSPENDED' ? ['SOCIAL'] : products) }]));
  return async () => ({ success: true, data });
}

const ACCOUNTS = [
  { id: 1, tenant_id: 1, platform: 'instagram', handle: 'rutadeviajelion', is_competitor: false },
  { id: 2, tenant_id: 1, platform: 'youtube', handle: 'competidor', is_competitor: true },
  { id: 3, tenant_id: 2, platform: 'instagram', handle: 'heladeria', is_competitor: false },
  { id: 4, tenant_id: 3, platform: 'instagram', handle: 'moroso', is_competitor: false },
  { id: 5, tenant_id: 1, platform: 'tiktok', handle: 'tt', is_competitor: false }
];

function media(id, publishedAt, views) {
  return { platformMediaId: id, mediaType: 'REELS', caption: 'c', publishedAt, durationS: null, permalink: null, metrics: { views, likes: 1, comments: null, shares: null, saves: null, reach: null, avgWatchS: null, skipRate: null } };
}

test('procesa solo tenants con licencia SOCIAL activa y guarda la foto del día', async () => {
  const db = createFakeDb([[/FROM social\.account WHERE active/, ACCOUNTS]]);
  const fetched = [];
  const connector = {
    fetchAccount: async (account) => {
      fetched.push(account.handle);
      return { account: { externalId: 'ext', followers: 4000, mediaCount: 2 }, media: [media('a', '2026-10-12T00:00:00Z', 500), media('b', '2026-01-01T00:00:00Z', 10)] };
    }
  };
  const result = await collect({
    db,
    connectors: { instagram: connector, youtube: connector },
    loadLicenses: licenses({ 1: ['CRM', 'SOCIAL'], 2: ['BOT'], 3: 'SUSPENDED' })
  }, TODAY);

  assert.equal(result.success, true);
  assert.deepEqual(fetched, ['rutadeviajelion', 'competidor'], 'ni el tenant sin SOCIAL ni el suspendido tocan la red');
  assert.equal(result.summary.procesadas, 2);
  assert.equal(result.summary.fotos, 2, 'la publicación vieja no se fotografía un martes');
  assert.deepEqual(result.summary.omitidas.map((o) => o.motivo), ['sin licencia SOCIAL activa', 'sin licencia SOCIAL activa', 'red sin conector todavía']);
  const snapshot = db.calls.find((c) => /INSERT INTO social\.account_snapshot/.test(c.sql));
  assert.deepEqual(snapshot.params, [1, '2026-10-13', 4000, 2]);
  assert.ok(db.calls.some((c) => /ON CONFLICT \(media_id, day\)/.test(c.sql)), 'idempotente: upsert por día');
  const finish = db.calls.at(-1);
  assert.equal(finish.params[1], 'OK');
});

test('un error en una cuenta no frena a las demás y queda como PARTIAL', async () => {
  const db = createFakeDb([[/FROM social\.account WHERE active/, ACCOUNTS.slice(0, 2)]]);
  const result = await collect({
    db,
    connectors: {
      instagram: { fetchAccount: async () => { throw new Error('token vencido'); } },
      youtube: { fetchAccount: async () => ({ account: { externalId: 'UC', followers: 1, mediaCount: 0 }, media: [] }) }
    },
    loadLicenses: licenses({ 1: ['SOCIAL'] })
  }, TODAY);
  assert.equal(result.summary.procesadas, 1);
  assert.match(result.summary.errores[0].error, /token vencido/);
  assert.equal(db.calls.at(-1).params[1], 'PARTIAL');
  assert.match(formatSummary(result), /⚠️ instagram @rutadeviajelion \(tenant 1\): token vencido/);
});

test('si no se pueden verificar licencias no procesa a nadie (falla cerrado)', async () => {
  const db = createFakeDb();
  const result = await collect({
    db,
    connectors: {},
    loadLicenses: async () => ({ success: false, error: 'Lion Platform caído' })
  }, TODAY);
  assert.equal(result.success, false);
  assert.equal(db.count(/FROM social\.account WHERE active/), 0);
  assert.match(db.calls.at(-1).sql, /status = 'FAILED'/);
  assert.match(formatSummary(result), /general: Lion Platform caído/);
});

test('shouldSnapshot: diario los primeros 30 días, después solo los lunes', () => {
  assert.equal(shouldSnapshot('2026-10-01T00:00:00Z', TODAY), true);
  assert.equal(shouldSnapshot('2026-08-01T00:00:00Z', TODAY), false);
  assert.equal(shouldSnapshot('2026-08-01T00:00:00Z', new Date('2026-10-12T06:00:00Z')), true);
  assert.equal(shouldSnapshot(null, TODAY), true);
  assert.equal(isoDay(TODAY), '2026-10-13');
});
