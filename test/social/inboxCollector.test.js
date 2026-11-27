const test = require('node:test');
const assert = require('node:assert/strict');
const { collectMessages, formatSummary, shouldNotify, realErrors, hourBogota, resolveTenant, contactTag } = require('../../services/social/inboxCollector');
const { createFakeDb } = require('./fakeDb');

function licenses(map) {
  const data = new Map(Object.entries(map).map(([id, products]) => [id, { id, active: products !== 'SUSPENDED', products: new Set(products === 'SUSPENDED' ? ['SOCIAL', 'CRM'] : products) }]));
  return async () => ({ success: true, data });
}

const KATE = {
  conversationId: 'c1', contactId: 'u1', contactName: '@kate',
  messages: [
    { id: 'm0', direction: 'OUTBOUND', body: 'Bienvenida', sentAt: '2026-11-19T13:00:00.000Z' },
    { id: 'm1', direction: 'INBOUND', body: '¿Cuánto vale el tour?', sentAt: '2026-11-19T14:00:00.000Z' }
  ]
};
const RESPONDIDA = {
  conversationId: 'c2', contactId: 'u2', contactName: null,
  messages: [
    { id: 'n1', direction: 'INBOUND', body: null, sentAt: '2026-11-19T10:00:00.000Z' },
    { id: 'n2', direction: 'OUTBOUND', body: 'Gracias', sentAt: '2026-11-19T11:00:00.000Z' }
  ]
};

function fakeCrm(overrides = {}) {
  const calls = [];
  const crm = {
    calls,
    listProspects: async () => ({ success: true, data: [{ id: 7, tags: ['fb:u2', 'otro'] }] }),
    createProspect: async (d) => { calls.push(['create', d]); return { success: true, data: { id: 50, tags: [] } }; },
    updateTags: async (id, tags) => { calls.push(['tags', id, tags]); return { success: true }; },
    recordMessages: async (id, msgs) => { calls.push(['msgs', id, msgs]); return { success: true }; },
    ...overrides
  };
  return crm;
}

const INBOX = { fetchConversations: async (p) => (p === 'instagram' ? [KATE] : [RESPONDIDA]) };

test('guarda los mensajes, pasa los nuevos al CRM y lista los sin responder', async () => {
  const db = createFakeDb();
  const crm = fakeCrm();
  const outcome = await collectMessages({ db, inbox: INBOX, crm, loadLicenses: licenses({ 1: ['SOCIAL', 'CRM'] }) }, { SOCIAL_INBOX_TENANT_ID: '1' });
  assert.equal(outcome.success, true);
  const r = outcome.result;
  assert.equal(r.conversaciones, 2);
  assert.equal(r.nuevos, 4);
  assert.deepEqual(r.sinResponder.map((s) => s.contacto), ['@kate'], 'la que ya se respondió no avisa');
  assert.deepEqual(r.crm.creados, ['@kate']);
  assert.deepEqual(r.crm.actualizados, ['fb:u2'], 'el prospecto con etiqueta fb:u2 ya existía');
  const create = crm.calls.find((c) => c[0] === 'create')[1];
  assert.equal(create.fuente, 'INSTAGRAM');
  assert.match(create.resumen, /Cuánto vale el tour/);
  assert.deepEqual(crm.calls.find((c) => c[0] === 'tags')[2], ['ig:u1', 'redes']);
  const msgs7 = crm.calls.find((c) => c[0] === 'msgs' && c[1] === 7)[2];
  assert.deepEqual(msgs7.map((m) => m.body), ['Gracias'], 'los mensajes sin texto no van al CRM');
  const insert = db.calls.find((c) => /INSERT INTO social\.message/.test(c.sql));
  assert.deepEqual(insert.params.slice(0, 5), ['1', 'instagram', 'c1', 'm0', 'u1']);
  assert.match(insert.sql, /ON CONFLICT \(tenant_id, platform, platform_message_id\) DO NOTHING/);
  assert.equal(db.calls.at(-1).params[1], 'OK');
  assert.equal(shouldNotify(outcome), true);
});

test('mensajes ya guardados no se repiten, no van al CRM ni avisan', async () => {
  const db = createFakeDb([[/INSERT INTO social\.message/, []]]);
  const crm = fakeCrm();
  const outcome = await collectMessages({ db, inbox: INBOX, crm, loadLicenses: licenses({ 1: ['SOCIAL', 'CRM'] }) }, { SOCIAL_INBOX_TENANT_ID: '1' });
  assert.equal(outcome.result.nuevos, 0);
  assert.equal(outcome.result.sinResponder.length, 0);
  assert.equal(crm.calls.length, 0);
  assert.equal(shouldNotify(outcome), false);
});

