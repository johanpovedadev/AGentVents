const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../services/followUpPlan');
const { runScheduledReport } = require('../services/scheduledReports');

const TODAY = '2026-11-16';
const P = [
  { id: 1, businessName: 'Javier (API WhatsApp)', phone: '573202235442', temperature: 'HOT', nextActionDate: '2026-11-16', nextStep: 'Recuperar la cuenta y cobrar', stage: 'EN_NEGOCIACION' },
  { id: 2, businessName: 'Gym Campestre', phone: '3001112233', temperature: 'WARM', nextActionDate: '2026-09-07', nextStep: 'Llamar', stage: 'PROPUESTA_ENVIADA' },
  { id: 3, businessName: 'Bri Pilates', phone: '573142597781', temperature: 'WARM', nextActionDate: '2026-11-17', stage: 'CONTACTADO' },
  { id: 4, businessName: 'Perdido SAS', phone: '3009998877', temperature: 'HOT', nextActionDate: '2026-11-01', stage: 'PERDIDO' },
  { id: 5, businessName: 'Sin teléfono', phone: '', temperature: 'HOT', nextActionDate: '2026-11-01' },
  { id: 6, businessName: 'Frío', phone: '3005556677', temperature: 'COLD', nextActionDate: '2026-10-01' },
  { id: 7, businessName: 'Sin temperatura', phone: '3005556600', nextActionDate: '2026-10-01' }
];

test('selectDue: hoy o vencidos, sin cerrados ni sin teléfono, calientes primero y luego los más viejos', () => {
  const due = plan.selectDue(P, TODAY);
  assert.deepEqual(due.map((p) => p.id), [1, 2, 6, 7]);
  assert.deepEqual(plan.selectDue(P, TODAY, 2).map((p) => p.id), [1, 2]);
  assert.deepEqual(plan.selectDue(null, TODAY), []);
});

test('digits y waLink: 10 dígitos se completan con 57', () => {
  assert.equal(plan.digits('300 111 2233'), '573001112233');
  assert.equal(plan.digits('573202235442'), '573202235442');
  assert.equal(plan.digits('123'), '');
  assert.equal(plan.waLink({ phone: '3001112233' }, 'Hola Ana'), 'https://wa.me/573001112233?text=Hola%20Ana');
});

test('writeMessages: usa la IA (simulada) y si falla o no hay, la plantilla con el nombre', async () => {
  const prompts = [];
  const out = await plan.writeMessages([P[0], P[1]], async (prompt) => {
    prompts.push(prompt);
    if (prompt.includes('Gym')) throw new Error('sin cuota');
    return '"Hola Javier, ¿cómo va lo de la cuenta?"';
  });
  assert.equal(out[0].text, 'Hola Javier, ¿cómo va lo de la cuenta?');
  assert.equal(out[0].fromAi, true);
  assert.match(out[1].text, /^Hola Gym, te escribe Johan/);
  assert.equal(out[1].fromAi, false);
  assert.match(prompts[0], /Recuperar la cuenta y cobrar/);
  assert.match(prompts[0], /Sin precios/);
  const noAi = await plan.writeMessages([{ businessName: '' }]);
  assert.match(noAi[0].text, /^Hola, te escribe Johan/);
  const empty = await plan.writeMessages([P[0]], async () => '   ');
  assert.equal(empty[0].fromAi, false);
});

test('formatPlan: numerado, icono, vencido, próximo paso, mensaje y enlace', () => {
  const text = plan.formatPlan([{ p: P[1], text: 'Hola Gym' }, { p: { ...P[6] }, text: 'Hola' }], TODAY);
  assert.match(text, /2 contacto\(s\)/);
  assert.match(text, /1\. 🟡 Gym Campestre \(vencía 2026-09-07\)/);
  assert.match(text, /👉 Llamar/);
  assert.match(text, /💬 Hola Gym/);
  assert.match(text, /📲 https:\/\/wa\.me\/573001112233\?text=Hola%20Gym/);
  assert.match(text, /2\. ⚪ Sin temperatura/);
  assert.match(plan.formatPlan([], TODAY), /no hay contactos/);
});

test('generateFollowUpPlan: arma el plan o reporta el error de Lion Platform', async () => {
  const ok = await plan.generateFollowUpPlan({ listProspects: async () => ({ success: true, data: P }) }, { today: TODAY, newLimit: 0 });
  assert.equal(ok.success, true);
  assert.equal(ok.count, 4);
  const bad = await plan.generateFollowUpPlan({ listProspects: async () => ({ success: false, error: 'caído' }) }, { today: TODAY });
  assert.deepEqual(bad, { success: false, error: 'caído' });
});

