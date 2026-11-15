/**
 * Plan de seguimiento de la mañana (Johan, 15 nov 2026: "la idea es que en la mañana me
 * ayude con plan de seguimiento de los contactos").
 *
 * Toma los prospectos de Lion Platform con seguimiento para hoy o vencido, los ordena
 * (calientes primero, luego los que más llevan esperando) y para cada uno arma un
 * mensaje corto de WhatsApp listo para mandar, con su enlace wa.me. El mensaje lo
 * escribe Gemini a partir del próximo paso y el resumen; si no hay IA o falla, se
 * usa una plantilla. Johan revisa y manda él: aquí no se envía nada a nadie.
 */

const CLOSED_STAGES = new Set(['PERDIDO', 'CLIENTE_ACTIVO', 'CERRADO_GANADO', 'CERRADO_PERDIDO']);
const TEMP_ORDER = { HOT: 0, WARM: 1, COLD: 2 };
const TEMP_ICON = { HOT: '🔥', WARM: '🟡', COLD: '🔵' };
const DEFAULT_LIMIT = 8;

function digits(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return `57${d}`;
  return d.length >= 11 ? d : '';
}

function firstName(name) {
  const clean = String(name || '').replace(/\(.*?\)/g, '').trim();
  return clean.split(/\s+/)[0] || '';
}

/**
 * Prospectos que toca contactar hoy, en orden.
 * @param {Array<object>} prospects  respuesta de /prospects
 * @param {string} today  YYYY-MM-DD (Bogotá)
 */
function selectDue(prospects, today, limit = DEFAULT_LIMIT) {
  return (Array.isArray(prospects) ? prospects : [])
    .filter((p) => p && p.nextActionDate && p.nextActionDate <= today && !CLOSED_STAGES.has(p.stage) && digits(p.phone))
    .sort((a, b) => (TEMP_ORDER[a.temperature] ?? 3) - (TEMP_ORDER[b.temperature] ?? 3) || a.nextActionDate.localeCompare(b.nextActionDate))
    .slice(0, limit);
}

/** Mensaje de respaldo (sin IA): corto, con el nombre y una pregunta. */
function templateMessage(p) {
  const name = firstName(p.businessName);
  const hola = name ? `Hola ${name}` : 'Hola';
  return `${hola}, te escribe Johan de Service Store VIP 🦁 ¿Cómo vas con lo que hablamos? Si quieres lo retomamos hoy, ¿te queda bien?`;
}

function waLink(p, text) {
  return `https://wa.me/${digits(p.phone)}?text=${encodeURIComponent(text)}`;
}

/**
 * @param {Array<object>} items  prospectos seleccionados
 * @param {(prompt: string) => Promise<string>} [writer]  devuelve el texto de la IA (o lanza)
 * @returns {Promise<Array<{ p: object, text: string, fromAi: boolean }>>}
 */
async function writeMessages(items, writer) {
  const out = [];
  for (const p of items) {
    let text = '';
    if (writer) {
      try {
        const prompt = [
          'Escribe UN mensaje corto de WhatsApp (máximo 3 líneas, español de Colombia, cercano y profesional) para retomar el contacto con este prospecto.',
          'Lo firma Johan de Service Store VIP (bots de WhatsApp con IA y tecnología). Termina con una pregunta concreta. Sin precios, sin inventar datos, sin comillas.',
          `Nombre: ${p.businessName}`,
          `Próximo paso acordado: ${p.nextStep || 'retomar la conversación'}`,
          `Contexto: ${p.priorityReason || 'sin contexto'}`,
          `Temperatura: ${p.temperature || 'sin dato'}`
        ].join('\n');
        text = String(await writer(prompt) || '').trim().replace(/^["“]|["”]$/g, '');
      } catch (_) {
        text = '';
      }
    }
    out.push({ p, text: text || templateMessage(p), fromAi: Boolean(text) });
  }
  return out;
}

function formatPlan(planned, today) {
  if (!planned.length) return `🗓️ Plan de seguimiento ${today}\n✅ Hoy no hay contactos con seguimiento pendiente.`;
  const lines = [`🗓️ Plan de seguimiento ${today} — ${planned.length} contacto(s). Toca el enlace, revisa el mensaje y envíalo:`];
  planned.forEach(({ p, text }, i) => {
    const icon = TEMP_ICON[p.temperature] || '⚪';
    const late = p.nextActionDate < today ? ` (vencía ${p.nextActionDate})` : '';
    lines.push('');
    lines.push(`${i + 1}. ${icon} ${p.businessName}${late}`);
    if (p.nextStep) lines.push(`   👉 ${p.nextStep}`);
    lines.push(`   💬 ${text}`);
    lines.push(`   📲 ${waLink(p, text)}`);
  });
  return lines.join('\n');
}

/**
 * @param {{ listProspects: Function }} client
 * @param {{ today: string, writer?: Function, limit?: number }} opts
 */
async function generateFollowUpPlan(client, opts) {
  const res = await client.listProspects();
  if (!res.success) return { success: false, error: res.error };
  const due = selectDue(res.data, opts.today, opts.limit);
  const planned = await writeMessages(due, opts.writer);
  return { success: true, data: formatPlan(planned, opts.today), count: planned.length };
}

/** Escritor con Gemini (el mismo modelo del informe de ventas). Sin clave: sin IA. */
function geminiWriter() {
  if (!process.env.GEMINI_API_KEY) return undefined;
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-flash-latest' });
  return async (prompt) => (await model.generateContent(prompt)).response.text();
}

/** Hoy en Bogotá, YYYY-MM-DD. */
function todayBogota(now = new Date()) {
  return new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
}

module.exports = { generateFollowUpPlan, selectDue, writeMessages, formatPlan, templateMessage, waLink, digits, geminiWriter, todayBogota };
