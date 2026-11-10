const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSocialReport, shortCaption } = require('../../services/social/socialReportService');
const { createFakeDb } = require('./fakeDb');

const licensed = async () => ({ success: true });
const recent = new Date(Date.now() - 2 * 86400000).toISOString();
const old = new Date(Date.now() - 20 * 86400000).toISOString();

function row(accountId, handle, isCompetitor, views, likes, publishedAt, caption = 'Video') {
  return { account_id: accountId, platform: 'instagram', handle, is_competitor: isCompetitor, caption, permalink: `https://ig/${handle}/${views}`, published_at: publishedAt, views, likes, comments: null };
}

test('arma el informe: seguidores, ganadores propios y de la competencia', async () => {
  const followers = [
    { id: 1, platform: 'instagram', handle: 'rutadeviajelion', is_competitor: false, actual: '4100', anterior: '4000' },
    { id: 2, platform: 'instagram', handle: 'viajerox', is_competitor: true, actual: '52000', anterior: null }
  ];
  const media = [
    ...['100', '100', '100', '100'].map((v) => row(1, 'rutadeviajelion', false, v, '5', old)),
    row(1, 'rutadeviajelion', false, '450', '9', recent, 'Islas del Rosario   en 1 día con un texto muy largo que se debe recortar para el chat'),
    ...[null, null, null].map(() => row(2, 'viajerox', true, null, '1000', old)),
    row(2, 'viajerox', true, null, '5000', recent, 'Hook de competencia')
  ];
  const db = createFakeDb([[/account_snapshot s WHERE/, followers], [/JOIN LATERAL/, media]]);
  const result = await generateSocialReport({ tenantId: 1, dias: 7 }, { db, requireProduct: licensed });

  assert.equal(result.success, true);
  assert.match(result.data, /Últimos 7 días/);
  assert.match(result.data, /instagram @rutadeviajelion: 4\.100 \(\+100\)/);
  assert.match(result.data, /\[competencia\] instagram @viajerox: 52\.000\n/);
  assert.match(result.data, /4\.5× vistas — @rutadeviajelion: "Islas del Rosario en 1 día con un texto muy largo que se…/);
  assert.match(result.data, /5× likes — @viajerox: "Hook de competencia"/);
  assert.match(result.data, /Poca muestra/);
  assert.equal(result.ganadores.length, 2);
  assert.deepEqual(db.calls[0].params, [1, 7]);
});

test('sin ganadores ni cuentas da mensajes claros; sin licencia no consulta la base', async () => {
  const followers = [{ id: 1, platform: 'youtube', handle: 'canal', is_competitor: false, actual: null, anterior: null }];
  const flat = Array.from({ length: 10 }, () => row(1, 'canal', false, '100', null, recent));
  const db = createFakeDb([[/account_snapshot s WHERE/, followers], [/JOIN LATERAL/, flat]]);
  process.env.SOCIAL_TENANT_ID = '1';
  const result = await generateSocialReport(undefined, { db, requireProduct: licensed });
  assert.match(result.data, /youtube @canal: s\/d/);
  assert.match(result.data, /Tus ganadores[^\n]*\n• Ninguno/);
  assert.doesNotMatch(result.data, /Poca muestra/);

  const empty = createFakeDb();
  assert.match((await generateSocialReport({ tenantId: 5 }, { db: empty, requireProduct: licensed })).data, /no hay cuentas registradas/);

  const blocked = createFakeDb();
  const denied = await generateSocialReport({ tenantId: 2 }, { db: blocked, requireProduct: async () => ({ success: false, error: 'sin licencia' }) });
  assert.equal(denied.error, 'sin licencia');
  assert.equal(blocked.calls.length, 0);

  delete process.env.SOCIAL_TENANT_ID;
  assert.match((await generateSocialReport({}, { db: empty, requireProduct: licensed })).error, /SOCIAL_TENANT_ID/);
  assert.equal(shortCaption(null), '(sin texto)');
});