test('sin licencia SOCIAL no lee nada; sin CRM guarda pero no toca Lion Platform', async () => {
  let db = createFakeDb();
  let fetched = 0;
  const inbox = { fetchConversations: async () => { fetched += 1; return [KATE]; } };
  let outcome = await collectMessages({ db, inbox, crm: fakeCrm(), loadLicenses: licenses({ 1: ['CRM'] }) }, { SOCIAL_INBOX_TENANT_ID: '1' });
  assert.equal(fetched, 0);
  assert.equal(db.calls.at(-1).params[1], 'SKIPPED');

  outcome = await collectMessages({ db, inbox, crm: fakeCrm(), loadLicenses: licenses({ 1: 'SUSPENDED' }) }, { SOCIAL_INBOX_TENANT_ID: '1' });
  assert.equal(fetched, 0, 'un tenant suspendido tampoco');

  db = createFakeDb();
  const crm = fakeCrm();
  outcome = await collectMessages({ db, inbox, crm, loadLicenses: licenses({ 1: ['SOCIAL'] }) }, { SOCIAL_INBOX_TENANT_ID: '1' });
  assert.equal(outcome.result.crm.omitido, 'el tenant no tiene licencia CRM');
  assert.equal(crm.calls.length, 0);
  assert.match(formatSummary(outcome), /CRM: el tenant no tiene licencia CRM/);
});

test('falla cerrado sin licencias y sin tenant; errores por red no frenan la otra', async () => {
  const db = createFakeDb();
  let outcome = await collectMessages({ db, inbox: INBOX, crm: fakeCrm(), loadLicenses: async () => ({ success: false, error: 'API dormida' }) }, {});
  assert.equal(outcome.success, false);
  assert.equal(db.calls.at(-1).params[1], 'FAILED');
  const MORNING = new Date('2026-11-27T12:43:00Z'); // 7:43 a. m. en Bogotá
  const NOON = new Date('2026-11-27T17:43:00Z'); // 12:43 p. m.
  assert.equal(shouldNotify(outcome, MORNING), true, 'una falla real se avisa en la corrida de la mañana');
  assert.equal(shouldNotify(outcome, NOON), false, 'y no cada 2 horas');

  outcome = await collectMessages({ db: createFakeDb([[/SELECT DISTINCT tenant_id/, [{ tenant_id: 1 }, { tenant_id: 2 }]]]), inbox: INBOX, crm: fakeCrm(), loadLicenses: licenses({ 1: ['SOCIAL'] }) }, {});
  assert.equal(outcome.success, false);
  assert.match(outcome.error, /SOCIAL_INBOX_TENANT_ID/);

  const inbox = { fetchConversations: async (p) => { if (p === 'facebook') throw new Error('falta pages_messaging'); return [KATE]; } };
  const db2 = createFakeDb([[/SELECT DISTINCT tenant_id/, [{ tenant_id: 1 }]]]);
  outcome = await collectMessages({ db: db2, inbox, crm: fakeCrm(), loadLicenses: licenses({ 1: ['SOCIAL', 'CRM'] }) }, {});
  assert.equal(outcome.success, true);
  assert.deepEqual(outcome.result.errores, ['facebook: falta pages_messaging']);
  assert.equal(outcome.result.sinResponder.length, 1);
  assert.equal(db2.calls.at(-1).params[1], 'PARTIAL');
  assert.equal(shouldNotify(outcome, new Date('2026-11-27T17:43:00Z')), true, 'mensaje nuevo sin responder: se avisa a cualquier hora');
});

test('sin redes conectadas no llega nada (Johan, 27 nov 2026); fallas reales solo en la mañana', () => {
  const MORNING = new Date('2026-11-27T12:43:00Z');
  const empty = (errores, extra = {}) => ({ success: true, ...extra, result: { sinResponder: [], errores } });
  const sinLlaves = empty(['instagram: Faltan FB_PAGE_ACCESS_TOKEN o FB_PAGE_ID para leer los mensajes de redes.', 'facebook: Faltan FB_PAGE_ACCESS_TOKEN o FB_PAGE_ID para leer los mensajes de redes.']);
  assert.equal(shouldNotify(sinLlaves, MORNING), false, 'faltan llaves de Meta: no es una falla');
  assert.equal(shouldNotify(empty(['Tenant 1 sin licencia SOCIAL activa: no se leen sus mensajes.']), MORNING), false);
  assert.equal(shouldNotify({ success: false, error: 'No sé de qué tenant es la cuenta conectada: define SOCIAL_INBOX_TENANT_ID.', result: { sinResponder: [], errores: [] } }, MORNING), false);
  assert.equal(shouldNotify(empty(['instagram: Meta respondió 500']), MORNING), true);
  assert.equal(shouldNotify(empty(['instagram: Meta respondió 500']), new Date('2026-11-27T21:43:00Z')), false);
  assert.equal(shouldNotify(empty(['instagram: Meta respondió 500']), MORNING, 9), false, 'la hora de la mañana se puede cambiar');
  assert.deepEqual(realErrors(['Falta la variable de entorno YOUTUBE_API_KEY.', 'timeout']), ['timeout']);
  assert.equal(hourBogota(MORNING), 7);
});

