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
  const ok = await plan.generateFollowUpPlan({ listProspects: async () => ({ success: true, data: P }) }, { today: TODAY });
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
