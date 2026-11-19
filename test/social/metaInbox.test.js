const test = require('node:test');
const assert = require('node:assert/strict');
const metaInbox = require('../../services/social/connectors/metaInbox');

test.beforeEach(() => {
  process.env.META_GRAPH_BASE_URL = 'https://graph.test/v21.0';
  process.env.FB_PAGE_ACCESS_TOKEN = 'tok';
  process.env.FB_PAGE_ID = 'PAGE';
  process.env.IG_BUSINESS_ACCOUNT_ID = 'IG';
  delete process.env.IG_ACCESS_TOKEN;
});

const IG_CONV = {
  id: 'c1',
  participants: { data: [{ id: 'IG', username: 'rutadeviajelion' }, { id: 'u1', username: 'kate' }] },
  messages: { data: [
    { id: 'm2', message: '¿Cuánto vale el tour?', created_time: '2026-11-19T15:00:00+0000', from: { id: 'u1', username: 'kate' } },
    { id: 'm1', message: 'Hola', created_time: '2026-11-19T14:00:00+0000', from: { id: 'u1', username: 'kate' } },
    { id: 'm0', message: 'Bienvenida', created_time: '2026-11-19T13:00:00+0000', from: { id: 'IG', username: 'rutadeviajelion' } },
    { id: 'roto' }
  ] }
};

test('normaliza: orden cronológico, dirección según el remitente y contacto', () => {
  const conv = metaInbox.normalizeConversation(IG_CONV, ['PAGE', 'IG']);
  assert.equal(conv.contactId, 'u1');
  assert.equal(conv.contactName, '@kate');
  assert.deepEqual(conv.messages.map((m) => [m.id, m.direction]), [['m0', 'OUTBOUND'], ['m1', 'INBOUND'], ['m2', 'INBOUND']]);
  assert.equal(conv.messages[2].sentAt, '2026-11-19T15:00:00.000Z');
  assert.equal(conv.messages[0].from, undefined, 'no se filtra el objeto from');
});

test('normaliza: sin participantes usa el remitente; mensaje sin texto queda en null; sin contacto → null', () => {
  const conv = metaInbox.normalizeConversation({
    id: 'c2',
    messages: { data: [{ id: 'x', created_time: '2026-11-19T10:00:00Z', from: { id: 'u9', name: 'Ana Pérez' } }] }
  }, ['PAGE']);
  assert.equal(conv.contactName, 'Ana Pérez');
  assert.equal(conv.messages[0].body, null);
  assert.equal(metaInbox.normalizeConversation({ id: 'c3', messages: { data: [] } }, ['PAGE']), null);
  assert.equal(metaInbox.normalizeConversation({ id: 'c4' }, ['PAGE']), null);
  assert.equal(metaInbox.displayName(null), null);
  assert.equal(metaInbox.displayName({ id: '1' }), null);
});

test('fetchConversations pide la bandeja correcta con el token de la página', async () => {
  let url;
  const convs = await metaInbox.fetchConversations('instagram', { getJson: async (u) => { url = decodeURIComponent(u); return { data: [IG_CONV, { id: 'vacía' }] }; } });
  assert.match(url, /^https:\/\/graph\.test\/v21\.0\/PAGE\/conversations\?platform=instagram&limit=25/);
  assert.match(url, /messages\.limit\(25\)\{id,message,created_time,from\}/);
  assert.match(url, /access_token=tok/);
  assert.equal(convs.length, 1);

  await metaInbox.fetchConversations('facebook', { getJson: async (u) => { url = u; return {}; } });
  assert.match(url, /platform=messenger/);
});

test('fetchConversations usa el getJson real por defecto y valida configuración y red', async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) });
  assert.deepEqual(await metaInbox.fetchConversations('facebook'), []);
  await assert.rejects(metaInbox.fetchConversations('tiktok', { getJson: async () => ({}) }), /sin bandeja/);
  delete process.env.FB_PAGE_ID;
  await assert.rejects(metaInbox.fetchConversations('instagram'), /FB_PAGE_ID/);
  process.env.FB_PAGE_ID = 'PAGE';
  delete process.env.FB_PAGE_ACCESS_TOKEN;
  process.env.IG_ACCESS_TOKEN = 'ig-tok';
  let url;
  await metaInbox.fetchConversations('instagram', { getJson: async (u) => { url = u; return { data: [] }; } });
  assert.match(url, /access_token=ig-tok/);
  delete process.env.META_GRAPH_BASE_URL;
  await metaInbox.fetchConversations('instagram', { getJson: async (u) => { url = u; return { data: [] }; } });
  assert.match(url, /^https:\/\/graph\.facebook\.com\/v21\.0\//);
});