test('errores del CRM quedan registrados sin frenar la escucha', async () => {
  let crm = fakeCrm({ listProspects: async () => ({ success: false, error: '401' }) });
  let outcome = await collectMessages({ db: createFakeDb(), inbox: INBOX, crm, loadLicenses: licenses({ 1: ['SOCIAL', 'CRM'] }) }, { SOCIAL_INBOX_TENANT_ID: '1' });
  assert.match(outcome.result.crm.omitido, /401/);
  assert.equal(outcome.result.nuevos, 4);

  crm = fakeCrm({
    createProspect: async () => ({ success: false, error: 'sin cupo' }),
    recordMessages: async () => ({ success: false, error: 'timeout' })
  });
  outcome = await collectMessages({ db: createFakeDb(), inbox: INBOX, crm, loadLicenses: licenses({ 1: ['SOCIAL', 'CRM'] }) }, { SOCIAL_INBOX_TENANT_ID: '1' });
  assert.deepEqual(outcome.result.errores, ['@kate (CRM): sin cupo', 'fb:u2 (mensajes): timeout']);

  crm = fakeCrm({ updateTags: async () => ({ success: false, error: 'tags caídos' }), listProspects: async () => ({ success: true, data: [{ id: 3 }] }) });
  const only = { fetchConversations: async (p) => (p === 'instagram' ? [{ ...KATE, contactName: null, messages: [{ id: 'z', direction: 'INBOUND', body: null, sentAt: '2026-11-19T14:00:00.000Z' }] }] : []) };
  outcome = await collectMessages({ db: createFakeDb(), inbox: only, crm, loadLicenses: licenses({ 1: ['SOCIAL', 'CRM'] }) }, { SOCIAL_INBOX_TENANT_ID: '1' });
  assert.deepEqual(outcome.result.errores, ['ig:u1 (etiquetas): tags caídos']);
  const created = crm.calls.find((c) => c[0] === 'create')[1];
  assert.equal(created.nombre, 'ig:u1', 'sin nombre visible se usa la etiqueta');
  assert.match(created.resumen, /Conversación por instagram/);
  assert.match(formatSummary(outcome), /instagram ig:u1: \(sin texto: foto, audio o sticker\)/);
});

test('resolveTenant y formato del aviso', async () => {
  assert.equal(await resolveTenant(createFakeDb(), { SOCIAL_INBOX_TENANT_ID: 9 }), '9');
  assert.equal(await resolveTenant(createFakeDb([[/SELECT DISTINCT/, [{ tenant_id: 4 }]]]), {}), '4');
  assert.equal(await resolveTenant(createFakeDb(), {}), null);
  assert.equal(contactTag('facebook', '12'), 'fb:12');

  const long = 'a'.repeat(130);
  const text = formatSummary({ success: true, result: {
    conversaciones: 1, nuevos: 1,
    sinResponder: [{ plataforma: 'instagram', contacto: '@kate', texto: long }],
    crm: { creados: ['@kate'], actualizados: [], omitido: null },
    errores: ['facebook: x']
  } });
  assert.match(text, /1 nuevo\(s\) en 1 conversación/);
  assert.match(text, new RegExp(`"${'a'.repeat(120)}…"`));
  assert.match(text, /Prospectos nuevos en Lion Platform: @kate/);
  assert.match(text, /⚠️ facebook: x/);
});

test('usa las dependencias reales cuando no se inyectan', async () => {
  const realDeps = require('../../services/social/inboxCollector');
  assert.equal(typeof realDeps.saveConversation, 'function');
  const db = createFakeDb();
  const fresh = await realDeps.saveConversation(db, '1', 'instagram', KATE);
  assert.equal(fresh.length, 2);
});
