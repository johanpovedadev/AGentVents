const test = require('node:test');
const assert = require('node:assert/strict');
const { importChats, formatSummary, phoneKey, cleanMessages } = require('../services/whatsappChatImporter');

function fakeClient(existing = [], overrides = {}) {
  const calls = { create: [], messages: [], next: [] };
  let nextId = 100;
  const client = {
    calls,
    listProspects: async () => ({ success: true, data: existing }),
    createProspect: async (d) => { calls.create.push(d); return { success: true, data: { id: nextId++, phone: d.telefono } }; },
    recordMessages: async (id, m) => { calls.messages.push({ id, m }); return { success: true, data: { saved: m.length } }; },
    updateNextAction: async (id, step, date) => { calls.next.push({ id, step, date }); return { success: true, data: {} }; },
    ...overrides
  };
  return client;
}

const kate = {
  nombre: 'Kate', telefono: '+57 321 449 7185', fuente: 'OTRO', etiqueta: 'blog',
  resumen: 'Termales con 3 niños', temperatura: 'warm', siguientePaso: 'Mandar opciones fáciles',
  fechaSeguimiento: '2026-11-16',
  mensajes: [
    { direction: 'INBOUND', body: 'Hola, vi tu blog', sentAt: '2026-11-10T16:35:00Z' },
    { direction: 'OUTBOUND', body: 'Hola Kate!', sentAt: '2026-11-10T16:35:30Z' },
    { direction: 'RARO', body: 'x', sentAt: '2026-11-10T16:36:00Z' }
  ]
};

test('phoneKey: el mismo número con o sin 57, espacios o signos', () => {
  assert.equal(phoneKey('+57 321 449 7185'), '3214497185');
  assert.equal(phoneKey('573214497185'), '3214497185');
  assert.equal(phoneKey('3214497185'), '3214497185');
  assert.equal(phoneKey('12'), '');
  assert.equal(phoneKey(undefined), '');
});

test('crea el prospecto nuevo con su resumen, guarda los mensajes y pone el seguimiento', async () => {
  const client = fakeClient();
  const r = await importChats([kate], client);
  assert.deepEqual(r.creados, ['Kate']);
  assert.equal(client.calls.create[0].canal, 'WHATSAPP');
  assert.equal(client.calls.create[0].resumen, '[blog] Termales con 3 niños');
  assert.equal(client.calls.messages[0].m.length, 2, 'descarta direcciones inválidas');
  assert.deepEqual(client.calls.next[0], { id: 100, step: 'Mandar opciones fáciles', date: '2026-11-16' });
});

test('si ya existe (mismo teléfono en otro formato) no lo duplica: solo actualiza', async () => {
  const client = fakeClient([{ id: 7, phone: '3214497185' }]);
  const r = await importChats([kate, { ...kate, nombre: 'Kate otra vez' }], client);
  assert.equal(client.calls.create.length, 0);
  assert.deepEqual(r.actualizados, ['Kate', 'Kate otra vez']);
  assert.equal(client.calls.messages[0].id, 7);
});

test('dos chats nuevos del mismo número en el mismo lote: se crea uno solo', async () => {
  const client = fakeClient();
  await importChats([kate, { ...kate }], client);
  assert.equal(client.calls.create.length, 1);
});

test('sin teléfono, fecha inválida o sin mensajes: no revienta', async () => {
  const client = fakeClient();
  const r = await importChats([
    { nombre: 'Sin número' },
    { nombre: 'Luis', telefono: '3001112233', fechaSeguimiento: 'mañana', temperatura: 'HOT' }
  ], client);
  assert.match(r.errores[0], /Sin número: sin teléfono/);
  assert.equal(client.calls.next.length, 0);
  assert.equal(client.calls.messages.length, 0);
  assert.deepEqual(r.calientes, ['Luis']);
});

test('si Lion Platform falla al leer, crear, guardar mensajes o seguimiento, lo reporta', async () => {
  let r = await importChats([kate], fakeClient([], { listProspects: async () => ({ success: false, error: 'caído' }) }));
  assert.match(r.errores[0], /caído/);
  r = await importChats([kate], fakeClient([], { createProspect: async () => ({ success: false, error: '400' }) }));
  assert.match(r.errores[0], /Kate: 400/);
  r = await importChats([kate], fakeClient([], {
    recordMessages: async () => ({ success: false, error: 'm' }),
    updateNextAction: async () => ({ success: false, error: 'n' })
  }));
  assert.equal(r.errores.length, 2);
  r = await importChats(null, fakeClient());
  assert.deepEqual(r.creados, []);
});

test('cleanMessages corta en los últimos 40 y limpia', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ direction: 'INBOUND', body: `m${i}`, sentAt: '2026-11-10T16:35:00Z' }));
  const out = cleanMessages(many);
  assert.equal(out.length, 40);
  assert.equal(out[0].body, 'm10');
  assert.deepEqual(cleanMessages('x'), []);
});

test('formatSummary: nuevos, actualizados, calientes y problemas', () => {
  const text = formatSummary({ creados: ['Kate'], actualizados: ['Sol'], calientes: ['Kate'], errores: ['Luis: sin teléfono'] });
  assert.match(text, /Nuevos: 1 \(Kate\)/);
  assert.match(text, /Actualizados: 1/);
  assert.match(text, /Calientes: Kate/);
  assert.match(text, /1 con problema/);
  assert.doesNotMatch(formatSummary({ creados: [], actualizados: [], calientes: [], errores: [] }), /Calientes|problema/);
});