test('geminiWriter sin clave no usa IA; todayBogota es la fecha de Bogotá', () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal(plan.geminiWriter(), undefined);
  process.env.GEMINI_API_KEY = 'clave-falsa';
  assert.equal(typeof plan.geminiWriter(), 'function');
  if (prev === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prev;
  assert.equal(plan.todayBogota(new Date('2026-11-16T04:00:00Z')), '2026-11-15');
  assert.equal(plan.todayBogota(new Date('2026-11-16T12:45:00Z')), '2026-11-16');
});

test('los seguimientos de la mañana mandan también el plan; si el plan falla, se reporta', async () => {
  const agent = { ejecutarAccion: async () => ({ success: true }) };
  let calls = 0;
  assert.deepEqual(await runScheduledReport('seguimientos', agent, { followUpPlan: async () => { calls++; return { success: true }; } }), { success: true });
  assert.equal(calls, 1);
  const r = await runScheduledReport('seguimientos', agent, { followUpPlan: async () => ({ success: false, error: 'x' }) });
  assert.match(r.error, /plan de seguimiento: x/);
  assert.match((await runScheduledReport('seguimientos', agent, { followUpPlan: async () => null })).error, /sin detalle/);
  await runScheduledReport('ventas', agent, { followUpPlan: async () => { calls++; return { success: true }; } });
  assert.equal(calls, 1, 'ventas no manda el plan');
});

// ---- Negocios nuevos y técnica "preguntar antes del precio" (Johan, 27 nov 2026) ----
const memStore = (init = {}) => { const st = { data: { ...init }, saves: 0 }; return { st, load: () => st.data, save: (d) => { st.data = { ...d }; st.saves++; } }; };
const NUEVOS = [
  { id: 101, businessName: 'Heladería La 80', businessType: 'Heladería', phone: '+573001110001', stage: 'POR_CONTACTAR', googleRating: 4.5 },
  { id: 102, businessName: 'Ferretería El Tornillo', businessType: 'Ferretería', phone: '3001110002', stage: 'POR_CONTACTAR', googleRating: 4.9 },
  { id: 103, businessName: "Storia D'Amore Calle 93", businessType: 'Restaurante', phone: '3001110003', stage: 'POR_CONTACTAR', googleRating: 4.7 },
  { id: 104, businessName: "Storia D'Amore Zona T", businessType: 'Restaurante italiano', phone: '3001110004', stage: 'POR_CONTACTAR', googleRating: 4.8 },
  { id: 105, businessName: 'Panadería Fija', businessType: 'Panadería', phone: '6015551234', stage: 'POR_CONTACTAR', googleRating: 5 },
  { id: 106, businessName: 'Ya contactado', businessType: 'Restaurante', phone: '3001110006', stage: 'POR_CONTACTAR', lastOutreachSentAt: '2026-11-23T20:00:00Z' },
  { id: 107, businessName: 'Con seguimiento', businessType: 'Restaurante', phone: '3001110007', stage: 'POR_CONTACTAR', nextActionDate: '2026-12-01' },
  { id: 108, businessName: 'Contactado', businessType: 'Restaurante', phone: '3001110008', stage: 'CONTACTADO' }
];

test('selectNew: comida primero, una sede por cadena, solo celulares, nunca contactados ni ya sugeridos', () => {
  const picked = plan.selectNew(NUEVOS, { today: '2026-11-30' });
  assert.deepEqual(picked.map((p) => p.id), [104, 101, 102], 'la cadena va una sola vez (la mejor calificada); el fijo no; los contactados no');
  const again = plan.selectNew(NUEVOS, { today: '2026-11-30', suggested: { 104: '2026-11-28' } });
  assert.deepEqual(again.map((p) => p.id), [103, 101, 102], 'si ya se sugirió hace poco, entra la otra sede');
  const later = plan.selectNew(NUEVOS, { today: '2026-12-30', suggested: { 104: '2026-11-28' } });
  assert.equal(later[0].id, 104, 'después de 3 semanas se puede volver a sugerir');
  assert.deepEqual(plan.selectNew(NUEVOS, { today: '2026-11-30', limit: 1 }).map((p) => p.id), [104]);
  assert.deepEqual(plan.selectNew(null, { today: '2026-11-30' }), []);
  assert.equal(plan.mobile('6015551234'), '');
  assert.equal(plan.mobile('3001110001'), '573001110001');
});

test('primer mensaje: IA simulada con la técnica de preguntas; sin IA, plantilla sin precio que termina en pregunta', async () => {
  const prompts = [];
  const ai = await plan.writeFirstMessages([NUEVOS[0], NUEVOS[1]], async (prompt) => {
    prompts.push(prompt);
    return prompt.includes('Ferretería') ? 'Hola, vale $39.000 al mes' : 'Hola Heladería La 80, soy Johan... ¿quién les contesta cuando están llenos?';
  });
  assert.equal(ai[0].fromAi, true);
  assert.equal(ai[1].fromAi, false, 'si la IA mete un precio, se usa la plantilla');
  assert.match(prompts[0], /sin precios/);
  assert.match(prompts[0], /UNA pregunta sobre SU problema/);
  assert.match(prompts[0], /nunca con "¿les muestro\?"/);
  const tpl = await plan.writeFirstMessages(NUEVOS.slice(0, 4));
  for (const { text } of tpl) {
    assert.doesNotMatch(text, /\$|https?:/);
    assert.match(text, /\?$/);
    assert.match(text, /5 cupos de fundador/);
  }
  assert.equal(new Set(tpl.map((t) => t.text.split('.')[0])).size, 4, 'cada negocio con un saludo distinto');
  const failing = await plan.writeFirstMessages([NUEVOS[0]], async () => { throw new Error('sin cuota'); });
  assert.equal(failing[0].fromAi, false);
});

test('seguimientos: los nuevos van con preguntas; los que venían de antes, seguimiento normal', async () => {
  assert.equal(plan.usesQuestions({ lastOutreachSentAt: '2026-11-27T14:00:00Z' }), true);
  assert.equal(plan.usesQuestions({ lastOutreachSentAt: '2026-11-23T20:00:00Z' }), false);
  assert.equal(plan.usesQuestions({}), false);
  const prompts = [];
  await plan.writeMessages([{ businessName: 'Nuevo', lastOutreachSentAt: '2026-11-28' }, { businessName: 'Viejo', lastOutreachSentAt: '2026-11-20' }], async (p) => { prompts.push(p); return 'ok'; });
  assert.match(prompts[0], /PREGUNTAR ANTES DEL PRECIO/);
  assert.match(prompts[0], /llamada de 15 minutos/);
  assert.match(prompts[1], /Seguimiento normal/);
  for (const p of prompts) assert.match(p, /ACUERDO concreto del siguiente paso/, 'regla de Johan: siempre llegar a acuerdos');
});

test('el plan trae los negocios nuevos con enlace, recuerda las 3 preguntas y guarda los sugeridos', async () => {
  const store = memStore();
  const res = await plan.generateFollowUpPlan({ listProspects: async () => ({ success: true, data: [...P, ...NUEVOS] }) }, { today: '2026-11-30', store, newLimit: 2 });
  assert.equal(res.success, true);
  assert.equal(res.newCount, 2);
  assert.match(res.data, /Plan de seguimiento 2026-11-30/);
  assert.match(res.data, /🆕 2 negocios nuevos para hoy/);
  assert.match(res.data, /1\. Storia D'Amore Zona T — Restaurante italiano · ⭐ 4\.8/);
  assert.match(res.data, /📲 https:\/\/wa\.me\/573001110004\?text=/);
  assert.match(res.data, /no des el precio todavía/);
  assert.match(res.data, /🤝 Regla: cada conversación termina en un ACUERDO concreto/);
  assert.deepEqual(store.st.data, { 104: '2026-11-30', 101: '2026-11-30' });
  const next = await plan.generateFollowUpPlan({ listProspects: async () => ({ success: true, data: NUEVOS }) }, { today: '2026-12-01', store, newLimit: 2 });
  assert.doesNotMatch(next.data, /Zona T/, 'al otro día no se repiten');
  const none = await plan.generateFollowUpPlan({ listProspects: async () => ({ success: true, data: [] }) }, { today: '2026-12-01', store: memStore() });
  assert.match(none.data, /Ya no quedan negocios por contactar/);
});

test('fileStore guarda y lee el registro; si no existe, empieza vacío', () => {
  const os = require('os');
  const path = require('path');
  const file = path.join(os.tmpdir(), `ventas_${process.pid}_${Date.now()}`, 'sugeridos.json');
  const st = plan.fileStore(file);
  assert.deepEqual(st.load(), {});
  st.save({ 1: '2026-11-30' });
  assert.deepEqual(st.load(), { 1: '2026-11-30' });
});
